// End-to-end check of Habits (OpenSpec change habits-home) against a running server
// with a FRESH data directory: a new account sees nothing about habits; turning on
// Track as a habit on "Run" turns Habits on with one message, and Today then shows
// Run in its Habits strip, not as a row; the Habits screen checks it in.
// See scripts/README.md.
const { chromium } = await import('playwright').catch(async () => {
  const { createRequire } = await import('node:module')
  const { execSync } = await import('node:child_process')
  return createRequire(execSync('npm root -g').toString().trim() + '/')('playwright')
})

const base = process.env.OPENTODO_URL ?? 'http://127.0.0.1:8080'
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []
const step = (s) => console.log('·', s)
const assert = (c, msg) => { if (!c) throw new Error('ASSERT: ' + msg) }
const now = new Date()
const TODAY = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) errors.push(`console: ${m.text()}`) })
const api = ctx.request
let r = await api.post(`${base}/api/v1/auth/register`, { data: { email: 'ada@example.com', name: 'Ada', password: 'correct horse battery staple' } })
assert(r.status() === 201, 'register ' + r.status())
r = await api.post(`${base}/api/v1/tasks`, { data: { title: 'Run', recurrence: 'every day', due: { date: TODAY } } })
assert(r.ok(), 'task ' + r.status())
const run = (await r.json()).id

try {
  step('a new account sees nothing about habits')
  await page.goto(`${base}/today`)
  await page.getByText('Run').first().waitFor()
  assert(await page.locator('[data-today-habits]').count() === 0, 'no strip before Habits is on')
  await page.goto(`${base}/habits`)
  await page.locator('[data-habits-off]').waitFor()

  step('Turned on by using it: Track as a habit on Run')
  await page.goto(`${base}/task/${run}`)
  await page.getByRole('button', { name: /every day/ }).first().click()
  const editor = page.getByRole('dialog', { name: 'When' })
  await editor.waitFor()
  await editor.getByRole('switch', { name: /Track as a habit/ }).click()
  await editor.locator('[data-habits-turned-on]').waitFor()
  await page.keyboard.press('Escape')

  step('Today shows Run in the strip, not as a row')
  await page.goto(`${base}/today`)
  await page.locator(`[data-strip-chip="${run}"]`).waitFor()
  assert(await page.locator(`[data-task-id="${run}"]`).count() === 0, 'Run is not a Today row')

  step('the Habits screen checks Run in with Space')
  await page.goto(`${base}/habits`)
  const row = page.locator(`[data-habit-row="${run}"]`)
  await row.waitFor()
  await row.focus()
  await page.keyboard.press('Space')
  await page.locator(`[data-check-in="${run}"][data-kept]`).waitFor()
  assert(errors.length === 0, errors.join('\n'))
  console.log('e2e-habits: ok')
} finally {
  await browser.close()
}
