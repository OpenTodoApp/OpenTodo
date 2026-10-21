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
await ctx.addInitScript(() => { try { localStorage.setItem('opentodo.rowClick', 'open') } catch {} })  // click opens the panel, as these flows expect (inline-task-editing)
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
// Failed requests are reported with their URL by the response listener below. A project's
// public links are asked for as soon as its header shows, possibly before the new project
// has synced; the header then shows none (ProjectHeader), so that 404 is expected.
page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()) })
page.on('response', (r) => { if (r.status() >= 400 && !(r.status() === 404 && /\/public-links$/.test(new URL(r.url()).pathname))) errors.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`) })

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

step('welcome note after setup')
// The owner of a new server is thanked once (welcome-note); closing it is remembered.
const welcome = page.locator('[data-testid="welcome"]')
await welcome.waitFor()
await welcome.getByRole('link', { name: /Buy me a coffee/ }).waitFor()
await page.locator('[data-welcome-close]').click()
await welcome.waitFor({ state: 'detached' })
await page.reload()

step('start guide after the welcome note')
// The first-run guide opens as a dialog once the welcome note is closed (lean-chrome);
// closing it in any way finishes it, so it does not come back after a reload.
const guide = page.locator('[data-testid="start-guide"]')
await guide.waitFor()
await guide.locator('[data-first-run-skip-all]').click()
await guide.waitFor({ state: 'detached' })
await page.reload()
await page.getByRole('combobox', { name: 'Add a task' }).waitFor()
await page.waitForTimeout(500)
if (await welcome.count()) throw new Error('the welcome note came back after a reload')
if (await guide.count()) throw new Error('the start guide came back after a reload')

step('inbox after setup')
const quick = page.getByRole('combobox', { name: 'Add a task' })
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
// A dated task is not an Inbox task (inbox-means-unplaced): quick add says where it went.
await page.locator('[data-bulk-toast]', { hasText: 'Added to Tomorrow' }).locator('[data-toast-action]').waitFor()
if (await row(page, 'Water the plants').count()) throw new Error('a dated task stayed in the Inbox')

step('project via sidebar')
// The sidebar's + is a menu (ux-overhaul); its first item adds a project.
await page.getByRole('button', { name: 'Add or fold projects' }).first().click()
await page.getByRole('menuitem', { name: 'New project' }).click()
await page.getByPlaceholder('Project name').fill('Home renovation')
await page.getByPlaceholder('Project name').press('Enter')
await page.getByRole('heading', { name: 'Home renovation' }).waitFor()
// Priorities and dates come from quick add (the task panel's chips are covered by its own tests).
for (const t of ['Get three quotes for the kitchen today p1', 'Pick paint colours tomorrow p2', 'Order new taps']) {
  await quick.fill(t)
  await quick.press('Enter')
}
await row(page, 'Order new taps').waitFor()

step('task detail: notes')
await row(page, 'Get three quotes for the kitchen').click()
// Quick add reads today and tomorrow in the browser's zone.
const iso = await page.evaluate(() => new Date().toLocaleDateString('sv'))
const tomorrow = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toLocaleDateString('sv') })
// Notes are a rich-text editor (contenteditable, role textbox) that saves after a short pause.
const notes = detail(page).getByRole('textbox', { name: 'Notes' })
await notes.click(); await notes.fill('Ask about lead times and payment schedule.')
await page.waitForTimeout(1500)
await page.keyboard.press('Escape')

step('keyboard: j, c completes')
await page.keyboard.press('Escape')
await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
await page.keyboard.press('j'); await page.keyboard.press('j'); await page.keyboard.press('j')
await page.keyboard.press('c')
await page.getByRole('button', { name: /^Reopen / }).first().waitFor({ state: 'detached', timeout: 2000 }).catch(() => {})

step('today view')
await page.keyboard.press('g'); await page.keyboard.press('t')
await page.getByRole('heading', { name: /Today/ }).waitFor()
await row(page, 'Get three quotes for the kitchen').waitFor()
await snap(page, 'today')

step('upcoming view')
await page.keyboard.press('g'); await page.keyboard.press('u')
await row(page, 'Pick paint colours').waitFor()
await row(page, 'Water the plants').waitFor() // dated without a project: in Upcoming, not the Inbox

step('wait for sync, verify server state via REST')
// The sync indicator is an icon since ux-overhaul: poll the server until the edits arrived.
for (let i = 0; i < 50; i++) {
  const ok = await page.evaluate(async () => {
    const t = (await (await fetch('/api/v1/tasks')).json()).tasks ?? []
    const q = t.find((x) => x.title === 'Get three quotes for the kitchen')
    return !!q && (!!q.notes_doc || (q.description ?? '').includes('lead times')) && t.some((x) => x.completed_at)
  })
  if (ok) break
  await page.waitForTimeout(200)
}
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
await ctx2.addInitScript(() => { try { localStorage.setItem('opentodo.rowClick', 'open') } catch {} })  // click opens the panel, as these flows expect (inline-task-editing)
const p2 = await ctx2.newPage()
await p2.goto(base)
await p2.getByLabel('Email').fill('ada@example.com')
await p2.getByLabel(/Password/).fill('correct horse battery staple')
await p2.getByRole('button', { name: 'Sign in', exact: true }).click()
await row(p2, 'Write the OpenTodo README').waitFor({ timeout: 10000 })
await p2.locator('aside').getByRole('button', { name: /^Home renovation/ }).click()
await row(p2, 'Pick paint colours').waitFor()

step('offline edit on device 2, then reconnect')
await ctx2.setOffline(true)
await p2.getByRole('combobox', { name: 'Add a task' }).fill('Added while offline')
await p2.getByRole('combobox', { name: 'Add a task' }).press('Enter')
await row(p2, 'Added while offline').waitFor()
await p2.waitForFunction(() => /Offline/.test(document.body.innerText), null, { timeout: 5000 })
await snap(p2, 'offline')
await ctx2.setOffline(false)
for (let i = 0; i < 75; i++) {
  if (await p2.evaluate(async () => ((await (await fetch('/api/v1/tasks')).json()).tasks ?? []).some((x) => x.title === 'Added while offline'))) break
  await p2.waitForTimeout(200)
}

step('device 1 receives it on next sync')
await page.locator('aside').getByRole('button', { name: /^Home renovation/ }).click()
await row(page, 'Added while offline').waitFor({ timeout: 40000 })
await snap(page, 'project')

step('close the day on device 1, reopen it offline on device 2 (ux-feedback-2)')
const serverDue = async (p, title) => p.evaluate(async (t) => ((await (await fetch('/api/v1/tasks')).json()).tasks ?? []).find((x) => x.title === t)?.due?.date ?? null, title)
await page.goto(`${base}/review/close`)
await page.locator('[data-review-step="summary"]').waitFor()
await page.keyboard.press(']')
await page.locator('[data-close-apply]').click()
await page.locator('[data-close-nothing]').waitFor()
await page.keyboard.press(']')
await page.locator('[data-close-note-input]').fill('Reopen check')
await page.locator('[data-close-note-input]').press('Enter')
await page.waitForURL(/\/today$/)
for (let i = 0; i < 75 && (await serverDue(page, 'Get three quotes for the kitchen')) !== tomorrow; i++) await page.waitForTimeout(200)
if ((await serverDue(page, 'Get three quotes for the kitchen')) !== tomorrow) throw new Error('carry-over did not reach the server')
await p2.goto(`${base}/today`)
await p2.locator('[data-reopen-day]').waitFor({ timeout: 40000 })
await ctx2.setOffline(true)
await p2.locator('[data-reopen-day]').click()
await p2.locator('[data-bulk-toast]', { hasText: 'Day reopened' }).waitFor()
await ctx2.setOffline(false)
for (let i = 0; i < 75 && (await serverDue(p2, 'Get three quotes for the kitchen')) !== iso; i++) await p2.waitForTimeout(200)
if ((await serverDue(p2, 'Get three quotes for the kitchen')) !== iso) throw new Error('reopen did not converge on the server')
await page.locator('[data-close-day="open"]').waitFor({ timeout: 40000 })

step('template library offline (template-library)')
// The library is a lazy chunk the service worker precaches: once the page is controlled,
// the dialog lists the templates and starts one with the network off; it syncs after.
await p2.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 })
await ctx2.setOffline(true)
await p2.getByRole('button', { name: 'Add or fold projects' }).first().click()
await p2.getByRole('menuitem', { name: 'From a template…' }).click()
await p2.locator('[data-template-card="trip-planning"]').click()
await p2.locator('[data-template-create]').click()
await p2.getByRole('heading', { name: 'Trip', exact: true }).waitFor()
await ctx2.setOffline(false)
for (let i = 0; i < 75; i++) {
  if (await p2.evaluate(async () => ((await (await fetch('/api/v1/projects')).json()).projects ?? []).some((x) => x.name === 'Trip'))) break
  await p2.waitForTimeout(200)
}
const tripSynced = await p2.evaluate(async () => {
  const projects = (await (await fetch('/api/v1/projects')).json()).projects ?? []
  const trip = projects.find((x) => x.name === 'Trip')
  const tasks = (await (await fetch('/api/v1/tasks')).json()).tasks ?? []
  return trip ? tasks.filter((x) => x.project_id === trip.id).length : -1
})
console.log('  Trip tasks on the server after reconnecting:', tripSynced)
if (tripSynced !== 10) throw new Error(`template started offline did not sync: ${tripSynced}`)

step('PWA: manifest + service worker registered')
const sw = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)
const manifest = await page.evaluate(async () => (await fetch('/manifest.webmanifest')).status)
console.log('  service workers:', sw, 'manifest status:', manifest)

step('process the Inbox (inbox-triage)')
await page.keyboard.press('Escape')
await page.goto(`${base}/inbox`)
await row(page, 'Book dentist appointment').waitFor()
await page.keyboard.press('g'); await page.keyboard.press('p')
await page.locator('[data-triage-card]').waitFor()
const before = await page.locator('[data-triage-progress]').innerText()
await page.keyboard.press('t')
await page.locator('[data-triage-progress]').filter({ hasNotText: before }).waitFor()
await page.keyboard.press('j')
const after = await page.locator('[data-triage-progress]').innerText()
console.log('  progress:', before, '→', after)
await page.keyboard.press('Escape')
await page.locator('[data-triage-start]').waitFor()

step('Open Loops (open-loops-method): first, the Loop home, the walk, a focus, back to Lists only')
const primary = () => page.locator('nav[data-sidebar-primary] [data-sidebar-item]').evaluateAll((els) => els.map((e) => e.getAttribute('data-destination')))
await page.goto(`${base}/settings/account`)
await page.locator('[data-method-mode="first"]').click()
await page.locator('[data-offer="start"]').getByRole('button', { name: 'Keep my start view' }).click()
await page.locator('[data-offer="contexts"]').getByRole('button', { name: 'Create them' }).click()
await page.locator('[data-offer="contexts"]').waitFor({ state: 'detached' })
for (let i = 0; i < 50 && (await primary())[0] !== 'loop'; i++) await page.waitForTimeout(100)
const firstNav = await primary()
if (JSON.stringify(firstNav) !== JSON.stringify(['loop', 'inbox', 'today', 'next', 'waiting', 'review'])) throw new Error(`Open Loops first sidebar: ${firstNav}`)
await page.goto(`${base}/loop`)
await page.locator('[data-loop-tile="clarify"]').waitFor()
await snap(page, 'loop')
await page.locator('[data-loop-tile="clarify"]').getByRole('button', { name: 'Process the Inbox' }).click()
await page.locator('[data-triage-card]').waitFor()
await page.keyboard.press('t')
await page.goto(`${base}/review/projects`)
await page.locator('[data-walk-card]').waitFor()
for (let i = 0; i < 2 && await page.locator('[data-walk-card]').count(); i++) {
  const name = await page.locator('[data-walk-card] h3').innerText()
  await page.keyboard.press('r')
  await page.locator('[data-walk-card] h3').filter({ hasNotText: name }).or(page.locator('[data-walk-summary]')).first().waitFor()
}
await page.goto(`${base}/review/daily`)
await page.locator('[data-daily-inbox]').waitFor()
if (await page.locator('[data-group="today"] [data-task-id]').count()) {
  await page.keyboard.press('j'); await page.keyboard.press('f')
  await page.locator('[data-group="focus"] [data-task-id]').first().waitFor()
}
await page.goto(`${base}/settings/account`)
await page.locator('[data-method-mode="lists"]').click()
for (let i = 0; i < 50 && (await primary())[0] !== 'inbox'; i++) await page.waitForTimeout(100)
const listsNav = await primary()
if (JSON.stringify(listsNav.slice(0, 3)) !== JSON.stringify(['inbox', 'today', 'upcoming']) || listsNav.length !== 4) throw new Error(`Lists only sidebar: ${listsNav}`)

step('settings + export')
await page.keyboard.press('Escape')
await page.keyboard.press('g'); await page.keyboard.press('s')
// Settings opens on its first section (settings-navigation).
await page.getByRole('heading', { name: 'Account', exact: true }).waitFor()
// API tokens live in Settings → Integrations (settings-redesign); "New token" opens the form.
await page.goto(`${base}/settings/integrations`)
await page.getByRole('button', { name: 'New token' }).click()
await page.getByLabel('Token name').fill('e2e')
await page.getByRole('button', { name: 'Create token', exact: true }).click()
await page.getByText('Copy this token now').waitFor()
await snap(page, 'settings')

step('mobile layout')
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' })
const mp = await m.newPage()
await mp.goto(base)
await mp.getByLabel('Email').fill('ada@example.com')
await mp.getByLabel(/Password/).fill('correct horse battery staple')
await mp.getByRole('button', { name: 'Sign in', exact: true }).click()
// Triage's t dated the README task, so it is in Today now, not the Inbox (inbox-means-unplaced): any row will do.
await mp.locator('[data-task-id]').first().waitFor({ timeout: 10000 })
await snap(mp, 'mobile-dark')

await browser.close()
if (errors.length) { console.log('BROWSER ERRORS:\n' + errors.join('\n')); process.exit(1) }
console.log('E2E OK')
