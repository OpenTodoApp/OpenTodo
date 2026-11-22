// node --test scripts/release/appstore.test.mjs  (make repo-check; OpenSpec change ios-distribution 4.5)
// The version and build-number mapping, the API token, and each command against a fake App Store
// Connect: registration that is safe to repeat, an identifier another team holds, the signing
// material and its cleanup, a profile without the App Group, and "What to test".
import assert from 'node:assert/strict'
import { createVerify, generateKeyPairSync } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import {
  APP_GROUP,
  buildNumber,
  cleanup,
  client,
  dryRun,
  marketingVersion,
  nextBuildNumber,
  normalizeKey,
  prepareSigning,
  retireOldestCertificate,
  register,
  registerReport,
  setWhatToTest,
  submitForReview,
  token,
  versionBelow,
  waitForProcessing,
  whatToTest,
  whatsNew,
  WHATS_NEW_LIMIT,
} from './appstore.mjs'

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const p8 = privateKey.export({ type: 'pkcs8', format: 'pem' })
const credentials = { keyId: 'KEY123', issuerId: 'issuer-uuid', p8 }
const dirs = []
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })))

test('the version and build number follow the Android version code', () => {
  assert.deepEqual(marketingVersion('v1.2.0'), { version: '1.2.0', code: 10200 })
  assert.deepEqual(marketingVersion('v0.20.3'), { version: '0.20.3', code: 2003 })
  assert.deepEqual(marketingVersion('1.1.1'), { version: '1.1.1', code: 10101 })
  // A release candidate or a commit after a tag (git describe) uploads under the tag's version.
  assert.deepEqual(marketingVersion('v1.2.0-rc.1'), { version: '1.2.0', code: 10200 })
  assert.deepEqual(marketingVersion('v1.2.0-4-gabcdef0'), { version: '1.2.0', code: 10200 })
  assert.equal(marketingVersion('main'), null)
  assert.equal(marketingVersion('v1.100.0'), null, 'a minor over 99 would collide with the next major')
  assert.equal(buildNumber(10200), '10200')
  assert.equal(buildNumber(10200, 2), '10200.2')
})

test('a re-upload of a version takes the next free build number', () => {
  assert.equal(nextBuildNumber(10200, []), '10200')
  assert.equal(nextBuildNumber(10200, ['10200']), '10200.1')
  assert.equal(nextBuildNumber(10200, ['10200', '10200.1', '10200.3']), '10200.4')
  assert.equal(nextBuildNumber(10200, ['10200.2']), '10200.3')
  // Numbers outside the scheme (an upload from Xcode by hand) are left alone.
  assert.equal(nextBuildNumber(10200, ['7', '102001', '10200.x', '10200.1.2']), '10200')
})

test('the token is an ES256 JWT for App Store Connect that lives under 20 minutes', () => {
  const now = Date.UTC(2026, 10, 8, 12)
  const [head, claims, sig] = token(credentials, now).split('.')
  assert.deepEqual(JSON.parse(Buffer.from(head, 'base64url')), { alg: 'ES256', kid: 'KEY123', typ: 'JWT' })
  const c = JSON.parse(Buffer.from(claims, 'base64url'))
  assert.equal(c.iss, 'issuer-uuid')
  assert.equal(c.aud, 'appstoreconnect-v1')
  assert.ok(c.exp - c.iat <= 1200)
  const ok = createVerify('sha256').update(`${head}.${claims}`).verify({ key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url'))
  assert.ok(ok, 'the signature verifies with the key')
})

test('a key pasted with literal \\n or CRLF still works, anything else is refused by name', () => {
  assert.equal(normalizeKey(p8.replace(/\n/g, '\\n')), p8)
  assert.equal(normalizeKey(p8.replace(/\n/g, '\r\n')), p8)
  assert.throws(() => normalizeKey('KEY123'), /ASC_KEY_P8 is not the content of an App Store Connect \.p8 key/)
})

// A fake App Store Connect: a request log and handlers keyed by "METHOD path-without-query".
function fakeAsc(handlers) {
  const calls = []
  const fetchImpl = async (url, init) => {
    const u = new URL(url)
    const key = `${init.method} ${u.pathname}`
    calls.push({ key, query: u.search, body: init.body ? JSON.parse(init.body) : null, auth: init.headers.authorization })
    const h = handlers[key]
    const [status, body] = h ? h(u, init.body ? JSON.parse(init.body) : null) : [404, { errors: [{ code: 'NOT_FOUND', detail: `no handler for ${key}` }] }]
    return new Response(body == null ? null : JSON.stringify(body), { status })
  }
  return { calls, call: client(credentials, { fetchImpl, api: 'https://asc.test' }) }
}

const bundle = (id, identifier, seedId = 'TEAM123456') => ({ type: 'bundleIds', id, attributes: { identifier, seedId } })

test('register adds what is missing, keeps what exists, and says what to do by hand', async () => {
  const registered = { 'app.open-todo.ios': bundle('B1', 'app.open-todo.ios') }
  const caps = { B1: ['APP_GROUPS'] }
  let n = 1
  const { calls, call } = fakeAsc({
    'GET /v1/bundleIds': (u) => {
      const id = u.searchParams.get('filter[identifier]')
      // Apple's filter also matches longer identifiers: only the exact one counts.
      return [200, { data: Object.values(registered).filter((b) => b.attributes.identifier.startsWith(id)) }]
    },
    'POST /v1/bundleIds': (_, body) => {
      const b = bundle(`B${++n}`, body.data.attributes.identifier)
      registered[b.attributes.identifier] = b
      caps[b.id] = []
      return [201, { data: b }]
    },
    ...Object.fromEntries(['B1', 'B2', 'B3'].map((id) => [`GET /v1/bundleIds/${id}/bundleIdCapabilities`, () => [200, { data: (caps[id] ?? []).map((t) => ({ attributes: { capabilityType: t } })) }]])),
    'POST /v1/bundleIdCapabilities': (_, body) => {
      caps[body.data.relationships.bundleId.data.id].push(body.data.attributes.capabilityType)
      return [201, { data: {} }]
    },
    'GET /v1/apps': () => [200, { data: [] }],
  })
  const first = await register(call, { team: 'TEAM123456' })
  assert.deepEqual(
    first.rows.map((r) => [r.identifier, r.state]),
    [
      ['app.open-todo.ios', 'already registered'],
      ['app.open-todo.ios.widget', 'registered, APP_GROUPS turned on'],
      ['app.open-todo.ios.share', 'registered, APP_GROUPS turned on'],
    ],
  )
  assert.equal(first.app, null)
  const report = registerReport(first).join('\n')
  assert.match(report, /App record: none yet\. Create it in App Store Connect/)
  assert.ok(report.includes(`${APP_GROUP}: the API can neither create an App Group nor assign one`), 'the report names the App Group step')
  assert.match(calls[0].auth, /^Bearer [\w-]+\.[\w-]+\.[\w-]+$/)

  const writes = calls.filter((c) => c.key.startsWith('POST')).length
  const again = await register(call, { team: 'TEAM123456' })
  assert.ok(again.rows.every((r) => r.state === 'already registered'), 'a second run changes nothing')
  assert.equal(calls.filter((c) => c.key.startsWith('POST')).length, writes, 'and writes nothing')
})

test('an identifier held by another team names the fix', async () => {
  const { call } = fakeAsc({
    'GET /v1/bundleIds': () => [200, { data: [] }],
    'POST /v1/bundleIds': () => [409, { errors: [{ status: '409', code: 'ENTITY_ERROR.ATTRIBUTE.INVALID', detail: "An App ID with Identifier 'app.open-todo.ios' is not available. Please enter a different string." }] }],
  })
  await assert.rejects(register(call), /app\.open-todo\.ios belongs to another Apple developer team .*is not available.*Pick a new prefix: change app\.open-todo\.ios in mobile\/ios\/project\.yml/)
})

test('a key of another team is reported', async () => {
  const warnings = []
  const { call } = fakeAsc({
    'GET /v1/bundleIds': (u) => [200, { data: [bundle('B1', u.searchParams.get('filter[identifier]'), 'OTHERTEAM1')] }],
    'GET /v1/bundleIds/B1/bundleIdCapabilities': () => [200, { data: [{ attributes: { capabilityType: 'APP_GROUPS' } }] }],
    'GET /v1/apps': () => [200, { data: [{ id: 'A1', attributes: { bundleId: 'app.open-todo.ios', name: 'OpenTodo' } }] }],
  })
  const res = await register(call, { team: 'TEAM123456', log: (level, m) => warnings.push(`${level} ${m}`) })
  assert.equal(res.app.id, 'A1')
  assert.match(warnings[0], /^warning app\.open-todo\.ios has team prefix OTHERTEAM1, but APPLE_TEAM_ID is TEAM123456/)
})

function signingAsc({ withGroup = true } = {}) {
  const profileXML = (identifier) => `<?xml version="1.0"?><plist><dict><key>Entitlements</key><dict><key>application-identifier</key><string>TEAM123456.${identifier}</string>${withGroup ? `<key>com.apple.security.application-groups</key><array><string>${APP_GROUP}</string></array>` : ''}</dict></dict></plist>`
  const deleted = []
  let p = 0
  const fake = fakeAsc({
    'POST /v1/certificates': (_, body) => {
      assert.equal(body.data.attributes.certificateType, 'DISTRIBUTION')
      assert.match(body.data.attributes.csrContent, /CERTIFICATE REQUEST/)
      return [201, { data: { id: 'C1', attributes: { certificateContent: Buffer.from('DER').toString('base64') } } }]
    },
    'GET /v1/bundleIds': (u) => [200, { data: [bundle(`B-${u.searchParams.get('filter[identifier]')}`, u.searchParams.get('filter[identifier]'))] }],
    'POST /v1/profiles': (_, body) => {
      const identifier = body.data.relationships.bundleId.data.id.slice(2)
      assert.equal(body.data.attributes.profileType, 'IOS_APP_STORE')
      assert.deepEqual(body.data.relationships.certificates.data, [{ type: 'certificates', id: 'C1' }])
      const envelope = Buffer.concat([Buffer.from([0x30, 0x82]), Buffer.from(profileXML(identifier)), Buffer.from([0, 1, 2])])
      return [201, { data: { id: `P${++p}`, attributes: { uuid: `uuid-${identifier}`, profileContent: envelope.toString('base64') } } }]
    },
    'DELETE /v1/profiles/P1': () => (deleted.push('P1'), [204, null]),
    'DELETE /v1/profiles/P2': () => (deleted.push('P2'), [204, null]),
    'DELETE /v1/profiles/P3': () => [404, { errors: [{ code: 'NOT_FOUND', detail: 'gone already' }] }],
    'DELETE /v1/certificates/C1': () => (deleted.push('C1'), [204, null]),
  })
  return { ...fake, deleted }
}

function signingDir() {
  const dir = mkdtempSync(join(tmpdir(), 'appstore-sign-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'csr.pem'), '-----BEGIN CERTIFICATE REQUEST-----\nfake\n-----END CERTIFICATE REQUEST-----\n')
  return dir
}

test('sign makes a certificate and three profiles, and cleanup removes exactly those', async () => {
  const dir = signingDir()
  const { call, deleted } = signingAsc()
  const res = await prepareSigning(call, { dir, team: 'TEAM123456', stamp: '42.1', log: () => {} })
  assert.deepEqual(res.profiles, { 'app.open-todo.ios': 'uuid-app.open-todo.ios', 'app.open-todo.ios.widget': 'uuid-app.open-todo.ios.widget', 'app.open-todo.ios.share': 'uuid-app.open-todo.ios.share' })
  assert.equal(readFileSync(join(dir, 'distribution.cer'), 'utf8'), 'DER')
  assert.ok(existsSync(join(dir, 'profiles', 'uuid-app.open-todo.ios.share.mobileprovision')))
  const options = readFileSync(join(dir, 'ExportOptions.plist'), 'utf8')
  assert.match(options, /<key>method<\/key>\n\t<string>app-store-connect<\/string>/)
  assert.match(options, /<key>signingStyle<\/key>\n\t<string>manual<\/string>/)
  assert.match(options, /<key>teamID<\/key>\n\t<string>TEAM123456<\/string>/)
  assert.match(options, /<key>app\.open-todo\.ios\.widget<\/key>\n\t\t<string>uuid-app\.open-todo\.ios\.widget<\/string>/)
  assert.match(options, /<key>manageAppVersionAndBuildNumber<\/key>\n\t<false\/>/, 'the build number is ours, not Xcode\'s')
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8')), { certificateId: 'C1', profileIds: ['P1', 'P2', 'P3'] })

  await cleanup(call, { dir, log: () => {} })
  assert.deepEqual(deleted, ['P1', 'P2', 'C1'], 'profiles first, then the certificate; one already gone is fine')
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8')), { certificateId: null, profileIds: [] })
  await cleanup(call, { dir, log: () => {} }) // nothing left: no call, no error
})

test('a profile without the App Group stops the run with the steps, and cleanup still finds everything', async () => {
  const dir = signingDir()
  const { call, deleted } = signingAsc({ withGroup: false })
  await assert.rejects(prepareSigning(call, { dir, team: 'TEAM123456', log: () => {} }), /do not carry the App Group group\.app\.open-todo\. The API cannot assign one: at developer\.apple\.com → Identifiers → App Groups/)
  await cleanup(call, { dir, log: () => {} })
  assert.deepEqual(deleted, ['P1', 'P2', 'C1'])
})

test('a key that may not make certificates is told to use the Admin role', async () => {
  const dir = signingDir()
  const { call } = fakeAsc({ 'POST /v1/certificates': () => [403, { errors: [{ code: 'FORBIDDEN_ERROR', detail: 'This request is forbidden for security reasons' }] }] })
  await assert.rejects(prepareSigning(call, { dir, team: 'TEAM123456', log: () => {} }), /\(403 FORBIDDEN_ERROR\): This request is forbidden.*make a key with the Admin role/)
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8')), { certificateId: null, profileIds: [] })
})

const CHANGELOG = `# Changelog

## [Unreleased]

## [1.2.0] - 2026-11-20

The **iPhone app** in [TestFlight](https://testflight.apple.com).

### Added

- Something new.

## [1.1.1] - 2026-11-07

- Older.
`

test('What to test is the version\'s CHANGELOG section, or a plain line between releases', () => {
  assert.equal(whatToTest(CHANGELOG, '1.2.0', '10200'), 'The iPhone app in TestFlight.\n\nAdded\n• Something new.')
  assert.match(whatToTest(CHANGELOG, '1.3.0', '10300'), /^OpenTodo 1\.3\.0, build 10300: a build between releases/)
})

test('What to test waits for the build, then sets the English notes', async () => {
  let looks = 0
  let patched = null
  const { call } = fakeAsc({
    'GET /v1/apps': () => [200, { data: [{ id: 'A1', attributes: { bundleId: 'app.open-todo.ios' } }] }],
    'GET /v1/builds': (u) => {
      assert.equal(u.searchParams.get('filter[version]'), '10200.1')
      assert.equal(u.searchParams.get('filter[preReleaseVersion.version]'), '1.2.0')
      return [200, { data: ++looks < 3 ? [] : [{ id: 'BUILD1' }] }]
    },
    'GET /v1/builds/BUILD1/betaBuildLocalizations': () => [200, { data: [{ id: 'L1', attributes: { locale: 'en-US' } }] }],
    'PATCH /v1/betaBuildLocalizations/L1': (_, body) => ((patched = body.data.attributes.whatsNew), [200, { data: {} }]),
  })
  const ok = await setWhatToTest(call, { version: '1.2.0', build: '10200.1', text: 'Notes', pause: async () => {}, log: () => {} })
  assert.equal(ok, true)
  assert.equal(looks, 3)
  assert.equal(patched, 'Notes')
})

test('a build that never shows up only warns', async () => {
  const logs = []
  const { call } = fakeAsc({
    'GET /v1/apps': () => [200, { data: [{ id: 'A1', attributes: { bundleId: 'app.open-todo.ios' } }] }],
    'GET /v1/builds': () => [200, { data: [] }],
  })
  const ok = await setWhatToTest(call, { version: '1.2.0', build: '10200', text: 'Notes', attempts: 2, pause: async () => {}, log: (l, m) => logs.push(`${l} ${m}`) })
  assert.equal(ok, false)
  assert.match(logs[0], /^warning build 10200 of 1\.2\.0 did not appear in App Store Connect in time/)
})

test('the certificate outlives Apple\'s processing: wait for VALID, fail on INVALID', async () => {
  const states = ['PROCESSING', 'PROCESSING', 'VALID']
  let looks = 0
  const { call } = fakeAsc({
    'GET /v1/apps': () => [200, { data: [{ id: 'A1', attributes: { bundleId: 'app.open-todo.ios' } }] }],
    'GET /v1/builds': () => [200, { data: looks === 0 ? (looks++, []) : [{ id: 'B1', attributes: { processingState: states[looks++ - 1] } }] }],
  })
  const logs = []
  assert.equal(await waitForProcessing(call, { version: '1.2.0', build: '10200', pause: async () => {}, log: (l, m) => logs.push(`${l} ${m}`) }), 'VALID')
  assert.equal(looks, 4, 'missing, processing twice, then valid')
  assert.match(logs[0], /^notice Apple processed build 10200 of 1\.2\.0: valid/)

  const refused = fakeAsc({
    'GET /v1/apps': () => [200, { data: [{ id: 'A1', attributes: { bundleId: 'app.open-todo.ios' } }] }],
    'GET /v1/builds': () => [200, { data: [{ id: 'B1', attributes: { processingState: 'INVALID' } }] }],
  })
  await assert.rejects(waitForProcessing(refused.call, { version: '1.2.0', build: '10200', pause: async () => {}, log: () => {} }), /Apple refused build 10200 of 1\.2\.0 \(INVALID\)/)

  const slow = fakeAsc({
    'GET /v1/apps': () => [200, { data: [{ id: 'A1', attributes: { bundleId: 'app.open-todo.ios' } }] }],
    'GET /v1/builds': () => [200, { data: [{ id: 'B1', attributes: { processingState: 'PROCESSING' } }] }],
  })
  const warned = []
  assert.equal(await waitForProcessing(slow.call, { version: '1.2.0', build: '10200', attempts: 3, pause: async () => {}, log: (l, m) => warned.push(l) }), null)
  assert.deepEqual(warned, ['warning'])
})

test('at the certificate limit, sign retires the oldest certificate of an earlier run and tries again', async () => {
  const dir = signingDir()
  let tries = 0
  const revoked = []
  const removed = []
  const profile = (id, name, cert, created) => ({ type: 'profiles', id, attributes: { name, createdDate: created }, relationships: { certificates: { data: [{ type: 'certificates', id: cert }] } } })
  const { call } = fakeAsc({
    'GET /v1/bundleIds': (u) => [200, { data: [bundle(`B-${u.searchParams.get('filter[identifier]')}`, u.searchParams.get('filter[identifier]'))] }],
    'POST /v1/certificates': () => (++tries === 1
      ? [409, { errors: [{ code: 'ENTITY_ERROR', detail: 'You already have a current Distribution certificate or a pending certificate request.' }] }]
      : [201, { data: { id: 'C9', attributes: { certificateContent: Buffer.from('DER').toString('base64') } } }]),
    'GET /v1/profiles': () => [200, { data: [
      profile('Pnew', 'OpenTodo CI app.open-todo.ios 7.1', 'Cnew', '2026-11-08T10:00:00Z'),
      profile('Pold1', 'OpenTodo CI app.open-todo.ios 3.1', 'Cold', '2026-11-01T10:00:00Z'),
      profile('Pold2', 'OpenTodo CI app.open-todo.ios.share 3.1', 'Cold', '2026-11-01T10:00:01Z'),
      profile('Phand', 'My own profile', 'Chand', '2025-01-01T00:00:00Z'),
    ] }],
    'DELETE /v1/certificates/Cold': () => (revoked.push('Cold'), [204, null]),
    'DELETE /v1/profiles/Pold1': () => (removed.push('Pold1'), [204, null]),
    'DELETE /v1/profiles/Pold2': () => [404, { errors: [{ code: 'NOT_FOUND', detail: 'gone with its certificate' }] }],
    'POST /v1/profiles': (_, body) => {
      const identifier = body.data.relationships.bundleId.data.id.slice(2)
      assert.ok(body.data.attributes.name.startsWith('OpenTodo CI '))
      const xml = `<plist><string>${APP_GROUP}</string><string>${identifier}</string></plist>`
      return [201, { data: { id: `N-${identifier}`, attributes: { uuid: `uuid-${identifier}`, profileContent: Buffer.from(xml).toString('base64') } } }]
    },
  })
  const res = await prepareSigning(call, { dir, team: 'TEAM123456', log: () => {} })
  assert.equal(res.certificateId, 'C9')
  assert.equal(tries, 2)
  assert.deepEqual(revoked, ['Cold'], 'the oldest certificate of an earlier run, never the one made by hand')
  assert.deepEqual(removed, ['Pold1'])
})

test('after retiring a certificate, sign asks again while Apple still counts it (v1.4.2)', async () => {
  const dir = signingDir()
  let tries = 0
  const waits = []
  const profile = (id, name, cert, created) => ({ type: 'profiles', id, attributes: { name, createdDate: created }, relationships: { certificates: { data: [{ type: 'certificates', id: cert }] } } })
  const { call } = fakeAsc({
    'GET /v1/bundleIds': (u) => [200, { data: [bundle(`B-${u.searchParams.get('filter[identifier]')}`, u.searchParams.get('filter[identifier]'))] }],
    'POST /v1/certificates': () => (++tries <= 3
      ? [409, { errors: [{ code: 'ENTITY_ERROR', detail: 'You already have a current Distribution certificate or a pending certificate request.' }] }]
      : [201, { data: { id: 'C9', attributes: { certificateContent: Buffer.from('DER').toString('base64') } } }]),
    'GET /v1/profiles': () => [200, { data: [profile('Pold', 'OpenTodo CI app.open-todo.ios 3.1', 'Cold', '2026-11-01T10:00:00Z')] }],
    'DELETE /v1/certificates/Cold': () => [204, null],
    'DELETE /v1/profiles/Pold': () => [204, null],
    'POST /v1/profiles': (_, body) => {
      const identifier = body.data.relationships.bundleId.data.id.slice(2)
      const xml = `<plist><string>${APP_GROUP}</string><string>${identifier}</string></plist>`
      return [201, { data: { id: `N-${identifier}`, attributes: { uuid: `uuid-${identifier}`, profileContent: Buffer.from(xml).toString('base64') } } }]
    },
  })
  const res = await prepareSigning(call, { dir, team: 'TEAM123456', log: () => {}, wait: async (ms) => { waits.push(ms) } })
  assert.equal(res.certificateId, 'C9')
  assert.equal(tries, 4, 'the first try, then three after retiring')
  assert.deepEqual(waits, [20000, 40000], 'a growing pause between the tries after retiring')
})

test('at the certificate limit with no certificate of an earlier run, sign stops and says what to do', async () => {
  const dir = signingDir()
  const { call, calls } = fakeAsc({
    'POST /v1/certificates': () => [409, { errors: [{ code: 'ENTITY_ERROR', detail: 'limit reached' }] }],
    'GET /v1/profiles': () => [200, { data: [{ type: 'profiles', id: 'Phand', attributes: { name: 'My own profile', createdDate: '2025-01-01T00:00:00Z' }, relationships: { certificates: { data: [{ type: 'certificates', id: 'Chand' }] } } }] }],
  })
  await assert.rejects(prepareSigning(call, { dir, team: 'TEAM123456', log: () => {} }), /none of them was made by this workflow: revoke an unused one/)
  assert.ok(!calls.some((c) => c.key.startsWith('DELETE')), 'nothing is revoked')
  assert.equal(await retireOldestCertificate(call, { log: () => {} }), null)
})

// ---- App Store submission (ios-distribution D10) ----

/** A fake App Store Connect for `submit`: the app, one build, versions, localizations and submissions. */
function store({ versions = [], build = { processingState: 'VALID', usesNonExemptEncryption: false }, locs = [{ id: 'loc-en', attributes: { locale: 'en-US', whatsNew: 'old' } }, { id: 'loc-de', attributes: { locale: 'de-DE', whatsNew: '' } }], attachedBuild = null, submissions = [], items = [] } = {}) {
  const calls = []
  const call = async (what, method, path, body) => {
    calls.push({ method, path, body })
    if (method === 'GET' && path.startsWith('/v1/apps?')) return { data: [{ id: 'app1', attributes: { bundleId: 'app.open-todo.ios', name: 'OpenTodo' } }] }
    if (method === 'GET' && path.startsWith('/v1/builds?')) return { data: [{ id: 'b1', attributes: build }] }
    if (method === 'GET' && path.startsWith('/v1/apps/app1/appStoreVersions')) return { data: versions }
    if (method === 'GET' && path.endsWith('/relationships/build')) return { data: attachedBuild }
    if (method === 'GET' && path.includes('/appStoreVersionLocalizations')) return { data: locs }
    if (method === 'GET' && path.startsWith('/v1/reviewSubmissions?')) return { data: submissions }
    if (method === 'GET' && path.includes('/items')) return { data: items }
    if (method === 'POST' && path === '/v1/appStoreVersions') return { data: { id: 'v-new', attributes: { ...body.data.attributes, appVersionState: 'PREPARE_FOR_SUBMISSION' } } }
    if (method === 'POST' && path === '/v1/reviewSubmissions') return { data: { id: 'sub-new', attributes: { state: 'READY_FOR_REVIEW' } } }
    if (method === 'GET') throw new Error(`unexpected GET ${path}`)
    return { data: { id: 'x', attributes: body?.data?.attributes ?? {} } }
  }
  const writes = () => calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.path}`)
  return { call, calls, writes }
}
const quiet = () => {}
const released = { id: 'v-old', attributes: { versionString: '1.5.0', appVersionState: 'READY_FOR_DISTRIBUTION', releaseType: 'AFTER_APPROVAL' } }

test('submit: a new version is created, released after approval, with What\'s New, the build and a submission', async () => {
  const s = store({ versions: [released] })
  const out = await submitForReview(s.call, { version: '1.6.0', build: '10600', notes: 'New things', log: quiet })
  assert.equal(out.state, 'submitted')
  assert.deepEqual(s.writes(), [
    'POST /v1/appStoreVersions',
    'PATCH /v1/appStoreVersionLocalizations/loc-en',
    'PATCH /v1/appStoreVersionLocalizations/loc-de',
    'PATCH /v1/appStoreVersions/v-new/relationships/build',
    'POST /v1/reviewSubmissions',
    'POST /v1/reviewSubmissionItems',
    'PATCH /v1/reviewSubmissions/sub-new',
  ])
  const create = s.calls.find((c) => c.path === '/v1/appStoreVersions').body.data
  assert.deepEqual(create.attributes, { platform: 'IOS', versionString: '1.6.0', releaseType: 'AFTER_APPROVAL' })
  assert.equal(s.calls.find((c) => c.path.endsWith('/loc-de')).body.data.attributes.whatsNew, 'New things')
  assert.deepEqual(s.calls.find((c) => c.path === '/v1/reviewSubmissions/sub-new').body.data.attributes, { submitted: true })
})

test('submit: a version already submitted, in review or approved is left alone', async () => {
  for (const state of ['WAITING_FOR_REVIEW', 'IN_REVIEW', 'PENDING_DEVELOPER_RELEASE', 'READY_FOR_DISTRIBUTION']) {
    const s = store({ versions: [released, { id: 'v16', attributes: { versionString: '1.6.0', appVersionState: state, releaseType: 'AFTER_APPROVAL' } }] })
    const out = await submitForReview(s.call, { version: '1.6.0', build: '10600', notes: 'New things', log: quiet })
    assert.equal(out.state, 'already-submitted', state)
    assert.deepEqual(s.writes(), [], `${state}: nothing written`)
  }
})

test('submit: a re-run after a half-done run writes only what is missing, and reuses the draft submission', async () => {
  const s = store({
    versions: [released, { id: 'v16', attributes: { versionString: '1.6.0', appVersionState: 'PREPARE_FOR_SUBMISSION', releaseType: 'AFTER_APPROVAL' } }],
    locs: [{ id: 'loc-en', attributes: { locale: 'en-US', whatsNew: 'New things' } }],
    attachedBuild: { type: 'builds', id: 'b1' },
    submissions: [{ id: 'sub1', attributes: { state: 'READY_FOR_REVIEW' } }],
    items: [{ id: 'i1', relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: 'v16' } } } }],
  })
  await submitForReview(s.call, { version: '1.6.0', build: '10600', notes: 'New things', log: quiet })
  assert.deepEqual(s.writes(), ['PATCH /v1/reviewSubmissions/sub1'])
})

test('submit: the one editable version is moved to the new marketing version instead of a second one', async () => {
  const s = store({ versions: [released, { id: 'v155', attributes: { versionString: '1.5.5', appVersionState: 'PREPARE_FOR_SUBMISSION', releaseType: 'MANUAL' } }] })
  await submitForReview(s.call, { version: '1.6.0', build: '10600', notes: 'New things', log: quiet })
  assert.ok(!s.writes().includes('POST /v1/appStoreVersions'), 'no second version')
  const move = s.calls.find((c) => c.method === 'PATCH' && c.path === '/v1/appStoreVersions/v155').body.data.attributes
  assert.deepEqual(move, { versionString: '1.6.0', releaseType: 'AFTER_APPROVAL' })
})

test('submit: the first version of the app gets no What\'s New (Apple allows none)', async () => {
  const s = store({ versions: [] })
  await submitForReview(s.call, { version: '1.6.0', build: '10600', notes: 'New things', log: quiet })
  assert.ok(!s.writes().some((w) => w.includes('appStoreVersionLocalizations')))
  assert.ok(s.writes().includes('PATCH /v1/reviewSubmissions/sub-new'))
})

test('submit: a build Apple has not processed submits nothing', async () => {
  const s = store({ versions: [released], build: { processingState: 'PROCESSING' } })
  const logs = []
  const out = await submitForReview(s.call, { version: '1.6.0', build: '10600', notes: 'x', log: (l, m) => logs.push(`${l}: ${m}`) })
  assert.equal(out.state, 'build-not-ready')
  assert.deepEqual(s.writes(), [])
  assert.match(logs.join('\n'), /warning: build 10600 of 1\.6\.0 is processing/)
})

test('submit: export compliance is answered as the build declares it (no non-exempt encryption)', async () => {
  const unanswered = store({ versions: [released], build: { processingState: 'VALID', usesNonExemptEncryption: null } })
  await submitForReview(unanswered.call, { version: '1.6.0', build: '10600', notes: 'x', log: quiet })
  assert.deepEqual(unanswered.calls.find((c) => c.path === '/v1/builds/b1').body.data.attributes, { usesNonExemptEncryption: false })
  const declared = store({ versions: [released], build: { processingState: 'VALID', usesNonExemptEncryption: true } })
  await assert.rejects(submitForReview(declared.call, { version: '1.6.0', build: '10600', notes: 'x', log: quiet }), /declares non-exempt encryption/)
  assert.deepEqual(declared.writes(), [])
})

test('submit --dry-run reads but writes nothing, and logs each write', async () => {
  const s = store({ versions: [released] })
  const logs = []
  const log = (l, m) => logs.push(m)
  const out = await submitForReview(dryRun(s.call, log), { version: '1.6.0', build: '10600', notes: 'x', log })
  assert.equal(out.state, 'submitted')
  assert.deepEqual(s.writes(), [], 'no write reached App Store Connect')
  assert.ok(logs.some((m) => /dry run: would be creating App Store version 1\.6\.0/.test(m)))
  assert.ok(logs.some((m) => /dry run: would be submitting 1\.6\.0 for review/.test(m)))
})

test("What's New is the version's changelog section as plain text, at most 4000 characters", () => {
  const changelog = '# Changelog\n\n## [1.6.0] - 2026-11-30\n\n### Fixed\n\n- **A thing works.** See [docs](https://x.y).\n\n## [1.5.0] - 2026-11-01\n\n- old\n'
  assert.equal(whatsNew(changelog, '1.6.0'), 'Fixed\n• A thing works. See docs.')
  const long = `## [1.6.0]\n\n${'- word '.repeat(2000)}\n`
  assert.ok([...whatsNew(long, '1.6.0')].length <= WHATS_NEW_LIMIT)
  assert.throws(() => whatsNew(changelog, '9.9.9'), /no section for 9\.9\.9/)
})

test('submit: a later editable version is never moved back by an older tag run again', async () => {
  const s = store({ versions: [released, { id: 'v17', attributes: { versionString: '1.7.0', appVersionState: 'PREPARE_FOR_SUBMISSION', releaseType: 'AFTER_APPROVAL' } }] })
  await assert.rejects(submitForReview(s.call, { version: '1.6.0', build: '10600', notes: 'x', log: quiet }), /1\.7\.0 is open for editing and is not older than 1\.6\.0/)
  assert.deepEqual(s.writes(), [])
  assert.equal(versionBelow('1.5.10', '1.6.0'), true)
  assert.equal(versionBelow('1.10.0', '1.9.9'), false)
  assert.equal(versionBelow('1.6.0', '1.6.0'), false)
})

test('submit: a draft submission holding other items is not sent along', async () => {
  const s = store({
    versions: [released],
    submissions: [{ id: 'sub1', attributes: { state: 'READY_FOR_REVIEW' } }],
    items: [{ id: 'i9', relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: 'someone-else' } } } }],
  })
  await assert.rejects(submitForReview(s.call, { version: '1.6.0', build: '10600', notes: 'x', log: quiet }), /holds 1 other item/)
  assert.ok(!s.writes().includes('PATCH /v1/reviewSubmissions/sub1'), 'not submitted')
})

test('submit: What\'s New only once a version has reached the App Store; a pending one blocks a new version', async () => {
  const inReview = { id: 'v10', attributes: { versionString: '1.0.0', appVersionState: 'IN_REVIEW', releaseType: 'AFTER_APPROVAL' } }
  const s = store({ versions: [inReview] })
  await assert.rejects(submitForReview(s.call, { version: '1.6.0', build: '10600', notes: 'x', log: quiet }), /1\.0\.0 is in review: Apple takes no new version/)
  assert.deepEqual(s.writes(), [])
  // The first version itself, still editable, with an earlier one only rejected: no What's New.
  const first = store({ versions: [{ id: 'v16', attributes: { versionString: '1.6.0', appVersionState: 'REJECTED', releaseType: 'AFTER_APPROVAL' } }] })
  await submitForReview(first.call, { version: '1.6.0', build: '10600', notes: 'x', log: quiet })
  assert.ok(!first.writes().some((w) => w.includes('appStoreVersionLocalizations')))
})

test('submit: a submission already waiting for review with this version is left alone; with another, it stops', async () => {
  const v16 = { id: 'v16', attributes: { versionString: '1.6.0', appVersionState: 'PREPARE_FOR_SUBMISSION', releaseType: 'AFTER_APPROVAL' } }
  const mine = store({ versions: [released, v16], attachedBuild: { type: 'builds', id: 'b1' }, locs: [{ id: 'l', attributes: { locale: 'en-US', whatsNew: 'x' } }],
    submissions: [{ id: 'sub1', attributes: { state: 'WAITING_FOR_REVIEW' } }], items: [{ id: 'i1', relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: 'v16' } } } }] })
  assert.equal((await submitForReview(mine.call, { version: '1.6.0', build: '10600', notes: 'x', log: quiet })).state, 'already-submitted')
  assert.deepEqual(mine.writes(), [])
  const other = store({ versions: [released, v16], attachedBuild: { type: 'builds', id: 'b1' }, locs: [{ id: 'l', attributes: { locale: 'en-US', whatsNew: 'x' } }],
    submissions: [{ id: 'sub2', attributes: { state: 'IN_REVIEW' } }], items: [{ id: 'i2', relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: 'other' } } } }] })
  await assert.rejects(submitForReview(other.call, { version: '1.6.0', build: '10600', notes: 'x', log: quiet }), /in review with other items/)
  assert.deepEqual(other.writes(), [])
})

test('submit: a rejected version goes again through its submission, its item marked resolved', async () => {
  const s = store({
    versions: [released, { id: 'v16', attributes: { versionString: '1.6.0', appVersionState: 'REJECTED', releaseType: 'AFTER_APPROVAL' } }],
    attachedBuild: { type: 'builds', id: 'b1' }, locs: [{ id: 'l', attributes: { locale: 'en-US', whatsNew: 'x' } }],
    submissions: [{ id: 'sub3', attributes: { state: 'UNRESOLVED_ISSUES' } }],
    items: [{ id: 'i3', attributes: { state: 'REJECTED' }, relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: 'v16' } } } }],
  })
  await submitForReview(s.call, { version: '1.6.0', build: '10600', notes: 'x', log: quiet })
  assert.deepEqual(s.writes(), ['PATCH /v1/reviewSubmissionItems/i3', 'PATCH /v1/reviewSubmissions/sub3'])
})

test("Apple's errors are all shown, with the associated ones", async () => {
  const call = client(credentials, { fetchImpl: async () => new Response(JSON.stringify({ errors: [{ code: 'STATE_ERROR', detail: 'Cannot submit', meta: { associatedErrors: { '/v1/appScreenshots': [{ detail: 'Screenshots are missing' }] } } }, { detail: 'Age rating is missing' }] }), { status: 409 }) })
  await assert.rejects(call('submitting', 'PATCH', '/v1/reviewSubmissions/x', {}), /409 STATE_ERROR\): Cannot submit; Screenshots are missing; Age rating is missing/)
})
