#!/usr/bin/env node
// Uploads the Android App Bundle of a final release to Google Play's internal testing track
// (OpenSpec change play-production D2). A person promotes it to production in the Play Console
// (RELEASING.md); this script never touches the production track.
//
//   PLAY_SERVICE_ACCOUNT_JSON='{…}' node scripts/release/play-upload.mjs v0.20.0 app.aab
//
// Four calls of the Play Developer API (androidpublisher v3): open an edit, upload the bundle,
// set the internal track to its version code with the release notes, commit the edit. The access
// token comes from the service account's key: a JWT signed with node:crypto, exchanged at its
// token_uri. No dependency.
// - A release candidate (a tag with a suffix, v0.20.0-rc.1) uploads nothing.
// - Without PLAY_SERVICE_ACCOUNT_JSON, or without the bundle, it warns (`::warning::`) and exits 0,
//   so a fork or a release before the owner set up Play never fails.
// - The notes are the version's CHANGELOG.md section as plain text, cut to 500 characters (Play's
//   limit per language); the changelog is English, so the notes are en-US.
// Tests: node --test scripts/release/play-upload.test.mjs (make repo-check).

import { createSign } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const PACKAGE = 'app.opentodo'
export const TRACK = 'internal'
export const NOTES_LIMIT = 500
const API = 'https://androidpublisher.googleapis.com'
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** `v0.20.0` → `{version: '0.20.0', code: 2000}`; null for a release candidate or anything else. */
export function finalVersion(tag) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag)
  if (!m) return null
  const [maj, min, patch] = m.slice(1).map(Number)
  return { version: `${maj}.${min}.${patch}`, code: maj * 10000 + min * 100 + patch }
}

/** The CHANGELOG.md section of a version as plain text, cut to `limit` characters on a word. */
export function releaseNotes(changelog, version, limit = NOTES_LIMIT) {
  const lines = changelog.split('\n')
  const start = lines.findIndex((l) => l.startsWith(`## [${version}]`))
  if (start < 0) throw new Error(`no section for ${version} in CHANGELOG.md`)
  const body = []
  for (const l of lines.slice(start + 1)) {
    if (/^## \[/.test(l) || /^\[[^\]]+\]: /.test(l)) break
    body.push(l)
  }
  const text = body
    .join('\n')
    .replace(/^#{1,6} +/gm, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__|`/g, '')
    .replace(/^\s*[-*] +/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!text) throw new Error(`the section for ${version} in CHANGELOG.md is empty`)
  if ([...text].length <= limit) return text
  const cut = [...text].slice(0, limit - 1).join('')
  const word = cut.replace(/\s+\S*$/, '')
  return (word.length > limit / 2 ? word : cut).trimEnd() + '…'
}

const b64url = (b) => Buffer.from(b).toString('base64url')

/** An OAuth access token for the service account (RFC 7523 JWT bearer grant). */
export async function accessToken(account, fetchImpl = fetch, now = Date.now()) {
  const iat = Math.floor(now / 1000)
  const tokenUri = account.token_uri || 'https://oauth2.googleapis.com/token'
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({ iss: account.client_email, scope: SCOPE, aud: tokenUri, iat, exp: iat + 600 }))
  const signature = createSign('RSA-SHA256').update(`${head}.${claims}`).sign(account.private_key)
  const res = await fetchImpl(tokenUri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claims}.${b64url(signature)}` }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.access_token) throw new Error(`token request refused (${res.status}): ${body.error_description || body.error || 'no access token'}`)
  return body.access_token
}

/**
 * Uploads `aab` for `tag` to the internal track. Returns what happened:
 * `{skipped: reason}` or `{versionCode, editId}`. `log(level, message)` reports warnings.
 */
export async function upload({ tag, aab, credentials, changelog, fetchImpl = fetch, api = API, log = defaultLog, now = Date.now() }) {
  const v = finalVersion(tag)
  if (!v) {
    log('notice', `${tag} is not a final release: nothing is uploaded to Google Play`)
    return { skipped: 'not a final release' }
  }
  if (!credentials) {
    log('warning', 'PLAY_SERVICE_ACCOUNT_JSON is not set: no Google Play upload for this release')
    return { skipped: 'no credentials' }
  }
  if (!aab || !existsSync(aab)) {
    log('warning', `no signed bundle (${aab || 'none given'}): no Google Play upload for this release`)
    return { skipped: 'no bundle' }
  }
  const account = typeof credentials === 'string' ? JSON.parse(credentials) : credentials
  const notes = releaseNotes(changelog, v.version)
  const token = await accessToken(account, fetchImpl, now)
  const base = `${api}/androidpublisher/v3/applications/${PACKAGE}/edits`
  const call = async (what, url, init) => {
    const res = await fetchImpl(url, { ...init, headers: { authorization: `Bearer ${token}`, ...init.headers } })
    const text = await res.text()
    if (!res.ok) throw new Error(`${what} failed (${res.status}): ${text.slice(0, 500)}`)
    return text ? JSON.parse(text) : {}
  }
  const edit = await call('opening an edit', base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  const bundle = await call('uploading the bundle', `${api}/upload/androidpublisher/v3/applications/${PACKAGE}/edits/${edit.id}/bundles?uploadType=media`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: readFileSync(aab),
  })
  if (Number(bundle.versionCode) !== v.code) throw new Error(`the bundle has version code ${bundle.versionCode}, ${tag} needs ${v.code}`)
  await call('setting the internal track', `${base}/${edit.id}/tracks/${TRACK}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      track: TRACK,
      releases: [{ name: v.version, versionCodes: [String(v.code)], status: 'completed', releaseNotes: [{ language: 'en-US', text: notes }] }],
    }),
  })
  await call('committing the edit', `${base}/${edit.id}:commit`, { method: 'POST' })
  log('notice', `version code ${v.code} (${v.version}) is on Google Play's internal track; promote it in the Play Console (RELEASING.md)`)
  return { versionCode: v.code, editId: edit.id }
}

function defaultLog(level, message) {
  console.log(`::${level}::${message}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [tag, aab] = process.argv.slice(2)
  if (!tag) {
    console.error('usage: node scripts/release/play-upload.mjs <tag> [aab]')
    process.exit(2)
  }
  upload({ tag, aab, credentials: process.env.PLAY_SERVICE_ACCOUNT_JSON || '', changelog: readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8') }).catch((err) => {
    console.log(`::error::Google Play upload: ${err.message}`)
    process.exit(1)
  })
}
