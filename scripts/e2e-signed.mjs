#!/usr/bin/env node
// Browser end to end of the signed web app (OpenSpec change signed-web-app,
// tasks 5.3 and 7.5): Chromium installs the app from a server and follows its
// updates, each signed with the test key (internal/websign/testdata). It checks
// the trust record the service worker keeps:
//
//   1. v1.0.0 installs in signed mode, the check passed;
//   2. v1.1.0 with one byte added to a chunk is installed while reporting, and
//      recorded as changed-file with that chunk's path;
//   3. a valid v1.2.0 is installed with the check passed;
//   4. a signed v0.9.0 is recorded as older;
//   5. with the server stopped, a reload opens the app from the verified set;
//   6. v1.3.0 says refuse: true and turns refusal on;
//   7. a tampered v1.4.0 is refused: v1.3.0 stays, and the page shows the cause.
//
// The server is a small static one with the routes of internal/web that matter
// here (the page for navigations, /index.html as built, the list never cached),
// so each version is a directory, not a binary. The web app is built once, into
// a temporary directory, with WEB_SIGNING_KEY set to the test key, so the worker
// trusts that key; nothing in internal/web/dist changes.
//
// Env: CHROMIUM_PATH (optional executable), KEEP=1 keeps the temporary directory.
// Run: make e2e-signed (needs Go, Node and Playwright with Chromium).
import { execFileSync, execSync } from 'node:child_process'
import { appendFileSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildManifest } from '../web/scripts/app-manifest.mjs'
import { publicSpki } from '../web/scripts/signingKeys.mjs'

const { chromium } = await import('playwright').catch(async () => {
  const { createRequire } = await import('node:module')
  return createRequire(execSync('npm root -g').toString().trim() + '/')('playwright')
})

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const KEY = path.join(root, 'internal/websign/testdata/test-key.pem')
const tmp = mkdtempSync(path.join(tmpdir(), 'e2e-signed-'))
const log = (...a) => console.log('e2e-signed:', ...a)

// The web app, built once with the test key as its only key.
const build = path.join(tmp, 'build')
const env = { ...process.env, WEB_SIGNING_KEY: KEY }
if (!existsSync(path.join(root, 'web/src/generated/help.json'))) execSync('npm run --silent help', { cwd: path.join(root, 'web'), stdio: 'inherit' })
log('building the web app with the test key')
execFileSync('npx', ['vite', 'build', '--outDir', build, '--logLevel', 'warn'], { cwd: path.join(root, 'web'), env, stdio: 'inherit' })
const websign = path.join(tmp, 'websign')
execFileSync('go', ['build', '-o', websign, './cmd/websign'], { cwd: root, stdio: 'inherit' })
const keys = [{ spki: publicSpki(readFileSync(KEY, 'utf8')), role: 'release' }]

/**
 * A version of the app: its own sw.js bytes (so the browser installs a new
 * worker) and one chunk of its own (files unchanged since the installed version
 * are reused, not downloaded, so only a new file can arrive changed), its list, signed.
 */
function release(name, { version, refuse = false, tamper = false }) {
  const dir = path.join(tmp, name)
  cpSync(build, dir, { recursive: true })
  appendFileSync(path.join(dir, 'sw.js'), `\n// ${name}\n`)
  const own = `assets/release-${name}.js`
  writeFileSync(path.join(dir, own), `/* ${name} */\n`)
  writeFileSync(path.join(dir, 'app-manifest.json'), JSON.stringify(buildManifest(dir, { version, keys, refuse }), null, 2) + '\n')
  execFileSync(websign, ['sign', '-key', KEY, '-version', version, dir], { stdio: 'pipe' })
  let changed = null
  if (tamper) {
    // One byte added to a chunk the app installs, after signing: what a rewriting proxy does.
    changed = own
    appendFileSync(path.join(dir, changed), ' ')
  }
  return { dir, version, changed }
}

const v1 = release('v1', { version: '1.0.0' })
const v2 = release('v2-tampered', { version: '1.1.0', tamper: true })
const v3 = release('v3', { version: '1.2.0' })
const v0 = release('v0', { version: '0.9.0' })
const v4 = release('v4-refuse', { version: '1.3.0', refuse: true })
const v5 = release('v5-tampered', { version: '1.4.0', tamper: true })

// The server: like internal/web for the paths the worker uses.
const CSP = JSON.parse(readFileSync(path.join(root, 'internal/httpapi/testdata/csp_fixture.json'), 'utf8')).base
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.md': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json' }
let serving = v1
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '')
  if (p.startsWith('api/') || p === 'healthz') {
    res.writeHead(404, { 'Content-Type': 'application/json' }).end('{"error":{"code":"not_found","message":"no API here"}}')
    return
  }
  const file = !p || (!path.extname(p) && !p.startsWith('assets/')) ? 'index.html' : p
  const full = path.join(serving.dir, file)
  if (!full.startsWith(serving.dir) || !existsSync(full)) {
    res.writeHead(404).end()
    return
  }
  const cache = file === 'sw.js' || file === 'app-manifest.json' ? 'no-store, no-transform' : file.startsWith('assets/') ? 'public, max-age=31536000, immutable, no-transform' : 'no-cache, no-transform'
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': cache, 'Content-Security-Policy': CSP })
  res.end(req.method === 'HEAD' ? undefined : readFileSync(full))
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${server.address().port}`

const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) })
const context = await browser.newContext()
const page = await context.newPage()
let failures = 0
const check = (ok, what) => {
  if (ok) log('ok  ', what)
  else { failures++; console.error('e2e-signed: FAIL', what) }
}

/** The worker's trust record, read without creating the database. */
const record = () => page.evaluate(async () => {
  if (!(await indexedDB.databases()).some((d) => d.name === 'opentodo-app')) return null
  const db = await new Promise((resolve, reject) => { const r = indexedDB.open('opentodo-app'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
  if (!db.objectStoreNames.contains('trust')) { db.close(); return null }
  const value = await new Promise((resolve) => { const r = db.transaction('trust').objectStore('trust').get('record'); r.onsuccess = () => resolve(r.result ?? null) })
  db.close()
  return value
})

async function until(what, test, ms = 30_000) {
  const end = Date.now() + ms
  for (;;) {
    const r = await record().catch(() => null)
    if (r && test(r)) return r
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}: ${JSON.stringify(r?.lastCheck ?? r)}`)
    await new Promise((res) => setTimeout(res, 250))
  }
}

/** Serves another version and reloads, so the browser installs its worker. */
async function serve(next) {
  serving = next
  await page.reload({ waitUntil: 'load' })
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r?.update()))
}

try {
  log('1. first install of', v1.version)
  await page.goto(origin + '/', { waitUntil: 'load' })
  let r = await until('v1 installed', (x) => x.current?.version === '1.0.0')
  check(r.mode === 'signed' && r.lastCheck?.passed === true && r.refuse === false, `v1 in signed mode, check passed (${r.mode}, ${JSON.stringify(r.lastCheck)})`)

  log('2. tampered', v2.version, '(report-only)')
  await serve(v2)
  r = await until('v2 recorded', (x) => x.current?.version === '1.1.0')
  check(r.lastCheck?.passed === false && r.lastCheck?.cause === 'changed-file' && r.lastCheck?.path === v2.changed && r.lastCheck?.refused === false,
    `tampered chunk installed and recorded as changed-file ${v2.changed} (${JSON.stringify(r.lastCheck)})`)
  check(r.mode === 'signed' && r.verified?.version === '1.0.0', 'a failed check keeps signed mode and the verified version')

  log('3. valid', v3.version)
  await serve(v3)
  r = await until('v3 installed', (x) => x.current?.version === '1.2.0')
  check(r.lastCheck?.passed === true && r.verified?.version === '1.2.0', `valid update passed (${JSON.stringify(r.lastCheck)})`)

  log('4. older', v0.version)
  await serve(v0)
  r = await until('v0 recorded', (x) => x.lastCheck?.version === '0.9.0')
  check(r.lastCheck?.cause === 'older' && r.verified?.version === '1.2.0', `older version recorded (${JSON.stringify(r.lastCheck)})`)

  log('5. offline reload')
  // Every new worker has taken over by now (each serves the version it installed).
  await page.waitForFunction(async () => !(await navigator.serviceWorker.getRegistration())?.waiting, null, { timeout: 20_000 })
  const port = server.address().port
  const closed = new Promise((res) => server.close(res))
  server.closeAllConnections()
  await closed
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!document.getElementById('root')?.childElementCount, null, { timeout: 15_000 }).catch(() => {})
  const offline = await page.evaluate(() => ({ root: !!document.getElementById('root')?.childElementCount, controlled: !!navigator.serviceWorker.controller }))
  check(offline.root && offline.controlled, `the app opens from the verified set with the server stopped (${JSON.stringify(offline)})`)
  await new Promise((res) => server.listen(port, '127.0.0.1', res))

  log('6. refusal on with', v4.version)
  await serve(v4)
  r = await until('v4 installed', (x) => x.current?.version === '1.3.0')
  check(r.refuse === true && r.lastCheck?.passed === true, 'refuse: true turns refusal on')

  log('7. tampered', v5.version, '(refusal on)')
  await serve(v5)
  r = await until('v5 refused', (x) => x.lastCheck?.version === '1.4.0')
  check(r.lastCheck?.refused === true && r.lastCheck?.cause === 'changed-file' && r.current?.version === '1.3.0', `tampered update refused, 1.3.0 kept (${JSON.stringify(r.lastCheck)})`)
  const banner = await page.waitForSelector('[data-update-banner="refused"]', { timeout: 15_000 }).then((el) => el.textContent()).catch(() => '')
  check(/This update wasn.t installed\. A proxy or the server changed the app.s files\./.test(banner) && banner.includes('What to do'), `the page names the cause: "${banner}"`)
} catch (err) {
  failures++
  console.error('e2e-signed:', err)
} finally {
  await browser.close()
  server.close()
  if (process.env.KEEP === '1') log('kept', tmp)
  else rmSync(tmp, { recursive: true, force: true })
}
if (failures) {
  console.error(`e2e-signed: ${failures} failure(s)`)
  process.exit(1)
}
log('all checks passed')
