// Resolve Playwright locally (npm i / npx -p) or from a global install (npm i -g playwright).
const { chromium } = await import('playwright').catch(async () => {
  const { createRequire } = await import('node:module')
  const { execSync } = await import('node:child_process')
  return createRequire(execSync('npm root -g').toString().trim() + '/')('playwright')
})

const base = process.env.OPENTODO_URL ?? 'http://127.0.0.1:8080'
// Optional: a directory to save screenshots of the run into (the seeded marketing
// screenshots come from scripts/screenshots.mjs, not from here).
const shots = process.argv[2]
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

const step = (s) => console.log('·', s)
const snap = async (p, name) => { if (shots) await p.screenshot({ path: `${shots}/${name}.png` }) }
// A task row's open button: its accessible name starts with the title (date and project chips follow).
// Scoped to the role so the Parent task picker's <option> and subtask toggles never match.
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const row = (p, title) => p.getByRole('button', { name: new RegExp('^' + esc(title)) })
const detail = (p) => p.locator('aside[data-detail-for]')

await page.goto(base)
step('setup screen')
await page.getByText('Create the owner account').waitFor()
await snap(page, 'setup')
await page.getByLabel('Name').fill('Ada')
await page.getByLabel('Email').fill('ada@example.com')
await page.getByLabel(/Password/).fill('correct horse battery staple')
await page.getByRole('button', { name: 'Create owner account' }).click()

step('inbox after setup')
const quick = page.getByLabel('Add a task')
await quick.waitFor()
for (const t of ['Write the OpenTodo README', 'Email the landlord about the heating', 'Book dentist appointment']) {
  await quick.fill(t)
  await quick.press('Enter')
}
await row(page, 'Book dentist appointment').waitFor()

step('natural-language quick add')
await quick.fill('Water the plants tomorrow p2')
await page.locator('[data-chip="priority"]').filter({ hasText: 'P2' }).waitFor() // the preview chip
await page.locator('[data-chip="due"]').waitFor()
await quick.press('Enter')
await row(page, 'Water the plants').waitFor()

step('project via sidebar')
await page.getByTitle('New project').click()
await page.getByPlaceholder('Project name').fill('Home renovation')
await page.getByPlaceholder('Project name').press('Enter')
await page.getByRole('heading', { name: 'Home renovation' }).waitFor()
for (const t of ['Get three quotes for the kitchen', 'Pick paint colours', 'Order new taps']) {
  await quick.fill(t)
  await quick.press('Enter')
}
await row(page, 'Order new taps').waitFor()

step('task detail: priority + due date')
await row(page, 'Get three quotes for the kitchen').click()
await detail(page).getByRole('button', { name: 'P1' }).click()
const today = new Date(); const iso = today.toISOString().slice(0, 10)
// The due date is a text field in the user's format; ISO is always accepted and Enter commits it.
await detail(page).getByLabel('Due date').fill(iso)
await detail(page).getByLabel('Due date').press('Enter')
// Notes are a rich-text editor (contenteditable, role textbox) that saves after a short pause.
const notes = detail(page).getByRole('textbox', { name: 'Notes' })
await notes.click(); await notes.fill('Ask about lead times and payment schedule.')
await page.waitForTimeout(1500)
await row(page, 'Pick paint colours').click()
await page.waitForFunction((t) => document.querySelector('aside[data-detail-for] [aria-label="Title"]')?.value === t, 'Pick paint colours')
await detail(page).getByRole('button', { name: 'P2' }).click()
const tomorrow = new Date(today.getTime() + 86400000).toISOString().slice(0, 10)
await detail(page).getByLabel('Due date').fill(tomorrow)
await detail(page).getByLabel('Due date').press('Enter')
await page.keyboard.press('Escape')

step('keyboard: j, c completes')
await page.keyboard.press('Escape')
await page.keyboard.press('j'); await page.keyboard.press('j'); await page.keyboard.press('j')
await page.keyboard.press('c')
await page.getByRole('button', { name: 'Reopen task' }).first().waitFor({ state: 'detached', timeout: 2000 }).catch(() => {})

step('today view')
await page.keyboard.press('g'); await page.keyboard.press('t')
await page.getByRole('heading', { name: /Today/ }).waitFor()
await row(page, 'Get three quotes for the kitchen').waitFor()
await snap(page, 'today')

step('upcoming view')
await page.keyboard.press('g'); await page.keyboard.press('u')
await row(page, 'Pick paint colours').waitFor()

step('wait for sync, verify server state via REST')
await page.waitForTimeout(400)
await page.waitForFunction(() => document.body.innerText.includes('Synced'), null, { timeout: 10000 })
const tasks = await page.evaluate(async () => (await (await fetch('/api/v1/tasks')).json()).tasks)
const projects = await page.evaluate(async () => (await (await fetch('/api/v1/projects')).json()).projects)
console.log('  server tasks:', tasks.length, 'projects:', projects.length)
if (tasks.length !== 7 || projects.length !== 1) throw new Error('unexpected server state')
const byTitle = (t) => tasks.find((x) => x.title === t) ?? {}
const tomorrowLocal = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toLocaleDateString('sv') })
const checks = [
  ['quotes priority', byTitle('Get three quotes for the kitchen').priority === 1],
  ['quotes due', byTitle('Get three quotes for the kitchen').due?.date === iso],
  ['quotes notes', !!byTitle('Get three quotes for the kitchen').notes_doc || (byTitle('Get three quotes for the kitchen').description ?? '').includes('lead times')],
  ['paint priority', byTitle('Pick paint colours').priority === 2],
  ['paint due', byTitle('Pick paint colours').due?.date === tomorrow],
  ['nlp title', byTitle('Water the plants').priority === 2],
  ['nlp due', byTitle('Water the plants').due?.date === tomorrowLocal],
  ['keyboard completed one task', tasks.filter((x) => x.completed_at).length === 1],
]
const failed = checks.filter(([, ok]) => !ok).map(([n]) => n)
if (failed.length) throw new Error('server state mismatch: ' + failed.join(', '))

step('second device: fresh context sees the same data')
const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const p2 = await ctx2.newPage()
await p2.goto(base)
await p2.getByLabel('Email').fill('ada@example.com')
await p2.getByLabel(/Password/).fill('correct horse battery staple')
await p2.getByRole('button', { name: 'Sign in' }).click()
await row(p2, 'Write the OpenTodo README').waitFor({ timeout: 10000 })
await p2.locator('aside').getByRole('button', { name: /^Home renovation/ }).click()
await row(p2, 'Pick paint colours').waitFor()

step('offline edit on device 2, then reconnect')
await ctx2.setOffline(true)
await p2.getByLabel('Add a task').fill('Added while offline')
await p2.getByLabel('Add a task').press('Enter')
await row(p2, 'Added while offline').waitFor()
await p2.waitForFunction(() => /Offline/.test(document.body.innerText), null, { timeout: 5000 })
await snap(p2, 'offline')
await ctx2.setOffline(false)
await p2.waitForTimeout(400)
await p2.waitForFunction(() => document.body.innerText.includes('Synced'), null, { timeout: 15000 })

step('device 1 receives it on next sync')
await page.locator('aside').getByRole('button', { name: /^Home renovation/ }).click()
await row(page, 'Added while offline').waitFor({ timeout: 40000 })
await snap(page, 'project')

step('PWA: manifest + service worker registered')
const sw = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)
const manifest = await page.evaluate(async () => (await fetch('/manifest.webmanifest')).status)
console.log('  service workers:', sw, 'manifest status:', manifest)

step('settings + export')
await page.keyboard.press('Escape')
await page.keyboard.press('g'); await page.keyboard.press('s')
await page.getByRole('heading', { name: 'Settings' }).waitFor()
await page.getByPlaceholder(/Token name/).fill('e2e')
await page.getByRole('button', { name: 'Create', exact: true }).click()
await page.getByText('Copy this token now').waitFor()
await snap(page, 'settings')

step('mobile layout')
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' })
const mp = await m.newPage()
await mp.goto(base)
await mp.getByLabel('Email').fill('ada@example.com')
await mp.getByLabel(/Password/).fill('correct horse battery staple')
await mp.getByRole('button', { name: 'Sign in' }).click()
await row(mp, 'Write the OpenTodo README').waitFor({ timeout: 10000 })
await snap(mp, 'mobile-dark')

await browser.close()
if (errors.length) { console.log('BROWSER ERRORS:\n' + errors.join('\n')); process.exit(1) }
console.log('E2E OK')
