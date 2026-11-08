// End-to-end check of a revoked device (OpenSpec change revoked-device-wipe)
// against a running server with a FRESH data directory: two browser contexts are
// two devices of one account. The phone holds a synced task and a change queued
// offline; the laptop signs out everywhere. When the phone reconnects, it must
// remove its local copy (tasks and outbox) and show the sign-in screen with the
// notice. See scripts/README.md.
// Resolve Playwright locally (npm i / npx -p) or from a global install (npm i -g playwright).
const { chromium } = await import('playwright').catch(async () => {
  const { createRequire } = await import('node:module')
  const { execSync } = await import('node:child_process')
  return createRequire(execSync('npm root -g').toString().trim() + '/')('playwright')
})

const base = process.env.OPENTODO_URL ?? 'http://127.0.0.1:8080'
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []
async function device() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  // Offline and after the revocation the app's own requests fail on purpose.
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|net::|401/.test(m.text())) errors.push('console: ' + m.text()) })
  return { ctx, page }
}
const step = (s) => console.log('·', s)
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const row = (page, title) => page.getByRole('button', { name: new RegExp('^' + esc(title)) })
/** Rows of the device's local database: its tasks and its unsynced changes. */
const local = (page) => page.evaluate(() => new Promise((resolve, reject) => {
  const req = indexedDB.open('opentodo')
  req.onerror = () => reject(req.error)
  req.onsuccess = () => {
    const tx = req.result.transaction(['tasks', 'outbox'], 'readonly')
    const counts = {}
    for (const name of ['tasks', 'outbox']) tx.objectStore(name).count().onsuccess = (e) => { counts[name] = e.target.result }
    tx.oncomplete = () => { req.result.close(); resolve(counts) }
  }
}))
async function closeFirstRun(page) {
  await page.locator('[data-welcome-close]').click({ timeout: 3000 }).catch(() => undefined)
  await page.locator('[data-first-run-skip-all]').click({ timeout: 2000 }).catch(() => undefined)
}

const laptop = await device()
step('owner setup on the laptop')
await laptop.page.goto(base)
await laptop.page.getByText('Create the owner account').waitFor()
await laptop.page.getByLabel('Name').fill('Ada')
await laptop.page.getByLabel('Email').fill('ada@example.com')
await laptop.page.getByLabel(/Password/).fill('correct horse battery staple')
await laptop.page.getByRole('button', { name: 'Create owner account' }).click()
await laptop.page.locator('[data-testid="welcome"]').waitFor()
await closeFirstRun(laptop.page)

step('the phone signs in and receives a task')
const phone = await device()
await phone.page.goto(base)
await phone.page.getByLabel('Email').fill('ada@example.com')
await phone.page.getByLabel(/Password/).fill('correct horse battery staple')
await phone.page.getByRole('button', { name: 'Sign in', exact: true }).click()
await phone.page.getByRole('combobox', { name: 'Add a task' }).waitFor({ timeout: 15000 })
await closeFirstRun(phone.page)
const quick = laptop.page.getByRole('combobox', { name: 'Add a task' })
await quick.fill('Passport number')
await quick.press('Enter')
await row(phone.page, 'Passport number').waitFor({ timeout: 20000 })

step('the phone goes offline and queues a change')
await phone.ctx.setOffline(true)
const phoneQuick = phone.page.getByRole('combobox', { name: 'Add a task' })
await phoneQuick.fill('Written on the phone')
await phoneQuick.press('Enter')
await row(phone.page, 'Written on the phone').waitFor()
const before = await local(phone.page)
if (!(before.tasks >= 2 && before.outbox >= 1)) throw new Error(`the phone holds ${JSON.stringify(before)} before the revocation`)

step('the laptop signs out everywhere')
const status = await laptop.page.evaluate(async () => (await fetch('/api/v1/me/sign-out-everywhere', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status)
if (status !== 204) throw new Error(`sign out everywhere answered ${status}`)

step('the phone reconnects and removes its copy')
await phone.ctx.setOffline(false)
await phone.page.reload()
await phone.page.getByText('This device was signed out and its data was removed.').waitFor({ timeout: 20000 })
const after = await local(phone.page)
if (after.tasks !== 0 || after.outbox !== 0) throw new Error(`the phone still holds ${JSON.stringify(after)}`)
const cookies = (await phone.ctx.cookies()).filter((c) => c.name === 'opentodo_session' && c.value)
if (cookies.length) throw new Error('the revoked session cookie was not cleared')

await browser.close()
if (errors.length) { console.log('BROWSER ERRORS:\n' + errors.join('\n')); process.exit(1) }
console.log('E2E REVOKED OK')
