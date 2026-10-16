// Before/after screenshots of the core screens from the seeded demo fixture
// (OpenSpec change `ux-overhaul`, task 8.9; UX audit, section 1 "How this audit
// was made" and item O4). Every change touching web/src/app attaches these to its
// pull request, captured once on main and once on the branch.
//
//   make screens                                  builds the app, then runs this script
//   node scripts/screens.mjs [only,names]          e.g. node scripts/screens.mjs inbox,board
//   OUT_DIR=dist/screens-before make screens      write elsewhere (the "before" run)
//
// It starts one throwaway bin/opentodo in demo mode (OPENTODO_DEMO=true: a sandbox
// with the sample data, the banner hidden), signs in, and writes each screen as
// <out>/<name>-<desktop|phone>-<light|dark>.png at 1280×800 and 390×844, in light
// and dark (PNG straight from Chromium, no image tools). Environment: OUT_DIR
// (default dist/screens), CHROMIUM_PATH (optional), OPENTODO_BIN (default
// bin/opentodo). The screens the demo cannot show (settings sections it switches
// off) are not in the list; Settings is captured as the overview and Appearance.
const { chromium } = await import('playwright').catch(async () => {
  const { createRequire } = await import('node:module')
  const { execSync } = await import('node:child_process')
  return createRequire(execSync('npm root -g').toString().trim() + '/')('playwright')
})
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const OUT = process.env.OUT_DIR ?? 'dist/screens'
const BIN = process.env.OPENTODO_BIN ?? 'bin/opentodo'
const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null
const want = (name) => !only || only.has(name)
const VIEWPORTS = {
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
}
const THEMES = ['light', 'dark']
mkdirSync(OUT, { recursive: true })

// ------------------------------------------------------------------ server
const freePort = () => new Promise((ok) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)) }) })
const servers = []
async function startServer(env) {
  const port = await freePort()
  const dir = mkdtempSync(join(tmpdir(), 'opentodo-screens-'))
  const base = `http://localhost:${port}`
  const proc = spawn(BIN, [], { env: { ...process.env, OPENTODO_ADDR: `127.0.0.1:${port}`, OPENTODO_DATA_DIR: dir, OPENTODO_BASE_URL: base, ...env }, stdio: 'ignore' })
  servers.push({ proc, dir })
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/healthz`)).ok) return base } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`server on ${base} did not start`)
}
function stopServers() {
  for (const s of servers) { s.proc.kill(); rmSync(s.dir, { recursive: true, force: true }) }
}
process.on('exit', stopServers)

const base = await startServer({ OPENTODO_DEMO: 'true' })
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})

// ------------------------------------------------------------------ helpers
const HIDE = `[data-testid="demo-banner"]{display:none!important} *,*::before,*::after{caret-color:transparent!important;transition:none!important;animation:none!important}`
async function context(theme, device, opts = {}) {
  const c = await browser.newContext({ ...VIEWPORTS[device], colorScheme: theme, timezoneId: 'UTC', locale: 'en-GB', ...opts })
  await c.addInitScript((css) => { addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = css; document.head.append(s) }) }, HIDE)
  return c
}
const settle = (p, ms = 600) => p.waitForTimeout(ms)
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const row = (p, title) => p.getByRole('button', { name: new RegExp('^' + esc(title)) }).first()
const detail = (p) => p.locator('aside[data-detail-for]')
const quickAddInput = (p) => p.locator('input[aria-label="Add a task"]').first()
async function go(p, path, ready) { await p.goto(base + path); if (ready) await ready(); await settle(p, 800) }
async function openTask(p, title) { await row(p, title).click(); await detail(p).waitFor(); await settle(p, 500) }
/** Focus the quick add field: the inline field where there is one, else the sheet opened with `q`. */
async function focusQuickAdd(p) {
  const inline = quickAddInput(p)
  if (await inline.count()) { await inline.click(); return inline }
  await p.keyboard.press('q')
  const field = p.locator('[data-quick-add-sheet] input[aria-label="Add a task"], input[aria-label="Add a task"]').first()
  await field.waitFor({ timeout: 5000 })
  return field
}
/** Switch a project between List and Board; the pointer then leaves the button so its tooltip is not in the shot. */
async function setLayout(p, layout) {
  await p.getByRole('group', { name: 'Project layout' }).getByRole('button', { name: layout }).click()
  await p.mouse.move(0, 0); await settle(p, 800)
}

// ------------------------------------------------------------------ demo sandbox
// One sandbox serves every shot (the demo allows five new sandboxes per hour);
// the project ids come from the API so phone shots can open them by address.
async function demoState() {
  const c = await context('light', 'desktop'); const p = await c.newPage()
  await p.goto(base)
  await p.getByRole('button', { name: /Try the demo/i }).click()
  await p.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 20000 })
  await settle(p, 1500)
  const r = await c.request.get(base + '/api/v1/projects')
  if (!r.ok()) throw new Error(`GET /api/v1/projects → ${r.status()}`)
  const body = await r.json()
  const projects = Array.isArray(body) ? body : body.projects ?? body.items ?? []
  const byName = (name) => { const pr = projects.find((x) => x.name === name); if (!pr) throw new Error(`demo project "${name}" not found`); return pr.id }
  const ids = { home: byName('Home renovation'), launch: byName('Q4 launch') }
  const state = await c.storageState(); await c.close(); return { state, ids }
}

// ------------------------------------------------------------------ screens
// Each screen runs once per device and theme on a fresh page; the whole
// viewport is captured.
const h1 = (p, name) => () => p.getByRole('heading', { level: 1, name }).first().waitFor()
const screens = [
  { name: 'inbox', async run(p) { await go(p, '/', h1(p, 'Inbox')) } },
  { name: 'today', async run(p) { await go(p, '/today', h1(p, 'Today')) } },
  { name: 'upcoming', async run(p) { await go(p, '/upcoming', h1(p, 'Upcoming')) } },
  { name: 'project-list', async run(p, { ids }) { await go(p, `/project/${ids.home}`, h1(p, 'Home renovation')); await setLayout(p, 'List') } },
  { name: 'project-board', async run(p, { ids }) { await go(p, `/project/${ids.launch}`, h1(p, 'Q4 launch')); await setLayout(p, 'Board') },
    async after(p) { await setLayout(p, 'List').catch(() => {}) } },
  { name: 'calendar-day', async run(p) { await go(p, '/day', () => p.getByRole('region', { name: 'Day calendar' }).waitFor()) } },
  { name: 'calendar-week', async run(p) { await go(p, '/week', () => p.getByRole('region', { name: 'Week calendar' }).waitFor()) } },
  { name: 'task-panel', async run(p, { ids }) {
    await go(p, `/project/${ids.home}`, h1(p, 'Home renovation')); await openTask(p, 'Get three quotes for the kitchen')
  } },
  { name: 'quick-add', async run(p) {
    await go(p, '/today', h1(p, 'Today'))
    const field = await focusQuickAdd(p)
    await field.pressSequentially('Call Sam about the tiles tomorrow at 4pm #Home @call p2 +15m', { delay: 5 }); await settle(p, 500)
  }, async after(p) { await p.keyboard.press('Escape') } },
  { name: 'settings', async run(p) { await go(p, '/settings', () => p.locator('[data-settings-overview], [data-settings-section]').first().waitFor()) } },
  { name: 'settings-appearance', async run(p) { await go(p, '/settings/appearance', h1(p, 'Appearance')) } },
  { name: 'help', async run(p) { await go(p, '/help', h1(p, 'Help')) } },
]

// ------------------------------------------------------------------ run
const unknown = only ? [...only].filter((n) => !screens.some((s) => s.name === n)) : []
if (unknown.length) { console.error(`unknown screens: ${unknown.join(', ')}\navailable: ${screens.map((s) => s.name).join(', ')}`); process.exit(2) }
const demo = await demoState()
const written = []
let failed = 0
for (const screen of screens) {
  if (!want(screen.name)) continue
  for (const device of Object.keys(VIEWPORTS)) {
    for (const theme of THEMES) {
      const file = `${screen.name}-${device}-${theme}.png`
      const ctx = await context(theme, device, { storageState: demo.state })
      const p = await ctx.newPage()
      try {
        await screen.run(p, { ctx, ids: demo.ids, device })
        const png = await p.screenshot()
        writeFileSync(join(OUT, file), png); written.push(file)
        console.log(`  ${file} ${(png.length / 1024).toFixed(0)} KB`)
        if (screen.after) await screen.after(p, { ctx })
      } catch (err) {
        failed++
        console.error(`  ${file}: ${err.message.split('\n')[0]}`)
      }
      await ctx.close()
    }
  }
}
await browser.close()
stopServers()
console.log(`\n${written.length} file${written.length === 1 ? '' : 's'} written to ${resolve(OUT)}/`)
for (const f of written) console.log(`  ${f}`)
console.log(failed ? `SCREENS FAILED: ${failed} shot${failed === 1 ? '' : 's'} failed` : 'SCREENS OK')
process.exit(failed ? 1 : 0)
