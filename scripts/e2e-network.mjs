// Network audit (OpenSpec change task-locations, task 7.1): a browser using locations
// and maps only ever talks to the OpenTodo server, and the server talks to the map
// providers only when maps are on. Starts a fake tile and Photon provider on
// localhost and two fresh servers, one with OPENTODO_MAPS=off and one with maps on
// (both pointed at the fake through OPENTODO_MAPS_TILES_URL and
// OPENTODO_MAPS_GEOCODER_URL), so nothing reaches OpenFreeMap or Photon. In each it
// opens a task with a location, its location editor (with an address search when maps
// are on) and the Locations page, and checks:
//   - every browser request goes to that server's origin;
//   - maps off: the fake provider receives nothing at all;
//   - maps on: the fake receives the style, tiles and the search, with OpenTodo's
//     User-Agent and none of the viewer's cookies, tokens or address.
//
//   node scripts/e2e-network.mjs        (after `make web` and building bin/opentodo)
//
// Env: OPENTODO_BIN (default bin/opentodo), CHROMIUM_PATH.
const { chromium } = await import('playwright').catch(async () => {
  const { createRequire } = await import('node:module')
  const { execSync } = await import('node:child_process')
  return createRequire(execSync('npm root -g').toString().trim() + '/')('playwright')
})
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BIN = process.env.OPENTODO_BIN ?? 'bin/opentodo'
const step = (s) => console.log('·', s)
const assert = (c, msg) => { if (!c) throw new Error('ASSERT: ' + msg) }

// ---- the fake provider ----
const hits = []
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
const fake = createServer((req, res) => {
  const url = new URL(req.url, 'http://fake')
  hits.push({ path: url.pathname, ua: req.headers['user-agent'] ?? '', creds: !!(req.headers.cookie || req.headers.authorization || req.headers['x-forwarded-for']) })
  const base = `http://${req.headers.host}`
  const json = (v) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(v)) }
  if (url.pathname === '/styles/liberty') return json({
    version: 8,
    sources: { openmaptiles: { type: 'vector', url: `${base}/planet` } },
    glyphs: `${base}/fonts/{fontstack}/{range}.pbf`, sprite: `${base}/sprites/ofm`,
    layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#f8f4f0' } }, { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water' }],
  })
  if (url.pathname === '/planet') return json({ tiles: [`${base}/planet/v1/{z}/{x}/{y}.pbf`], minzoom: 0, maxzoom: 14, attribution: 'OpenStreetMap' })
  if (url.pathname.startsWith('/planet/v1/')) { res.setHeader('Content-Type', 'application/x-protobuf'); return res.end(Buffer.alloc(0)) }
  if (url.pathname.startsWith('/fonts/')) { res.setHeader('Content-Type', 'application/x-protobuf'); return res.end(Buffer.alloc(0)) }
  if (url.pathname.startsWith('/sprites/')) {
    if (url.pathname.endsWith('.json')) return json({})
    res.setHeader('Content-Type', 'image/png'); return res.end(PNG)
  }
  if (url.pathname === '/api' || url.pathname === '/reverse') return json({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [9.1916, 45.4641] }, properties: { name: 'Piazza del Duomo', street: 'Piazza del Duomo', postcode: '20122', city: 'Milano', country: 'Italia' } }] })
  res.statusCode = 404; res.end()
})
await new Promise((ok) => fake.listen(0, '127.0.0.1', ok))
const fakeBase = `http://127.0.0.1:${fake.address().port}`

// ---- servers ----
async function freePort() {
  const s = createServer()
  await new Promise((ok) => s.listen(0, '127.0.0.1', ok))
  const { port } = s.address()
  await new Promise((ok) => s.close(ok))
  return port
}
const servers = []
async function startServer(env) {
  const port = await freePort()
  const dir = mkdtempSync(join(tmpdir(), 'opentodo-net-'))
  const base = `http://127.0.0.1:${port}`
  const proc = spawn(BIN, [], { env: { ...process.env, OPENTODO_ADDR: `127.0.0.1:${port}`, OPENTODO_DATA_DIR: dir, OPENTODO_BASE_URL: base, ...env }, stdio: 'ignore' })
  servers.push({ proc, dir })
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${base}/healthz`)).ok) return base } catch { /* not up yet */ }
    await new Promise((ok) => setTimeout(ok, 250))
  }
  throw new Error('server did not start')
}

// WebGL through SwiftShader, so the map really draws (and requests its tiles).
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const errors = []

async function audit(name, env, mapsOn) {
  step(`${name}: fresh server`)
  const base = await startServer({ OPENTODO_MAPS_TILES_URL: `${fakeBase}/styles/liberty`, OPENTODO_MAPS_GEOCODER_URL: fakeBase, ...env })
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } })
  await ctx.addInitScript(() => { try { localStorage.setItem('opentodo.rowClick', 'open') } catch { /* no storage */ } })
  const outside = []
  ctx.on('request', (r) => {
    const u = r.url()
    if (u.startsWith('data:') || u.startsWith('blob:')) return
    if (new URL(u).origin !== base) outside.push(u)
  })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
  const api = ctx.request
  const reg = await api.post(`${base}/api/v1/auth/register`, { data: { email: 'ada@example.com', name: 'Ada', password: 'correct horse battery staple' } })
  assert(reg.status() === 201, `${name}: register ${reg.status()}`)
  const loc = { name: 'Colosseo', address: 'Piazza del Colosseo, 00184 Roma, Italia', lat: 41.890942, lon: 12.491903 }
  const task = await api.post(`${base}/api/v1/tasks`, { data: { title: 'Visit the Colosseum', location: loc } })
  assert(task.ok(), `${name}: task ${task.status()}`)
  const before = hits.length

  step(`${name}: task panel with its location`)
  await page.goto(`${base}/inbox`)
  await page.getByRole('button', { name: /^Visit the Colosseum/ }).first().click()
  await page.locator('aside[data-detail-for]').waitFor()
  if (mapsOn) {
    await page.locator('[data-location-preview] canvas').waitFor({ timeout: 20000 })
    await page.waitForTimeout(1500) // tiles
  } else {
    await page.locator('[data-open-in-maps]').waitFor()
    assert(await page.locator('[data-location-preview] canvas').count() === 0, `${name}: no map with maps off`)
  }

  step(`${name}: location editor${mapsOn ? ' and an address search' : ''}`)
  await page.locator('aside[data-detail-for]').getByRole('button', { name: /^Where: .*Colosseo/ }).first().click()
  const editor = page.locator('[data-location-editor]')
  await editor.waitFor()
  if (mapsOn) {
    await editor.locator('input').first().fill('Piazza del Duomo Milano')
    await page.getByRole('option', { name: /Piazza del Duomo/ }).first().waitFor({ timeout: 10000 })
  } else {
    assert(await page.locator('[data-privacy-line]').count() === 0, `${name}: no search notice with maps off`)
  }
  await page.keyboard.press('Escape')

  step(`${name}: Locations page`)
  await page.goto(`${base}/locations`)
  await page.locator('[data-places-page]').waitFor()
  await page.waitForTimeout(mapsOn ? 1500 : 500)

  const received = hits.slice(before)
  assert(outside.length === 0, `${name}: the browser contacted another origin: ${outside.slice(0, 5).join(', ')}`)
  if (!mapsOn) {
    assert(received.length === 0, `${name}: the server contacted the map provider with maps off: ${received.map((h) => h.path).join(', ')}`)
  } else {
    const paths = received.map((h) => h.path)
    assert(paths.includes('/styles/liberty'), `${name}: no style request (${paths.join(', ')})`)
    assert(paths.some((p) => p.startsWith('/planet/v1/')), `${name}: no tile request (${paths.join(', ')})`)
    assert(paths.includes('/api'), `${name}: no search request (${paths.join(', ')})`)
    assert(received.every((h) => !h.creds), `${name}: a provider request carried the viewer's cookie, token or address`)
    assert(received.every((h) => /OpenTodo/i.test(h.ua)), `${name}: a provider request without OpenTodo's User-Agent: ${received.map((h) => h.ua).join(' | ')}`)
    console.log(`  provider requests: ${received.length} (${[...new Set(paths.map((p) => p.split('/').slice(0, 2).join('/')))].join(', ')})`)
  }
  console.log(`  browser requests outside ${base}: 0`)
  await ctx.close()
}

try {
  await audit('maps off', { OPENTODO_MAPS: 'off' }, false)
  await audit('maps on', {}, true)
  assert(errors.length === 0, 'page errors: ' + errors.join(' | '))
  console.log('NETWORK OK')
} finally {
  await browser.close()
  for (const s of servers) { s.proc.kill(); rmSync(s.dir, { recursive: true, force: true }) }
  fake.close()
}
