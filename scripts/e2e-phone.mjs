// End-to-end check of the phone UI (OpenSpec changes `phone-ui-trial` and `phone-lists`)
// against a running server with a FRESH data directory: a phone with touch and the
// phone screens it has by default (`phone-ui-default`). The gestures a unit test cannot make: a hold
// opens the row's menu, a hold and a move reorders, a swipe completes and Undo brings
// the task back, Select tasks ticks rows and a bulk action writes them, a tap opens
// the task page and Back returns to the same place; a screen that is not a list has
// the phone header and phone rows (`phone-all-screens`). See scripts/README.md.
const { chromium } = await import('playwright').catch(async () => {
  const { createRequire } = await import('node:module')
  const { execSync } = await import('node:child_process')
  return createRequire(execSync('npm root -g').toString().trim() + '/')('playwright')
})

const base = process.env.OPENTODO_URL ?? 'http://127.0.0.1:8080'
const shots = process.argv[2] ?? null
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []
const step = (s) => console.log('·', s)
const assert = (c, msg) => { if (!c) throw new Error('ASSERT: ' + msg) }
const HOLD_MS = 600 // past the row's 350 ms hold

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
const page = await ctx.newPage()
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) errors.push(`console: ${m.text()}`) })
const cdp = await ctx.newCDPSession(page)
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] })
const wait = (ms) => page.waitForTimeout(ms)
const rows = () => page.locator('[data-phone-row]')
const titles = () => page.locator('[data-phone-row] [data-row-title]').allTextContents()
const box = async (title) => (await page.locator('[data-phone-row]', { hasText: title }).first().boundingBox())
/** Closes what the first visit puts over the page (the welcome, the start guide, a toast). */
async function clear() {
  for (let i = 0; i < 4; i++) {
    const c = page.getByRole('button', { name: /Start using OpenTodo|Skip all/ }).first()
    if (await c.isVisible().catch(() => false)) { await c.tap(); await wait(400); continue }
    const x = page.locator('[data-overlay-close], [data-toast-dismiss]').first()
    if (await x.isVisible().catch(() => false)) { await x.tap(); await wait(300); continue }
    break
  }
}

try {
  step('register, a project with four tasks and one for today')
  const api = ctx.request
  let r = await api.post(`${base}/api/v1/auth/register`, { data: { email: 'ada@example.com', name: 'Ada', password: 'correct horse battery staple' } })
  assert(r.ok(), `register ${r.status()}`)
  const post = async (path, data) => { const res = await api.post(`${base}${path}`, { data }); assert(res.ok(), `${path} ${res.status()}`); const j = await res.json(); return j.task?.id ?? j.project?.id ?? j.id }
  const pid = await post('/api/v1/projects', { name: 'Launch' })
  const d = new Date(); const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  for (const title of ['Alpha', 'Bravo', 'Charlie', 'Delta']) await post('/api/v1/tasks', { title, project_id: pid })
  await post('/api/v1/tasks', { title: 'Echo for today', due: { date: today } })

  step('the project opens as the phone list')
  await page.goto(`${base}/project/${pid}`)
  await rows().first().waitFor({ timeout: 20000 })
  await clear()
  assert(await page.locator('[data-phone-list="project"]').count() === 1, 'the project is the phone list')
  assert(await page.locator('[data-drag-id="task-row"]').count() === 0, 'no desktop row')
  const start = await titles()
  assert(start.join() === 'Alpha,Bravo,Charlie,Delta', `the project's tasks in order, got ${start}`)

  step('a hold and a release opens the row\'s menu')
  let b = await box('Alpha')
  await touch('touchStart', b.x + 150, b.y + 25); await wait(HOLD_MS); await touch('touchEnd')
  await page.getByRole('menuitem', { name: /^Edit(?![a-z ])/ }).waitFor({ timeout: 5000 })
  assert(await page.getByRole('menuitem', { name: /Reorder/ }).count() === 1, 'the menu offers Reorder')
  await page.keyboard.press('Escape')
  await page.getByRole('menuitem', { name: /^Edit(?![a-z ])/ }).waitFor({ state: 'detached', timeout: 5000 })
  await clear()

  step('a hold and a move puts the last task first')
  const from = await box('Delta'), to = await box('Alpha')
  await touch('touchStart', from.x + 150, from.y + 25); await wait(HOLD_MS)
  for (let k = 1; k <= 12; k++) { await touch('touchMove', from.x + 150, from.y + 25 + (to.y + 10 - from.y - 25) * k / 12); await wait(40) }
  await page.locator('[data-drop-indicator]').waitFor({ timeout: 3000 })
  if (shots) await page.screenshot({ path: `${shots}/phone-drag.png` })
  await touch('touchEnd')
  await page.waitForFunction(() => [...document.querySelectorAll('[data-phone-row] [data-row-title]')].map((e) => e.textContent).join() === 'Delta,Alpha,Bravo,Charlie', null, { timeout: 5000 })
  await page.reload()
  await rows().first().waitFor()
  assert((await titles()).join() === 'Delta,Alpha,Bravo,Charlie', 'the order is kept after a reload')

  step('a swipe to the right completes, and Undo brings the task back')
  b = await box('Bravo')
  await touch('touchStart', b.x + 60, b.y + 25)
  for (let k = 1; k <= 10; k++) { await touch('touchMove', b.x + 60 + 26 * k, b.y + 25); await wait(25) }
  await touch('touchEnd')
  await page.locator('[data-phone-row]', { hasText: 'Bravo' }).waitFor({ state: 'detached', timeout: 5000 })
  await page.getByRole('button', { name: 'Undo' }).tap()
  await page.locator('[data-phone-row]', { hasText: 'Bravo' }).waitFor({ timeout: 5000 })

  step('Select tasks ticks rows, and a bulk action completes them')
  await clear()
  await page.locator('[data-phone-header] button[aria-haspopup]').last().tap()
  await page.getByRole('menuitem', { name: 'Select tasks' }).tap()
  await page.locator('[data-phone-tick]').first().waitFor()
  await page.locator('[data-phone-row]', { hasText: 'Charlie' }).locator('[data-phone-open]').tap()
  await page.locator('[data-phone-row]', { hasText: 'Delta' }).locator('[data-phone-tick]').tap()
  await page.locator('[data-selection-bar]', { hasText: '2 selected' }).waitFor()
  assert(await page.locator('[data-phone-screen="task"]').count() === 0, 'a tap in selection ticks; it does not open the task')
  await page.locator('[data-selection-bar]').getByRole('button', { name: /Actions/ }).tap()
  await page.getByRole('menuitem', { name: /^Complete/ }).tap()
  await page.waitForFunction(() => [...document.querySelectorAll('[data-phone-row] [data-row-title]')].map((e) => e.textContent).join() === 'Alpha,Bravo', null, { timeout: 5000 })

  step('Today is the phone list; a tap opens the task page and Back returns')
  await page.goto(`${base}/today`)
  await page.locator('[data-phone-list="today"] [data-phone-row]', { hasText: 'Echo for today' }).waitFor()
  await clear()
  await page.locator('[data-phone-row]', { hasText: 'Echo for today' }).locator('[data-phone-open]').tap()
  await page.locator('[data-phone-screen="task"]').waitFor({ timeout: 10000 })
  assert(await page.locator('[data-tab-bar]').count() === 0, 'the task page hides the tab bar')
  await page.locator('[data-page-back]').tap()
  await page.locator('[data-phone-list="today"]').waitFor({ timeout: 10000 })

  step('the Inbox, Upcoming and Completed are phone lists too')
  for (const view of ['inbox', 'upcoming', 'completed']) {
    await page.goto(`${base}/${view}`)
    await page.locator(`[data-phone-list="${view}"]`).waitFor({ timeout: 10000 })
  }
  await page.locator('[data-phone-row]', { hasText: 'Charlie' }).first().waitFor({ timeout: 10000 })

  step('a screen that is not a list has the phone header, and Next lists phone rows')
  await page.goto(`${base}/labels`)
  await page.locator('[data-phone-header]').waitFor({ timeout: 10000 })
  assert(await page.locator('[data-phone-bar]').count() === 0, 'Labels has no shell bar')
  assert((await page.locator('[data-phone-head] [data-page-title]').textContent()) === 'Labels', 'the title is large under the bar')
  await page.goto(`${base}/next`)
  const next = page.locator('[data-phone-row]').first()
  await next.waitFor({ timeout: 10000 })
  assert(await page.locator('[data-drag-id="task-row"]').count() === 0, 'Next has no desktop row')
  const nextTitle = await next.locator('[data-row-title]').textContent()
  await next.locator('[data-phone-open]').tap()
  await page.locator('[data-phone-screen="task"]').waitFor({ timeout: 10000 })
  await page.locator('[data-page-back]').tap()
  await page.locator('[data-phone-row]', { hasText: nextTitle }).first().waitFor({ timeout: 10000 })
  await clear()
  await page.locator('[data-phone-row]', { hasText: nextTitle }).first().locator('[data-phone-check]').tap()
  // Next shows the next action: the completed one gives way to the one after it.
  await page.locator('[data-phone-row]', { hasText: nextTitle }).first().waitFor({ state: 'detached', timeout: 5000 })

  assert(errors.length === 0, errors.join('\n'))
  console.log('e2e-phone: ok')
} catch (e) {
  if (shots) await page.screenshot({ path: `${shots}/phone-failure.png` }).catch(() => {})
  throw e
} finally {
  await browser.close()
}
