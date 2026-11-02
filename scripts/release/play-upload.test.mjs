// node --test scripts/release/play-upload.test.mjs  (make repo-check; OpenSpec change play-production 2.3)
// The upload against a fake Play Developer API on a local port: the order of the calls, the
// token request, the notes cut to 500 characters, the skips without secrets or for a release candidate.
import assert from 'node:assert/strict'
import { createVerify, generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { finalVersion, NOTES_LIMIT, releaseNotes, upload } from './play-upload.mjs'

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const dir = mkdtempSync(join(tmpdir(), 'play-upload-'))
const aab = join(dir, 'app.aab')
writeFileSync(aab, Buffer.from('PK fake bundle'))

const CHANGELOG = `# Changelog

## [Unreleased]

- Something not released yet.

## [0.20.0] - 2026-11-20

OpenTodo 0.20.0 puts the **Android app** on [Google Play](https://play.google.com) and \`F-Droid\`.

### Added

- ${'A long entry with many words. '.repeat(40)}

## [0.19.0] - 2026-10-31

- Older.

[Unreleased]: https://github.com/OpenTodoApp/OpenTodo/compare/v0.20.0...HEAD
`

let server
let api
let calls = []
let versionCode = 2000

before(async () => {
  server = createServer((req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const body = Buffer.concat(chunks)
      calls.push({ method: req.method, url: req.url, auth: req.headers.authorization, type: req.headers['content-type'], body })
      const json = (o) => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify(o))
      }
      if (req.url === '/token') {
        const form = new URLSearchParams(body.toString())
        const [h, c, s] = form.get('assertion').split('.')
        const ok = createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(s, 'base64url'))
        if (!ok) return res.writeHead(401).end('{}')
        return json({ access_token: 'tok-1', expires_in: 3600 })
      }
      if (req.method === 'POST' && req.url.endsWith('/edits')) return json({ id: 'edit-7' })
      if (req.url.includes('/bundles?uploadType=media')) return json({ versionCode, sha256: 'x' })
      if (req.method === 'PUT' && req.url.endsWith('/tracks/internal')) return json(JSON.parse(body.toString()))
      if (req.url.endsWith('/edit-7:commit')) return json({ id: 'edit-7' })
      res.writeHead(404).end('{"error":"unexpected"}')
    })
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  api = `http://127.0.0.1:${server.address().port}`
})

after(() => {
  server.close()
  rmSync(dir, { recursive: true, force: true })
})

const credentials = () => JSON.stringify({ client_email: 'ci@example.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), token_uri: `${api}/token` })
const quiet = () => {
  const lines = []
  return { lines, log: (level, msg) => lines.push(`${level}: ${msg}`) }
}

test('a final tag opens an edit, uploads the bundle, sets the internal track and commits, in that order', async () => {
  calls = []
  versionCode = 2000
  const { log, lines } = quiet()
  const out = await upload({ tag: 'v0.20.0', aab, credentials: credentials(), changelog: CHANGELOG, api, log })
  assert.deepEqual(out, { versionCode: 2000, editId: 'edit-7' })
  assert.deepEqual(
    calls.map((c) => `${c.method} ${c.url}`),
    [
      'POST /token',
      'POST /androidpublisher/v3/applications/app.opentodo/edits',
      'POST /upload/androidpublisher/v3/applications/app.opentodo/edits/edit-7/bundles?uploadType=media',
      'PUT /androidpublisher/v3/applications/app.opentodo/edits/edit-7/tracks/internal',
      'POST /androidpublisher/v3/applications/app.opentodo/edits/edit-7:commit',
    ],
  )
  for (const c of calls.slice(1)) assert.equal(c.auth, 'Bearer tok-1')
  assert.equal(calls[2].type, 'application/octet-stream')
  assert.equal(calls[2].body.toString(), 'PK fake bundle')
  const track = JSON.parse(calls[3].body.toString())
  assert.equal(track.track, 'internal')
  assert.equal(track.releases.length, 1)
  const [release] = track.releases
  assert.deepEqual(release.versionCodes, ['2000'])
  assert.equal(release.status, 'completed')
  assert.equal(release.releaseNotes[0].language, 'en-US')
  assert.ok(release.releaseNotes[0].text.startsWith('OpenTodo 0.20.0 puts the Android app on Google Play and F-Droid.'))
  assert.ok(!calls.some((c) => /production/.test(c.url) || /production/.test(c.body.toString())), 'never the production track')
  assert.match(lines.at(-1), /internal track/)
})

test('the notes are the version section as plain text, cut to 500 characters', () => {
  const notes = releaseNotes(CHANGELOG, '0.20.0')
  assert.ok([...notes].length <= NOTES_LIMIT, `${[...notes].length} characters`)
  assert.ok(notes.endsWith('…'))
  assert.doesNotMatch(notes, /\*\*|\]\(|`|^#/m)
  assert.doesNotMatch(notes, /Older|not released/)
  assert.equal(releaseNotes(CHANGELOG, '0.19.0'), '• Older.')
  assert.throws(() => releaseNotes(CHANGELOG, '0.21.0'), /no section for 0\.21\.0/)
})

test('without the service account it warns and uploads nothing', async () => {
  calls = []
  const { log, lines } = quiet()
  const out = await upload({ tag: 'v0.20.0', aab, credentials: '', changelog: CHANGELOG, api, log })
  assert.deepEqual(out, { skipped: 'no credentials' })
  assert.deepEqual(calls, [])
  assert.match(lines[0], /^warning: PLAY_SERVICE_ACCOUNT_JSON is not set/)
})

test('without the signed bundle it warns and uploads nothing', async () => {
  calls = []
  const { log, lines } = quiet()
  const out = await upload({ tag: 'v0.20.0', aab: join(dir, 'missing.aab'), credentials: credentials(), changelog: CHANGELOG, api, log })
  assert.deepEqual(out, { skipped: 'no bundle' })
  assert.deepEqual(calls, [])
  assert.match(lines[0], /^warning: no signed bundle/)
})

test('a release candidate makes no call', async () => {
  calls = []
  const { log } = quiet()
  for (const tag of ['v0.20.0-rc.1', 'v0.20.0-beta', 'main']) {
    assert.deepEqual(await upload({ tag, aab, credentials: credentials(), changelog: CHANGELOG, api, log }), { skipped: 'not a final release' })
  }
  assert.deepEqual(calls, [])
})

test('a bundle with another version code is not put on the track', async () => {
  calls = []
  versionCode = 1999
  const { log } = quiet()
  await assert.rejects(upload({ tag: 'v0.20.0', aab, credentials: credentials(), changelog: CHANGELOG, api, log }), /version code 1999, v0\.20\.0 needs 2000/)
  assert.ok(!calls.some((c) => c.url.includes('/tracks/') || c.url.endsWith(':commit')))
  versionCode = 2000
})

test('version codes follow major·10000 + minor·100 + patch', () => {
  assert.deepEqual(finalVersion('v0.20.0'), { version: '0.20.0', code: 2000 })
  assert.deepEqual(finalVersion('v1.2.3'), { version: '1.2.3', code: 10203 })
  assert.equal(finalVersion('v1.0.0-rc.2'), null)
})
