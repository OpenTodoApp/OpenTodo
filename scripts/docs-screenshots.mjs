// Captures the screenshots of the user guide (docs/images/*.webp) from the seeded
// demo data, in light and dark (OpenSpec change `user-documentation`, task 2.2).
//
//   make docs-screenshots            builds the app, then runs this script
//   node scripts/docs-screenshots.mjs [only,names]
//
// It starts two throwaway servers from bin/opentodo: a demo instance
// (OPENTODO_DEMO=true; one sandbox with the sample data, the banner hidden) for
// everyday screens, and a fresh ordinary instance for account, settings and
// sharing screens the demo switches off. Each shot is written as
// <name>-light.webp and <name>-dark.webp; shots marked `card` also get a small
// card-<name>-{light,dark}.webp for the docs landing page. WebP is encoded by
// Chromium itself (no image tools). Environment: CHROMIUM_PATH (optional),
// OPENTODO_BIN (default bin/opentodo).
const { chromium } = await import('playwright').catch(async () => {
  const { createRequire } = await import('node:module')
  const { execSync } = await import('node:child_process')
  return createRequire(execSync('npm root -g').toString().trim() + '/')('playwright')
})
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const OUT = 'docs/images'
const BIN = process.env.OPENTODO_BIN ?? 'bin/opentodo'
const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null
const want = (name) => !only || only.has(name)
const DESKTOP = { width: 1200, height: 760 }
const PHONE = { width: 390, height: 780 }
const QUALITY = 0.72
const PASSWORD = 'correct horse battery staple'
mkdirSync(OUT, { recursive: true })

// ------------------------------------------------------------------ servers
const freePort = () => new Promise((ok) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)) }) })
const servers = []
async function startServer(env) {
  const port = await freePort()
  const dir = mkdtempSync(join(tmpdir(), 'opentodo-docs-'))
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

const demoBase = await startServer({ OPENTODO_DEMO: 'true' })
const plainBase = await startServer({})
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})

// ------------------------------------------------------------------ encoder
const enc = await (await browser.newContext()).newPage()
// width > 0 makes a card thumbnail: a full desktop screen is cropped to the main
// column (right of the sidebar) at 16:10 so the text stays readable when small.
async function encode(png, width = 0) {
  const b64 = await enc.evaluate(async ([src, w, q]) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + src; await img.decode()
    let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight
    if (w && sw >= 1400) { sx = Math.round(sw * 0.215); sw = Math.round(sw * 0.62); sh = Math.min(sh, Math.round(sw * 10 / 16)) }
    const scale = w ? w / sw : 1
    const c = document.createElement('canvas'); c.width = Math.round(sw * scale); c.height = Math.round(sh * scale)
    const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height)
    return c.toDataURL('image/webp', q).split(',')[1]
  }, [png.toString('base64'), width, QUALITY])
  return Buffer.from(b64, 'base64')
}
let bytes = 0
async function save(name, theme, png, card) {
  const buf = await encode(png)
  writeFileSync(`${OUT}/${name}-${theme}.webp`, buf); bytes += buf.length
  if (card) { const c = await encode(png, 640); writeFileSync(`${OUT}/card-${name}-${theme}.webp`, c); bytes += c.length }
  console.log(`  ${name}-${theme}.webp ${(buf.length / 1024).toFixed(0)} KB`)
}

// ------------------------------------------------------------------ helpers
const HIDE = `[data-testid="demo-banner"]{display:none!important} *,*::before,*::after{caret-color:transparent!important;transition:none!important;animation:none!important}`
async function context(theme, opts = {}) {
  const c = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 1.25, colorScheme: theme, timezoneId: 'UTC', locale: 'en-GB', ...opts })
  await c.addInitScript((css) => { addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = css; document.head.append(s) }) }, HIDE)
  return c
}
const settle = (p, ms = 600) => p.waitForTimeout(ms)
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const row = (p, title) => p.getByRole('button', { name: new RegExp('^' + esc(title)) }).first()
const detail = (p) => p.locator('aside[data-detail-for]')
const sidebar = (p) => p.locator('aside').first()
async function go(p, base, path, ready) { await p.goto(base + path); if (ready) await ready(); await settle(p, 800) }
async function openProject(p, name) { await sidebar(p).getByRole('button', { name: new RegExp('^' + esc(name)) }).first().click(); await p.getByRole('heading', { level: 1, name }).waitFor(); await settle(p) }
async function openTask(p, title) { await row(p, title).click(); await detail(p).waitFor(); await settle(p, 500) }
/** Clip around one element, with padding, clamped to the viewport. */
async function clipOf(p, locator, pad = 12, extra = {}) {
  const b = await locator.boundingBox()
  const vp = p.viewportSize()
  const x = Math.max(0, b.x - pad), y = Math.max(0, b.y - pad)
  return { x, y, width: Math.min(vp.width - x, b.width + 2 * pad + (extra.width ?? 0)), height: Math.min(vp.height - y, b.height + 2 * pad + (extra.height ?? 0)) }
}
// Scroll the detail panel so the element is near its top.
async function scrollPanelTo(p, locator, offset = 16) {
  await locator.evaluate((el, off) => {
    let sc = el.parentElement
    while (sc && !(sc.scrollHeight > sc.clientHeight && /(auto|scroll)/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement
    if (sc) sc.scrollTop += el.getBoundingClientRect().top - sc.getBoundingClientRect().top - off
  }, offset)
  await settle(p, 300)
}

// ------------------------------------------------------------------ demo sandbox
// One sandbox serves both themes (the demo allows five new sandboxes per hour).
async function demoState() {
  const c = await context('light'); const p = await c.newPage()
  await p.goto(demoBase)
  await p.getByRole('button', { name: /Try the demo/i }).click()
  await p.getByLabel('Add a task').waitFor({ timeout: 20000 })
  await settle(p, 1500)
  const state = await c.storageState(); await c.close(); return state
}

// ------------------------------------------------------------------ plain instance
async function plainSetup() {
  const c = await context('light'); const p = await c.newPage()
  await p.goto(plainBase)
  await p.getByText('Create the owner account').waitFor()
  const api = async (method, path, body, ctx = c) => {
    const r = await ctx.request.fetch(plainBase + path, { method, headers: { Origin: plainBase, 'Content-Type': 'application/json' }, data: body === undefined ? undefined : JSON.stringify(body) })
    if (!r.ok()) throw new Error(`${method} ${path} → ${r.status()} ${await r.text()}`)
    const t = await r.text(); return t ? JSON.parse(t) : null
  }
  await p.getByLabel('Name').fill('Ada Lovelace'); await p.getByLabel('Email').fill('ada@example.com'); await p.getByLabel(/Password/).fill(PASSWORD)
  await p.getByRole('button', { name: 'Create owner account' }).click()
  await p.getByLabel('Add a task').waitFor()
  // A second account, a shared project and a pending invitation.
  const { link } = await api('POST', '/api/v1/invitations', { email: 'bob@example.com' })
  const bc = await browser.newContext()
  await api('POST', '/api/v1/auth/register', { email: 'bob@example.com', name: 'Bob Okafor', password: PASSWORD, invitation: link.split('/invite/')[1] }, bc)
  await bc.close()
  await api('POST', '/api/v1/invitations', { email: 'chen@example.com' })
  const home = await api('POST', '/api/v1/projects', { name: 'Home renovation', color: '#f59e0b' })
  await api('POST', `/api/v1/projects/${home.id}/members`, { email: 'bob@example.com', role: 'editor' })
  for (const title of ['Get three quotes for the kitchen', 'Pick paint colours', 'Order new taps']) await api('POST', '/api/v1/tasks', { title, project_id: home.id })
  // Archived projects for Settings → Projects (unarchive-projects).
  const trip = await api('POST', '/api/v1/projects', { name: 'Trip to Lisbon', color: '#0ea5e9' })
  for (const title of ['Book flights', 'Reserve the guesthouse']) {
    const t = await api('POST', '/api/v1/tasks', { title, project_id: trip.id })
    await api('PATCH', `/api/v1/tasks/${t.id}`, { completed_at: Date.now() - 40 * 86_400_000 })
  }
  await api('PATCH', `/api/v1/projects/${trip.id}`, { archived: true })
  const garden = await api('POST', '/api/v1/projects', { name: 'Garden', color: '#22c55e', parent_id: home.id })
  await api('POST', '/api/v1/tasks', { title: 'Plant the spring bulbs', project_id: garden.id })
  await api('PATCH', `/api/v1/projects/${garden.id}`, { archived: true })
  await p.reload(); await settle(p, 1500)
  const state = await c.storageState(); await c.close(); return { state, home }
}

// ------------------------------------------------------------------ shots
// Each shot runs once per theme on a fresh page. `clip` returns a clip rectangle
// (or nothing for the whole viewport).
const D = 'demo', P = 'plain', FRESH = 'fresh'
const shots = [
  { name: 'demo-signin', server: FRESH, base: () => demoBase, async run(p) {
    await p.goto(demoBase); const card = p.getByRole('button', { name: /Try the demo/i }); await card.waitFor(); await settle(p)
    return clipOf(p, p.locator('div[class*="rounded"]').filter({ has: card }).first(), 32)
  } },
  { name: 'setup-owner', server: 'setup', async run(p, { setupBase }) {
    await p.goto(setupBase); await p.getByText('Create the owner account').waitFor(); await settle(p)
    return clipOf(p, p.locator('div[class*="rounded"]').filter({ has: p.locator('form') }).first(), 32)
  } },
  { name: 'today', server: D, card: true, async run(p) { await go(p, demoBase, '/today', () => p.getByRole('heading', { name: 'Overdue' }).waitFor()) } },
  { name: 'quick-add', server: D, card: true, async run(p) {
    await go(p, demoBase, '/today', () => p.getByRole('heading', { name: 'Overdue' }).waitFor())
    const qa = p.getByLabel('Add a task'); await qa.click()
    await qa.pressSequentially('Call Sam about the tiles tomorrow at 4pm #Home @call p2 +15m', { delay: 5 }); await settle(p, 500)
    const main = p.locator('main'); const b = await main.boundingBox()
    const h1 = await p.getByRole('heading', { level: 1 }).boundingBox()
    return { x: b.x, y: h1.y - 16, width: b.width, height: 250 }
  } },
  { name: 'upcoming', server: D, card: true, async run(p) { await go(p, demoBase, '/upcoming', () => p.getByRole('heading', { name: 'Tomorrow' }).first().waitFor()) } },
  { name: 'project-list', server: D, card: true, async run(p) { await go(p, demoBase, '/inbox'); await openProject(p, 'Home renovation') } },
  { name: 'task-detail', server: D, async run(p) { await go(p, demoBase, '/inbox'); await openProject(p, 'Home renovation'); await openTask(p, 'Get three quotes for the kitchen') } },
  { name: 'board', server: D, card: true, async run(p) {
    await go(p, demoBase, '/inbox'); await openProject(p, 'Q4 launch')
    await p.getByRole('group', { name: 'Project layout' }).getByRole('button', { name: 'Board' }).click(); await settle(p, 800)
  }, async after(p) { await p.getByRole('group', { name: 'Project layout' }).getByRole('button', { name: 'List' }).click().catch(() => {}) } },
  { name: 'sidebar', server: D, async run(p) {
    await go(p, demoBase, '/today', () => p.getByRole('heading', { name: 'Overdue' }).waitFor())
    return clipOf(p, sidebar(p), 0)
  } },
  { name: 'labels', server: D, card: true, async run(p) {
    await go(p, demoBase, '/today'); await sidebar(p).getByRole('button', { name: /^errand/ }).click(); await settle(p, 800)
  } },
  { name: 'filter', server: D, card: true, async run(p) {
    await go(p, demoBase, '/filter', () => p.getByLabel('Filter query').waitFor())
    await p.getByLabel('Filter query').fill('(@call | @errand) & due <= 7 days'); await p.getByLabel('Filter query').press('Enter'); await settle(p, 800)
  } },
  { name: 'dashboard', server: D, card: true, async run(p) {
    await go(p, demoBase, '/today'); await sidebar(p).getByRole('button', { name: /^Weekly review/ }).click(); await settle(p, 1000)
  } },
  { name: 'repeat', server: D, async run(p) {
    await go(p, demoBase, '/today', () => p.getByRole('heading', { name: 'Overdue' }).waitFor()); await openTask(p, 'Run club')
    const g = detail(p).getByRole('group', { name: 'Repeat' }); await scrollPanelTo(p, g, 60)
    return clipOf(p, g, 16)
  } },
  { name: 'reminders', server: D, async run(p) {
    await go(p, demoBase, '/inbox'); await openProject(p, 'Home renovation'); await openTask(p, 'Get three quotes for the kitchen')
    const g = detail(p).getByRole('group', { name: 'Reminders' }); await scrollPanelTo(p, detail(p).getByRole('group', { name: 'Due' }), 40)
    const due = await detail(p).getByRole('group', { name: 'Due' }).boundingBox(); const r = await g.boundingBox()
    return { x: due.x - 16, y: due.y - 16, width: due.width + 32, height: r.y + r.height - due.y + 32 }
  } },
  { name: 'week', server: D, card: true, async run(p) {
    await go(p, demoBase, '/week', () => p.getByRole('button', { name: 'Week' }).first().waitFor())
    await p.getByRole('button', { name: 'Hide task list' }).click().catch(() => {}); await settle(p, 500)
  }, async after(p) { await p.getByRole('button', { name: /Show task list/ }).click().catch(() => {}) } },
  { name: 'day', server: D, async run(p) { await go(p, demoBase, '/day', () => p.getByRole('button', { name: 'Day' }).first().waitFor()) } },
  { name: 'comments', server: D, card: true, async run(p) {
    await go(p, demoBase, '/inbox'); await openProject(p, 'Home renovation'); await openTask(p, 'Get three quotes for the kitchen')
    await scrollPanelTo(p, detail(p).getByRole('region', { name: 'Comments and activity' }), 8)
  } },
  { name: 'notifications', card: true, server: D, async run(p) {
    await go(p, demoBase, '/today', () => p.getByRole('heading', { name: 'Overdue' }).waitFor())
    await p.getByRole('button', { name: /^Notifications/ }).click(); const d = p.getByRole('dialog', { name: 'Notifications' }); await d.waitFor(); await settle(p, 500)
    const b = await d.boundingBox(); const vp = p.viewportSize()
    const x = Math.max(0, b.x - 240)
    return { x, y: 0, width: vp.width - x, height: Math.min(vp.height, b.y + b.height + 24) }
  }, async after(p) { await p.keyboard.press('Escape') } },
  { name: 'activity', server: D, card: true, async run(p) { await go(p, demoBase, '/activity', () => p.getByRole('heading', { name: 'Activity' }).waitFor()) } },
  { name: 'history', server: D, async run(p) {
    await go(p, demoBase, '/inbox'); await openProject(p, 'Home renovation'); await openTask(p, 'Pick paint colours')
    const hist = detail(p).getByRole('button', { name: /History/ }).first(); await hist.scrollIntoViewIfNeeded(); await hist.click(); await settle(p, 1200)
    await scrollPanelTo(p, hist, 8)
    const b = await detail(p).boundingBox()
    return { x: b.x, y: b.y, width: b.width, height: Math.min(b.height, 470) }
  } },
  { name: 'trash', server: D, card: true, async run(p) { await go(p, demoBase, '/trash', () => p.getByRole('heading', { name: 'Trash' }).waitFor()) } },
  { name: 'shortcuts', server: D, card: true, async run(p) {
    await go(p, demoBase, '/today', () => p.getByRole('heading', { name: 'Overdue' }).waitFor())
    await p.keyboard.press('?'); await p.getByText('Keyboard shortcuts').first().waitFor(); await settle(p, 500)
  }, async after(p) { await p.keyboard.press('Escape') } },
  { name: 'sync-status', card: true, server: D, async run(p, { ctx }) {
    await go(p, demoBase, '/inbox', () => p.getByLabel('Add a task').waitFor())
    await ctx.setOffline(true); await settle(p, 800)
    const qa = p.getByLabel('Add a task'); await qa.click(); await qa.fill('Buy stamps'); await qa.press('Enter'); await settle(p, 1200)
    const main = p.locator('main'); const b = await main.boundingBox()
    return { x: b.x, y: b.y, width: b.width, height: 330 }
  }, async after(p, { ctx }) { await ctx.setOffline(false); await settle(p, 2500) } },
  // Phone
  { name: 'mobile-today', card: true, server: D, phone: true, async run(p) { await go(p, demoBase, '/today', () => p.getByRole('heading', { name: 'Overdue' }).waitFor()) } },
  { name: 'mobile-menu', server: D, phone: true, async run(p) {
    await go(p, demoBase, '/today', () => p.getByRole('heading', { name: 'Overdue' }).waitFor())
    await p.getByRole('button', { name: 'Open menu' }).click(); await settle(p, 600)
  } },
  // Ordinary instance: account, settings and sharing
  { name: 'signin', card: true, server: FRESH, async run(p) {
    await p.goto(plainBase); await p.getByRole('button', { name: 'Sign in', exact: true }).first().waitFor(); await settle(p)
    return clipOf(p, p.locator('div[class*="rounded"]').filter({ has: p.locator('form') }).first(), 32)
  } },
  { name: 'share-dialog', server: P, async run(p, { home }) {
    await go(p, plainBase, `/project/${home.id}`, () => row(p, 'Pick paint colours').waitFor())
    await p.getByRole('button', { name: /^Share/ }).first().click(); const d = p.getByRole('dialog', { name: /Share/ }); await d.waitFor()
    await d.getByRole('textbox').first().fill('chen@example.com').catch(() => {}); await settle(p, 500)
    return clipOf(p, d.locator('> div').first(), 16).catch(() => clipOf(p, d, 0))
  }, async after(p) { await p.keyboard.press('Escape') } },
  { name: 'settings', server: P, card: true, async run(p) { await go(p, plainBase, '/settings', () => p.getByRole('heading', { name: 'Settings', level: 1 }).waitFor()) } },
  { name: 'settings-security', card: true, server: P, async run(p) {
    await go(p, plainBase, '/settings', () => p.getByRole('heading', { name: 'Settings', level: 1 }).waitFor())
    const h = p.getByRole('heading', { level: 2, name: 'Two-factor authentication' }); await h.waitFor()
    await h.evaluate((el) => el.scrollIntoView({ block: 'start' })); await settle(p, 400)
    const main = await p.locator('main').boundingBox(); const top = await h.boundingBox()
    return { x: main.x, y: Math.max(0, top.y - 20), width: main.width, height: 350 }
  } },
  { name: 'settings-passkeys', server: P, async run(p) {
    await go(p, plainBase, '/settings', () => p.getByRole('heading', { name: 'Settings', level: 1 }).waitFor())
    const h = p.getByRole('heading', { level: 2, name: 'Security' }); await h.waitFor()
    await h.evaluate((el) => el.scrollIntoView({ block: 'start' })); await settle(p, 400)
    const main = await p.locator('main').boundingBox(); const top = await h.boundingBox()
    return { x: main.x, y: Math.max(0, top.y - 20), width: main.width, height: 270 }
  } },
  { name: 'settings-notifications', server: P, permissions: ['notifications'], async run(p) {
    await go(p, plainBase, '/settings', () => p.getByRole('heading', { name: 'Settings', level: 1 }).waitFor())
    const h = p.getByRole('heading', { level: 2, name: 'Notifications' }); await h.waitFor()
    await h.evaluate((el) => el.scrollIntoView({ block: 'start' })); await settle(p, 400)
    const main = await p.locator('main').boundingBox(); const top = await h.boundingBox()
    return { x: main.x, y: Math.max(0, top.y - 20), width: main.width, height: 240 }
  } },
  { name: 'archived-projects', server: P, async run(p) {
    await go(p, plainBase, '/settings', () => p.getByRole('heading', { name: 'Settings', level: 1 }).waitFor())
    const h = p.getByRole('heading', { level: 2, name: 'Projects' }); await h.waitFor()
    await p.getByRole('heading', { name: 'Archived projects' }).waitFor()
    await h.evaluate((el) => el.scrollIntoView({ block: 'start' })); await settle(p, 400)
    const main = await p.locator('main').boundingBox(); const top = await h.boundingBox()
    const list = await p.getByTestId('archived-projects').boundingBox()
    return { x: main.x, y: Math.max(0, top.y - 20), width: main.width, height: list.y + list.height - top.y + 44 }
  } },
  { name: 'members', server: P, async run(p) {
    await go(p, plainBase, '/settings', () => p.getByRole('heading', { name: 'Settings', level: 1 }).waitFor())
    const h = p.getByRole('heading', { level: 2, name: 'Members' }); await h.waitFor()
    await h.evaluate((el) => el.scrollIntoView({ block: 'start' })); await settle(p, 400)
    const main = await p.locator('main').boundingBox(); const top = await h.boundingBox()
    return { x: main.x, y: Math.max(0, top.y - 20), width: main.width, height: 380 }
  } },
  { name: 'import', card: true, server: P, async run(p) { await go(p, plainBase, '/settings/import', () => p.getByRole('heading', { level: 1 }).first().waitFor()) } },
]

// ------------------------------------------------------------------ run
const demo = shots.some((s) => s.server === D && want(s.name)) ? await demoState() : null
const plain = shots.some((s) => s.server === P && want(s.name)) || want('signin') ? await plainSetup() : null
let failed = 0
for (const shot of shots) {
  if (!want(shot.name)) continue
  for (const theme of ['light', 'dark']) {
    const opts = shot.phone ? { viewport: PHONE, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true } : {}
    let extra = {}
    if (shot.server === 'setup') extra.setupBase = await startServer({})
    const storageState = shot.server === D ? demo : shot.server === P ? plain.state : undefined
    const ctx = await context(theme, { ...opts, storageState, ...(shot.permissions ? { permissions: shot.permissions } : {}) })
    const p = await ctx.newPage()
    try {
      const clip = await shot.run(p, { ctx, home: plain?.home, ...extra })
      const png = await p.screenshot(clip ? { clip } : {})
      await save(shot.name, theme, png, shot.card)
      if (shot.after) await shot.after(p, { ctx })
    } catch (err) {
      failed++
      console.error(`  ${shot.name}-${theme}: ${err.message.split('\n')[0]}`)
    }
    await ctx.close()
  }
}
await browser.close()
stopServers()
console.log(`${failed ? 'SHOTS FAILED' : 'SHOTS OK'}: ${(bytes / 1024).toFixed(0)} KB written to ${OUT}/`)
process.exit(failed ? 1 : 0)
