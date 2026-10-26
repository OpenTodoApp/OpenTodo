// End-to-end check of an offline start (OpenSpec offline-first-sync, web-app) against
// a running server with a FRESH data directory: the built service worker takes
// control, the network goes away, a reload still opens the app from the precache
// with the tasks from IndexedDB, /api/* is never answered from a cache, a task added
// offline is queued, and it reaches the server once the network is back.
// See scripts/README.md.
// Resolve Playwright locally (npm i / npx -p) or from a global install (npm i -g playwright).
const { chromium } = await import('playwright').catch(async () => {
  const { createRequire } = await import('node:module')
  const { execSync } = await import('node:child_process')
  return createRequire(execSync('npm root -g').toString().trim() + '/')('playwright')
})

const base = process.env.OPENTODO_URL ?? 'http://127.0.0.1:8080'
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
// Offline, the app's own requests fail on purpose; those are not errors of the page.
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|net::/.test(m.text())) errors.push('console: ' + m.text()) })

const step = (s) => console.log('·', s)
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const row = (title) => page.getByRole('button', { name: new RegExp('^' + esc(title)) })
const serverTitles = () => page.evaluate(async () => ((await (await fetch('/api/v1/tasks')).json()).tasks ?? []).map((t) => t.title))

step('owner setup')
await page.goto(base)
await page.getByText('Create the owner account').waitFor()
await page.getByLabel('Name').fill('Ada')
await page.getByLabel('Email').fill('ada@example.com')
await page.getByLabel(/Password/).fill('correct horse battery staple')
await page.getByRole('button', { name: 'Create owner account' }).click()
await page.locator('[data-testid="welcome"]').waitFor()
await page.locator('[data-welcome-close]').click()
const guide = page.locator('[data-testid="start-guide"]')
await guide.waitFor()
await guide.locator('[data-first-run-skip-all]').click()
await guide.waitFor({ state: 'detached' })

step('a task synced while online')
const quick = page.getByRole('combobox', { name: 'Add a task' })
await quick.fill('Online before the outage')
await quick.press('Enter')
await row('Online before the outage').waitFor()
for (let i = 0; i < 75 && !(await serverTitles()).includes('Online before the outage'); i++) await page.waitForTimeout(200)
if (!(await serverTitles()).includes('Online before the outage')) throw new Error('the online task did not reach the server')

step('the built service worker controls the page')
await page.reload()
await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 })
const manifest = await page.evaluate(async () => {
  const r = await fetch('/manifest.webmanifest')
  return { status: r.status, type: r.headers.get('content-type') ?? '', body: await r.json() }
})
if (manifest.status !== 200 || !manifest.body.start_url || !manifest.body.icons?.length) throw new Error(`manifest: ${JSON.stringify(manifest)}`)

step('cold start with the network off')
await ctx.setOffline(true)
await page.reload()
await page.getByRole('combobox', { name: 'Add a task' }).waitFor({ timeout: 15000 })
await row('Online before the outage').waitFor({ timeout: 15000 })

step('/api/* is never served from a cache')
const api = await page.evaluate(async () => {
  try {
    const r = await fetch('/api/v1/tasks')
    return `answered ${r.status}`
  } catch {
    return 'network error'
  }
})
if (api !== 'network error') throw new Error(`an API request was answered offline (${api}): the service worker must not cache /api/*`)

step('a task added offline is queued')
await quick.fill('Added while offline')
await quick.press('Enter')
await row('Added while offline').waitFor()

step('back online: the queued task reaches the server')
await ctx.setOffline(false)
let titles = []
for (let i = 0; i < 100; i++) {
  titles = await serverTitles().catch(() => [])
  if (titles.includes('Added while offline')) break
  await page.waitForTimeout(200)
}
if (!titles.includes('Added while offline')) throw new Error(`the offline task did not sync: ${JSON.stringify(titles)}`)

await browser.close()
if (errors.length) { console.log('BROWSER ERRORS:\n' + errors.join('\n')); process.exit(1) }
console.log('E2E OFFLINE OK')
