#!/usr/bin/env node
// App Store Connect for the iOS app (OpenSpec change ios-distribution, D5 and D9): registers the
// bundle identifiers, picks the build number, makes the signing material of one run and removes it
// again, and sets TestFlight's "What to test". The REST API only, with the team's API key: a JWT
// signed with node:crypto (ES256). No dependency, no Mac needed for anything but the build.
//
//   node scripts/release/appstore.mjs register                      the three bundle IDs and App Groups
//   node scripts/release/appstore.mjs version <git-describe>        v1.2.0 → "1.2.0 10200"
//   node scripts/release/appstore.mjs build-number <version> [n]    the next free build number
//   node scripts/release/appstore.mjs app-id                        the app record's id
//   node scripts/release/appstore.mjs sign <dir>                    certificate, profiles, ExportOptions.plist
//   node scripts/release/appstore.mjs cleanup <dir>                 revoke and delete what `sign` made (a run that uploaded nothing)
//   node scripts/release/appstore.mjs notes <version> <build> [file] "What to test" from CHANGELOG.md, or from a text file
//   node scripts/release/appstore.mjs processed <version> <build>   wait for Apple's processing (VALID)
//   node scripts/release/appstore.mjs key-file <path>               ASC_KEY_P8 as a file for altool (mode 600)
//
// The key comes from ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_P8 (the .p8 file's content), the team
// from APPLE_TEAM_ID. Nothing secret is stored between runs: `sign` makes an Apple Distribution
// certificate from a key generated on the runner (csr.pem in <dir>, deleted with the runner) and one
// App Store profile per bundle ID. The certificate of a build that was uploaded stays valid: Apple
// checks the signature again when the build is submitted for TestFlight or App Store review, and a
// revoked certificate then turns it into ITMS-90035 "Invalid Signature" (builds 10101 and 10101.1).
// Without its private key nobody can sign with it. When Apple's limit of distribution certificates
// is reached, `sign` revokes the oldest one this workflow made (found by its "OpenTodo CI" profiles)
// and deletes its profiles; a certificate made by hand is never touched. `cleanup` revokes and
// deletes what `sign` made only for a run that uploaded nothing.
// Tests: node --test scripts/release/appstore.test.mjs (make repo-check).

import { sign as cryptoSign } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { releaseNotes } from './play-upload.mjs'

export const API = 'https://api.appstoreconnect.apple.com'
export const APP_GROUP = 'group.app.open-todo'
/** The app first: its record is the one App Store Connect knows the app by. */
export const BUNDLE_IDS = [
  { identifier: 'app.open-todo.ios', name: 'OpenTodo' },
  { identifier: 'app.open-todo.ios.widget', name: 'OpenTodo Widget' },
  { identifier: 'app.open-todo.ios.share', name: 'OpenTodo Share' },
]
/** What the entitlements of the three targets need (the .entitlements files in mobile/ios). */
export const CAPABILITIES = ['APP_GROUPS']
export const WHAT_TO_TEST_LIMIT = 4000
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

export class AscError extends Error {
  constructor(what, status, errors) {
    const first = errors?.[0] ?? {}
    super(`${what} failed (${status}${first.code ? ` ${first.code}` : ''}): ${first.detail || first.title || 'no detail'}`)
    this.status = status
    this.detail = first.detail || first.title || ''
  }
}

const b64url = (b) => Buffer.from(b).toString('base64url')

/** The .p8 content as pasted into a secret: a literal `\n`, CRLF or missing final newline are fine. */
export function normalizeKey(p8) {
  const key = String(p8 ?? '').replace(/\\n/g, '\n').replace(/\r/g, '').trim()
  if (!/^-----BEGIN PRIVATE KEY-----\n[\s\S]+\n-----END PRIVATE KEY-----$/.test(key)) {
    throw new Error('ASC_KEY_P8 is not the content of an App Store Connect .p8 key (it starts with -----BEGIN PRIVATE KEY-----)')
  }
  return key + '\n'
}

/** A token for the App Store Connect API: ES256, at most 20 minutes, made fresh for every call. */
export function token({ keyId, issuerId, p8 }, now = Date.now()) {
  const iat = Math.floor(now / 1000)
  const head = b64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }))
  const claims = b64url(JSON.stringify({ iss: issuerId, iat, exp: iat + 1140, aud: 'appstoreconnect-v1' }))
  const signature = cryptoSign('sha256', Buffer.from(`${head}.${claims}`), { key: normalizeKey(p8), dsaEncoding: 'ieee-p1363' })
  return `${head}.${claims}.${b64url(signature)}`
}

/** `call(what, method, path, body?)` → the parsed answer; throws AscError with Apple's own detail. */
export function client(credentials, { fetchImpl = fetch, api = API, now = () => Date.now() } = {}) {
  return async (what, method, path, body) => {
    const res = await fetchImpl(`${api}${path}`, {
      method,
      headers: { authorization: `Bearer ${token(credentials, now())}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    const parsed = text ? safeJSON(text) : {}
    if (!res.ok) throw new AscError(what, res.status, parsed.errors ?? [{ detail: text.slice(0, 300) }])
    return parsed
  }
}

function safeJSON(text) {
  try {
    return JSON.parse(text)
  } catch {
    return { errors: [{ detail: text.slice(0, 300) }] }
  }
}

/** `v1.2.0`, `v1.2.0-rc.1` or `1.2.0-5-gabc` (git describe) → `{version: '1.2.0', code: 10200}`. */
export function marketingVersion(described) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-.*)?$/.exec(String(described ?? '').trim())
  if (!m) return null
  const [maj, min, patch] = m.slice(1).map(Number)
  if (min > 99 || patch > 99) return null
  return { version: `${maj}.${min}.${patch}`, code: maj * 10000 + min * 100 + patch }
}

/** The first upload of a version is its code (`10200`), later uploads add `.1`, `.2`, … */
export function buildNumber(code, upload = 0) {
  return upload > 0 ? `${code}.${upload}` : `${code}`
}

/** The upload number of a build number of this version (`10200` → 0, `10200.3` → 3), or null. */
export function uploadOf(code, build) {
  const [head, upload, ...rest] = String(build).split('.')
  if (head !== String(code) || rest.length) return null
  if (upload === undefined) return 0
  return /^\d+$/.test(upload) ? Number(upload) : null
}

/** The next free build number of a version, given the build numbers TestFlight already has for it. */
export function nextBuildNumber(code, existing) {
  let next = 0
  for (const v of existing) {
    const n = uploadOf(code, v)
    if (n !== null) next = Math.max(next, n + 1)
  }
  return buildNumber(code, next)
}

async function findBundleId(call, identifier) {
  const res = await call(`looking up ${identifier}`, 'GET', `/v1/bundleIds?filter[identifier]=${encodeURIComponent(identifier)}&limit=200`)
  return (res.data ?? []).find((b) => b.attributes?.identifier === identifier) ?? null
}

export async function findApp(call) {
  const res = await call('looking up the app record', 'GET', `/v1/apps?filter[bundleId]=${encodeURIComponent(BUNDLE_IDS[0].identifier)}`)
  return (res.data ?? []).find((a) => a.attributes?.bundleId === BUNDLE_IDS[0].identifier) ?? null
}

function takenMessage(identifier, detail) {
  return (
    `${identifier} belongs to another Apple developer team (Apple: "${detail}"). ` +
    `Pick a new prefix: change ${BUNDLE_IDS[0].identifier} in mobile/ios/project.yml (bundleIdPrefix and every PRODUCT_BUNDLE_IDENTIFIER, then regenerate the Xcode project), ` +
    `the App Group ${APP_GROUP}, and BUNDLE_IDS and APP_GROUP in scripts/release/appstore.mjs, then run "iOS register IDs" again.`
  )
}

/**
 * Registers the three bundle IDs where missing and turns on what their entitlements need. Safe to
 * run again: what exists is left alone. Returns one row per bundle ID and whether the app record exists.
 */
export async function register(call, { team = '', log = defaultLog } = {}) {
  const rows = []
  for (const b of BUNDLE_IDS) {
    let found = await findBundleId(call, b.identifier)
    const done = []
    if (!found) {
      try {
        const res = await call(`registering ${b.identifier}`, 'POST', '/v1/bundleIds', {
          data: { type: 'bundleIds', attributes: { identifier: b.identifier, name: b.name, platform: 'IOS' } },
        })
        found = res.data
        done.push('registered')
      } catch (err) {
        // Apple answers 409 for an identifier another team holds ("is not available").
        if (err.status === 409) throw new Error(takenMessage(b.identifier, err.detail))
        throw err
      }
    } else {
      done.push('already registered')
    }
    const seed = found.attributes?.seedId
    if (team && seed && seed !== team) log('warning', `${b.identifier} has team prefix ${seed}, but APPLE_TEAM_ID is ${team}: the key and the team id belong to different teams`)
    const caps = await call(`reading the capabilities of ${b.identifier}`, 'GET', `/v1/bundleIds/${found.id}/bundleIdCapabilities`)
    for (const cap of CAPABILITIES) {
      if ((caps.data ?? []).some((c) => c.attributes?.capabilityType === cap)) continue
      await call(`turning on ${cap} for ${b.identifier}`, 'POST', '/v1/bundleIdCapabilities', {
        data: { type: 'bundleIdCapabilities', attributes: { capabilityType: cap }, relationships: { bundleId: { data: { type: 'bundleIds', id: found.id } } } },
      })
      done.push(`${cap} turned on`)
    }
    rows.push({ identifier: b.identifier, id: found.id, state: done.join(', ') })
  }
  const app = await findApp(call)
  return { rows, app: app ? { id: app.id, name: app.attributes?.name } : null }
}

export function registerReport({ rows, app }) {
  const lines = rows.map((r) => `${r.identifier}: ${r.state} (App Groups on)`)
  lines.push(
    `${APP_GROUP}: the API can neither create an App Group nor assign one. Once, at developer.apple.com → Certificates, Identifiers & Profiles → Identifiers → App Groups, ` +
      `register ${APP_GROUP}, then open each of the three identifiers above, App Groups → Configure, tick it and save. The TestFlight job stops and says so while a profile lacks it.`,
  )
  lines.push(
    app
      ? `App record: "${app.name}" (${app.id}) uses ${BUNDLE_IDS[0].identifier}.`
      : `App record: none yet. Create it in App Store Connect → Apps → + → New App: iOS, bundle ID ${BUNDLE_IDS[0].identifier}. The TestFlight job needs it.`,
  )
  return lines
}

/** The build numbers TestFlight already holds for a version. */
export async function existingBuilds(call, appId, version) {
  const res = await call(`listing the builds of ${version}`, 'GET', `/v1/builds?filter[app]=${appId}&filter[preReleaseVersion.version]=${encodeURIComponent(version)}&fields[builds]=version&limit=200`)
  return (res.data ?? []).map((b) => b.attributes?.version).filter(Boolean)
}

const plistEscape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** ExportOptions.plist for a manual App Store export with the profiles `sign` made. */
export function exportOptions(team, profiles) {
  const map = Object.entries(profiles)
    .map(([id, uuid]) => `\t\t<key>${plistEscape(id)}</key>\n\t\t<string>${plistEscape(uuid)}</string>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>method</key>
\t<string>app-store-connect</string>
\t<key>destination</key>
\t<string>export</string>
\t<key>teamID</key>
\t<string>${plistEscape(team)}</string>
\t<key>signingStyle</key>
\t<string>manual</string>
\t<key>signingCertificate</key>
\t<string>Apple Distribution</string>
\t<key>provisioningProfiles</key>
\t<dict>
${map}
\t</dict>
\t<key>manageAppVersionAndBuildNumber</key>
\t<false/>
\t<key>uploadSymbols</key>
\t<true/>
</dict>
</plist>
`
}

function readState(dir) {
  const file = join(dir, 'state.json')
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { certificateId: null, profileIds: [] }
}

function writeState(dir, state) {
  writeFileSync(join(dir, 'state.json'), JSON.stringify(state, null, 2) + '\n')
}

/**
 * Makes the signing material of one run in `dir`: an Apple Distribution certificate for
 * `dir/csr.pem` (distribution.cer, DER), one App Store profile per bundle ID
 * (profiles/<uuid>.mobileprovision) and ExportOptions.plist. Records what it made in state.json
 * as it goes, so `cleanup` removes it even when a later step fails.
 */
/** Tries for a new certificate after retiring one, and the base pause between them. */
export const CERT_RETRIES = 4
export const CERT_RETRY_SECONDS = 20
export async function prepareSigning(call, { dir, team, stamp = String(Date.now()), log = defaultLog, wait = sleep }) {
  if (!team) throw new Error('APPLE_TEAM_ID is not set')
  const state = readState(dir)
  writeState(dir, state)
  const csr = readFileSync(join(dir, 'csr.pem'), 'utf8')
  const create = () =>
    call('creating the distribution certificate', 'POST', '/v1/certificates', {
      data: { type: 'certificates', attributes: { certificateType: 'DISTRIBUTION', csrContent: csr } },
    })
  let cert
  try {
    try {
      cert = await create()
    } catch (err) {
      // At Apple's limit: make room by retiring the oldest certificate of an earlier run, once.
      if (err.status !== 409 || !(await retireOldestCertificate(call, { log }))) throw err
      // Apple takes a moment to count a revoked certificate out (v1.4.2: 409 again right after
      // revoking), so the new one is asked for a few times with a growing pause.
      for (let attempt = 1; ; attempt++) {
        try {
          cert = await create()
          break
        } catch (again) {
          if (again.status !== 409 || attempt >= CERT_RETRIES) throw again
          log('notice', `Apple has not freed the revoked certificate's place yet; asking again in ${attempt * CERT_RETRY_SECONDS} s`)
          await wait(attempt * CERT_RETRY_SECONDS * 1000)
        }
      }
    }
  } catch (err) {
    if (err.status === 403) throw new Error(`${err.message}. The API key's role may not create certificates: make a key with the Admin role and replace ASC_KEY_ID and ASC_KEY_P8`)
    if (err.status === 409) throw new Error(`${err.message}. Apple allows only a few Apple Distribution certificates per team and none of them was made by this workflow: revoke an unused one at developer.apple.com → Certificates and run again`)
    throw err
  }
  state.certificateId = cert.data.id
  writeState(dir, state)
  writeFileSync(join(dir, 'distribution.cer'), Buffer.from(cert.data.attributes.certificateContent, 'base64'))
  log('notice', `made Apple Distribution certificate ${cert.data.id} for this run; it stays valid once a build signed with it is uploaded`)

  mkdirSync(join(dir, 'profiles'), { recursive: true })
  const profiles = {}
  const lacking = []
  for (const b of BUNDLE_IDS) {
    const bundle = await findBundleId(call, b.identifier)
    if (!bundle) throw new Error(`${b.identifier} is not registered: run "iOS register IDs" first`)
    const res = await call(`creating the App Store profile of ${b.identifier}`, 'POST', '/v1/profiles', {
      data: {
        type: 'profiles',
        attributes: { name: `${CI_PROFILE_PREFIX}${b.identifier} ${stamp}`, profileType: 'IOS_APP_STORE' },
        relationships: {
          bundleId: { data: { type: 'bundleIds', id: bundle.id } },
          certificates: { data: [{ type: 'certificates', id: cert.data.id }] },
        },
      },
    })
    state.profileIds.push(res.data.id)
    writeState(dir, state)
    const content = Buffer.from(res.data.attributes.profileContent, 'base64')
    writeFileSync(join(dir, 'profiles', `${res.data.attributes.uuid}.mobileprovision`), content)
    profiles[b.identifier] = res.data.attributes.uuid
    // The profile's entitlements are a plain XML plist inside the signed envelope.
    if (!content.includes(APP_GROUP)) lacking.push(b.identifier)
  }
  writeFileSync(join(dir, 'ExportOptions.plist'), exportOptions(team, profiles))
  if (lacking.length) {
    throw new Error(
      `the profiles of ${lacking.join(', ')} do not carry the App Group ${APP_GROUP}. The API cannot assign one: at developer.apple.com → Identifiers → App Groups ` +
        `register ${APP_GROUP} if it is missing, then on each of those identifiers open App Groups → Configure, tick it and save, and run again`,
    )
  }
  return { certificateId: cert.data.id, profiles }
}

/** The name every profile this workflow makes starts with; it is how an earlier run's certificate is found. */
export const CI_PROFILE_PREFIX = 'OpenTodo CI '

/**
 * Revokes the oldest distribution certificate an earlier run made, and deletes its profiles.
 * A run's certificate is the one its "OpenTodo CI" profiles name; the oldest is the one whose
 * first profile is the oldest. Builds signed with it can no longer be submitted for review, so
 * it is only done when Apple refuses a new certificate. Returns the revoked id, or null when no
 * certificate was made by this workflow.
 */
export async function retireOldestCertificate(call, { log = defaultLog } = {}) {
  const res = await call('listing the profiles', 'GET', '/v1/profiles?limit=200&include=certificates')
  const runs = new Map()
  for (const p of res.data ?? []) {
    if (!String(p.attributes?.name ?? '').startsWith(CI_PROFILE_PREFIX)) continue
    for (const c of p.relationships?.certificates?.data ?? []) {
      const run = runs.get(c.id) ?? { id: c.id, created: Infinity, profileIds: [] }
      run.profileIds.push(p.id)
      run.created = Math.min(run.created, Date.parse(p.attributes.createdDate ?? '') || Infinity)
      runs.set(c.id, run)
    }
  }
  const oldest = [...runs.values()].sort((a, b) => a.created - b.created || a.id.localeCompare(b.id))[0]
  if (!oldest) return null
  const gone = (err) => {
    if (err.status !== 404) throw err
  }
  await call(`revoking certificate ${oldest.id}`, 'DELETE', `/v1/certificates/${oldest.id}`).catch(gone)
  for (const id of oldest.profileIds) await call(`deleting profile ${id}`, 'DELETE', `/v1/profiles/${id}`).catch(gone)
  log('notice', `at Apple's limit of distribution certificates: revoked ${oldest.id}, made by an earlier run, and deleted its ${oldest.profileIds.length} profiles`)
  return oldest.id
}

/** Revokes the certificate and deletes the profiles `prepareSigning` recorded, for a run that uploaded nothing. Missing ones are fine. */
export async function cleanup(call, { dir, log = defaultLog }) {
  const state = readState(dir)
  const gone = (err) => err.status === 404
  for (const id of state.profileIds ?? []) {
    await call(`deleting profile ${id}`, 'DELETE', `/v1/profiles/${id}`).catch((err) => {
      if (!gone(err)) throw err
    })
  }
  if (state.certificateId) {
    await call(`revoking certificate ${state.certificateId}`, 'DELETE', `/v1/certificates/${state.certificateId}`).catch((err) => {
      if (!gone(err)) throw err
    })
    log('notice', `revoked this run's certificate ${state.certificateId} and deleted ${state.profileIds?.length ?? 0} profiles`)
  }
  writeState(dir, { certificateId: null, profileIds: [] })
}

/** TestFlight's "What to test": the version's CHANGELOG.md section, or a plain line for a build between releases. */
export function whatToTest(changelog, version, build) {
  try {
    return releaseNotes(changelog, version, WHAT_TO_TEST_LIMIT)
  } catch {
    return `OpenTodo ${version}, build ${build}: a build between releases. CHANGELOG.md has no section for it yet.`
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Waits for the uploaded build to appear in App Store Connect (processing takes minutes), then
 * sets its English "What to test". Returns false when the build did not appear in time.
 */
export async function setWhatToTest(call, { version, build, text, attempts = 40, wait = 30_000, pause = sleep, log = defaultLog }) {
  const app = await findApp(call)
  if (!app) throw new Error(`no app record for ${BUNDLE_IDS[0].identifier}`)
  let found = null
  for (let i = 0; i < attempts && !found; i++) {
    if (i > 0) await pause(wait)
    found = await findBuild(call, app.id, version, build)
  }
  if (!found) {
    log('warning', `build ${build} of ${version} did not appear in App Store Connect in time: set "What to test" in TestFlight by hand`)
    return false
  }
  const locs = await call('reading the build\'s test notes', 'GET', `/v1/builds/${found.id}/betaBuildLocalizations`)
  const en = (locs.data ?? []).find((l) => l.attributes?.locale === 'en-US')
  if (en) {
    await call('setting What to test', 'PATCH', `/v1/betaBuildLocalizations/${en.id}`, { data: { type: 'betaBuildLocalizations', id: en.id, attributes: { whatsNew: text } } })
  } else {
    await call('setting What to test', 'POST', '/v1/betaBuildLocalizations', {
      data: { type: 'betaBuildLocalizations', attributes: { locale: 'en-US', whatsNew: text }, relationships: { build: { data: { type: 'builds', id: found.id } } } },
    })
  }
  log('notice', `build ${build} of ${version} is in TestFlight with its "What to test"`)
  return true
}

async function findBuild(call, appId, version, build) {
  const res = await call(`looking for build ${build}`, 'GET', `/v1/builds?filter[app]=${appId}&filter[version]=${encodeURIComponent(build)}&filter[preReleaseVersion.version]=${encodeURIComponent(version)}`)
  return res.data?.[0] ?? null
}

/**
 * Waits until Apple has processed the uploaded build, and fails when Apple refused it. The
 * certificate that signed the build stays valid (Apple checks the signature while processing and
 * again at every review submission). Returns the final processingState, or null when processing
 * outlasted the wait (a warning: App Store Connect then shows the build once it is done).
 */
export async function waitForProcessing(call, { version, build, attempts = 90, wait = 30_000, pause = sleep, log = defaultLog }) {
  const app = await findApp(call)
  if (!app) throw new Error(`no app record for ${BUNDLE_IDS[0].identifier}`)
  let state = null
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await pause(wait)
    state = (await findBuild(call, app.id, version, build))?.attributes?.processingState ?? null
    if (state && state !== 'PROCESSING') break
  }
  if (state === 'VALID') {
    log('notice', `Apple processed build ${build} of ${version}: valid`)
    return state
  }
  if (state === 'INVALID' || state === 'FAILED') {
    throw new Error(`Apple refused build ${build} of ${version} (${state}); its email to the account holder names the reason`)
  }
  log('warning', `build ${build} of ${version} was still ${state ? state.toLowerCase() : 'missing'} after the wait; App Store Connect shows it once Apple is done`)
  return null
}

function defaultLog(level, message) {
  console.log(`::${level}::${message}`)
}

function credentialsFromEnv() {
  const { ASC_KEY_ID: keyId, ASC_ISSUER_ID: issuerId, ASC_KEY_P8: p8 } = process.env
  if (!keyId || !issuerId || !p8) throw new Error('ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_P8 must all be set')
  return { keyId, issuerId, p8 }
}

async function main(argv) {
  const [cmd, ...args] = argv
  if (cmd === 'key-file') {
    mkdirSync(dirname(args[0]), { recursive: true, mode: 0o700 })
    writeFileSync(args[0], normalizeKey(process.env.ASC_KEY_P8), { mode: 0o600 })
    return
  }
  if (cmd === 'version') {
    const v = marketingVersion(args[0])
    if (!v) throw new Error(`"${args[0]}" is not a release version (vX.Y.Z, minor and patch at most 99)`)
    console.log(`${v.version} ${v.code}`)
    return
  }
  const call = client(credentialsFromEnv())
  const team = process.env.APPLE_TEAM_ID ?? ''
  switch (cmd) {
    case 'register': {
      for (const line of registerReport(await register(call, { team }))) console.log(line)
      return
    }
    case 'app-id': {
      const app = await findApp(call)
      if (!app) throw new Error(`there is no app record for ${BUNDLE_IDS[0].identifier} yet: create it in App Store Connect → Apps → + → New App`)
      console.log(app.id)
      return
    }
    case 'build-number': {
      const [version, explicit] = args
      const v = marketingVersion(version)
      if (!v) throw new Error(`"${version}" is not a release version`)
      if (explicit) {
        if (uploadOf(v.code, explicit) === null) throw new Error(`build number ${explicit} must be ${v.code} or ${v.code}.N for ${v.version}`)
        console.log(explicit)
        return
      }
      const app = await findApp(call)
      if (!app) throw new Error(`there is no app record for ${BUNDLE_IDS[0].identifier} yet: create it in App Store Connect → Apps → + → New App`)
      console.log(nextBuildNumber(v.code, await existingBuilds(call, app.id, v.version)))
      return
    }
    case 'sign':
      await prepareSigning(call, { dir: args[0], team, stamp: process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_RUN_ID}.${process.env.GITHUB_RUN_ATTEMPT ?? 1}` : undefined })
      return
    case 'cleanup':
      await cleanup(call, { dir: args[0] })
      return
    case 'notes': {
      const [version, build, file] = args
      // The native app's trial has no changelog section of its own: its notes are a file.
      const text = file
        ? readFileSync(file, 'utf8').trim().slice(0, WHAT_TO_TEST_LIMIT)
        : whatToTest(readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8'), version, build)
      await setWhatToTest(call, { version, build, text })
      return
    }
    case 'processed': {
      const [version, build] = args
      await waitForProcessing(call, { version, build })
      return
    }
    default:
      console.error('usage: node scripts/release/appstore.mjs register|version|build-number|app-id|sign|cleanup|notes|processed …')
      process.exit(2)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch((err) => {
    console.log(`::error::App Store Connect: ${err.message}`)
    process.exit(1)
  })
}
