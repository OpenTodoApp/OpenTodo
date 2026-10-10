import { chromium } from 'playwright'

const base = process.env.OPENTODO_URL ?? 'http://127.0.0.1:8080'
const shots = process.argv[2] ?? 'docs/screenshots'
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

const step = (s) => console.log('·', s)

await page.goto(base)
step('setup screen')
await page.getByText('Create the owner account').waitFor()
await page.screenshot({ path: `${shots}/setup.png` })
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
await page.getByText('Book dentist appointment').waitFor()

step('project via sidebar')
await page.getByTitle('New project').click()
await page.getByPlaceholder('Project name').fill('Home renovation')
await page.getByPlaceholder('Project name').press('Enter')
await page.getByRole('heading', { name: 'Home renovation' }).waitFor()
for (const t of ['Get three quotes for the kitchen', 'Pick paint colours', 'Order new taps']) {
  await quick.fill(t)
  await quick.press('Enter')
}
await page.getByText('Order new taps').waitFor()

step('task detail: priority + due date')
await page.getByText('Get three quotes for the kitchen').click()
await page.getByRole('button', { name: 'P1' }).click()
const today = new Date(); const iso = today.toISOString().slice(0, 10)
await page.getByLabel('Due date').fill(iso)
await page.getByLabel('Description').fill('Ask about lead times and payment schedule.')
await page.getByLabel('Description').blur()
await page.getByText('Pick paint colours').click()
await page.getByRole('button', { name: 'P2' }).click()
const tomorrow = new Date(today.getTime() + 86400000).toISOString().slice(0, 10)
await page.getByLabel('Due date').fill(tomorrow)
await page.keyboard.press('Escape')

step('keyboard: j, c completes')
await page.keyboard.press('Escape')
await page.keyboard.press('j'); await page.keyboard.press('j'); await page.keyboard.press('j')
await page.keyboard.press('c')
await page.getByRole('button', { name: 'Reopen task' }).first().waitFor({ state: 'detached', timeout: 2000 }).catch(() => {})

step('today view')
await page.keyboard.press('g'); await page.keyboard.press('t')
await page.getByRole('heading', { name: /Today/ }).waitFor()
await page.getByText('Get three quotes for the kitchen').waitFor()
await page.screenshot({ path: `${shots}/today.png` })

step('upcoming view')
await page.keyboard.press('g'); await page.keyboard.press('u')
await page.getByText('Pick paint colours').waitFor()

step('wait for sync, verify server state via REST')
await page.waitForTimeout(400)
await page.waitForFunction(() => document.body.innerText.includes('Synced'), null, { timeout: 10000 })
const tasks = await page.evaluate(async () => (await (await fetch('/api/v1/tasks')).json()).tasks)
const projects = await page.evaluate(async () => (await (await fetch('/api/v1/projects')).json()).projects)
console.log('  server tasks:', tasks.length, 'projects:', projects.length)
if (tasks.length !== 6 || projects.length !== 1) throw new Error('unexpected server state')

step('second device: fresh context sees the same data')
const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const p2 = await ctx2.newPage()
await p2.goto(base)
await p2.getByLabel('Email').fill('ada@example.com')
await p2.getByLabel(/Password/).fill('correct horse battery staple')
await p2.getByRole('button', { name: 'Sign in' }).click()
await p2.getByText('Write the OpenTodo README').waitFor({ timeout: 10000 })
await p2.locator('aside').getByRole('button', { name: /^Home renovation/ }).click()
await p2.getByText('Pick paint colours').waitFor()

step('offline edit on device 2, then reconnect')
await ctx2.setOffline(true)
await p2.getByLabel('Add a task').fill('Added while offline')
await p2.getByLabel('Add a task').press('Enter')
await p2.getByText('Added while offline').waitFor()
await p2.waitForFunction(() => /Offline/.test(document.body.innerText), null, { timeout: 5000 })
await p2.screenshot({ path: `${shots}/offline.png` })
await ctx2.setOffline(false)
await p2.waitForTimeout(400)
await p2.waitForFunction(() => document.body.innerText.includes('Synced'), null, { timeout: 15000 })

step('device 1 receives it on next sync')
await page.locator('aside').getByRole('button', { name: /^Home renovation/ }).click()
await page.getByText('Added while offline').waitFor({ timeout: 40000 })
await page.screenshot({ path: `${shots}/project.png` })

step('PWA: manifest + service worker registered')
const sw = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)
const manifest = await page.evaluate(async () => (await fetch('/manifest.webmanifest')).status)
console.log('  service workers:', sw, 'manifest status:', manifest)

step('settings + export')
await page.keyboard.press('Escape')
await page.keyboard.press('g'); await page.keyboard.press('s')
await page.getByRole('heading', { name: 'Settings' }).waitFor()
await page.getByPlaceholder(/Token name/).fill('e2e')
await page.getByRole('button', { name: 'Create' }).click()
await page.getByText('Copy this token now').waitFor()
await page.screenshot({ path: `${shots}/settings.png` })

step('mobile layout')
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' })
const mp = await m.newPage()
await mp.goto(base)
await mp.getByLabel('Email').fill('ada@example.com')
await mp.getByLabel(/Password/).fill('correct horse battery staple')
await mp.getByRole('button', { name: 'Sign in' }).click()
await mp.getByText('Write the OpenTodo README').waitFor({ timeout: 10000 })
await mp.screenshot({ path: `${shots}/mobile-dark.png` })

await browser.close()
if (errors.length) { console.log('BROWSER ERRORS:\n' + errors.join('\n')); process.exit(1) }
console.log('E2E OK')
