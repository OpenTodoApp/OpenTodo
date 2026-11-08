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
  marketingVersion,
  nextBuildNumber,
  normalizeKey,
  prepareSigning,
  register,
  registerReport,
  setWhatToTest,
  token,
  whatToTest,
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
  assert.equal(nextBuildNumber(10200, ['7', '102001']), '10200')
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
  const registered = { 'app.opentodo': bundle('B1', 'app.opentodo') }
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
      ['app.opentodo', 'already registered'],
      ['app.opentodo.widget', 'registered, APP_GROUPS turned on'],
      ['app.opentodo.share', 'registered, APP_GROUPS turned on'],
    ],
  )
  assert.equal(first.app, null)
  const report = registerReport(first).join('\n')
  assert.match(report, /App record: none yet\. Create it in App Store Connect/)
  assert.match(report, new RegExp(`${APP_GROUP.replace(/\./g, '\\.')}: the API can neither create an App Group nor assign one`))
  assert.match(calls[0].auth, /^Bearer [\w-]+\.[\w-]+\.[\w-]+$/)

  const writes = calls.filter((c) => c.key.startsWith('POST')).length
  const again = await register(call, { team: 'TEAM123456' })
  assert.ok(again.rows.every((r) => r.state === 'already registered'), 'a second run changes nothing')
  assert.equal(calls.filter((c) => c.key.startsWith('POST')).length, writes, 'and writes nothing')
})

test('an identifier held by another team names the fix', async () => {
  const { call } = fakeAsc({
    'GET /v1/bundleIds': () => [200, { data: [] }],
    'POST /v1/bundleIds': () => [409, { errors: [{ status: '409', code: 'ENTITY_ERROR.ATTRIBUTE.INVALID', detail: "An App ID with Identifier 'app.opentodo' is not available. Please enter a different string." }] }],
  })
  await assert.rejects(register(call), /app\.opentodo belongs to another Apple developer team .*is not available.*Pick a new prefix: change app\.opentodo in mobile\/ios\/project\.yml/)
})

test('a key of another team is reported', async () => {
  const warnings = []
  const { call } = fakeAsc({
    'GET /v1/bundleIds': (u) => [200, { data: [bundle('B1', u.searchParams.get('filter[identifier]'), 'OTHERTEAM1')] }],
    'GET /v1/bundleIds/B1/bundleIdCapabilities': () => [200, { data: [{ attributes: { capabilityType: 'APP_GROUPS' } }] }],
    'GET /v1/apps': () => [200, { data: [{ id: 'A1', attributes: { bundleId: 'app.opentodo', name: 'OpenTodo' } }] }],
  })
  const res = await register(call, { team: 'TEAM123456', log: (level, m) => warnings.push(`${level} ${m}`) })
  assert.equal(res.app.id, 'A1')
  assert.match(warnings[0], /^warning app\.opentodo has team prefix OTHERTEAM1, but APPLE_TEAM_ID is TEAM123456/)
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
  assert.deepEqual(res.profiles, { 'app.opentodo': 'uuid-app.opentodo', 'app.opentodo.widget': 'uuid-app.opentodo.widget', 'app.opentodo.share': 'uuid-app.opentodo.share' })
  assert.equal(readFileSync(join(dir, 'distribution.cer'), 'utf8'), 'DER')
  assert.ok(existsSync(join(dir, 'profiles', 'uuid-app.opentodo.share.mobileprovision')))
  const options = readFileSync(join(dir, 'ExportOptions.plist'), 'utf8')
  assert.match(options, /<key>method<\/key>\n\t<string>app-store-connect<\/string>/)
  assert.match(options, /<key>signingStyle<\/key>\n\t<string>manual<\/string>/)
  assert.match(options, /<key>teamID<\/key>\n\t<string>TEAM123456<\/string>/)
  assert.match(options, /<key>app\.opentodo\.widget<\/key>\n\t\t<string>uuid-app\.opentodo\.widget<\/string>/)
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
  await assert.rejects(prepareSigning(call, { dir, team: 'TEAM123456', log: () => {} }), /do not carry the App Group group\.app\.opentodo\. The API cannot assign one: at developer\.apple\.com → Identifiers → App Groups/)
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
    'GET /v1/apps': () => [200, { data: [{ id: 'A1', attributes: { bundleId: 'app.opentodo' } }] }],
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
    'GET /v1/apps': () => [200, { data: [{ id: 'A1', attributes: { bundleId: 'app.opentodo' } }] }],
    'GET /v1/builds': () => [200, { data: [] }],
  })
  const ok = await setWhatToTest(call, { version: '1.2.0', build: '10200', text: 'Notes', attempts: 2, pause: async () => {}, log: (l, m) => logs.push(`${l} ${m}`) })
  assert.equal(ok, false)
  assert.match(logs[0], /^warning build 10200 of 1\.2\.0 did not appear in App Store Connect in time/)
})
