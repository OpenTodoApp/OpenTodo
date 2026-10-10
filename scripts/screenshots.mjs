import { chromium } from 'playwright'
const base = process.env.OPENTODO_URL ?? 'http://127.0.0.1:8080', out = process.argv[2] ?? 'docs/screenshots'
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const mk = (o) => browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, colorScheme: 'light', ...o })
const iso = (d) => { const x = new Date(); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10) }
let ctx = await mk({}); let page = await ctx.newPage()
await page.goto(base)
await page.getByLabel('Name').fill('Ada'); await page.getByLabel('Email').fill('ada@example.com'); await page.getByLabel(/Password/).fill('correct horse battery staple')
await page.getByRole('button', { name: 'Create owner account' }).click()
await page.getByLabel('Add a task').waitFor()
// seed via REST with cookie session
const seed = async () => await page.evaluate(async ({ d }) => {
  const post = (p, b) => fetch(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json())
  const home = await post('/api/v1/projects', { name: 'Home renovation', color: '#f59e0b', position: 1 })
  const work = await post('/api/v1/projects', { name: 'Work', color: '#38bdf8', position: 2 })
  const side = await post('/api/v1/projects', { name: 'Side project', color: '#a78bfa', position: 3 })
  const t = (title, extra = {}) => post('/api/v1/tasks', { title, ...extra })
  await t('Renew passport', { priority: 1, due: { date: d[-2] } })
  await t('Call the plumber about the leak', { priority: 2, due: { date: d[-1], time: '09:30' }, project_id: home.id })
  await t('Review pull request #42', { priority: 2, due: { date: d[0], time: '11:00' }, project_id: work.id, description: 'Focus on the sync edge cases.' })
  await t('Pick up groceries', { priority: 4, due: { date: d[0] } })
  await t('Write release notes for v0.2', { priority: 3, due: { date: d[0], time: '16:00' }, project_id: work.id })
  await t('Get three quotes for the kitchen', { priority: 1, due: { date: d[1] }, project_id: home.id, description: 'Ask about lead times and payment schedule.' })
  await t('Pick paint colours', { priority: 3, due: { date: d[1] }, project_id: home.id })
  await t('Sketch the landing page', { priority: 2, due: { date: d[2] }, project_id: side.id })
  await t('Book dentist appointment', { priority: 3, due: { date: d[4] } })
  await t('Order new taps', { project_id: home.id })
  await t('Plan the weekend hike', { due: { date: d[6] }, project_id: side.id })
  await t('Read the sync protocol doc', { project_id: side.id })
  await t('Email the landlord about the heating')
  await t('Set up backups for the NAS', { priority: 3 })
  await t('Buy a birthday present for Sam', { completed_at: Date.now() - 3600e3 })
  await t('Submit expense report', { completed_at: Date.now() - 7200e3, project_id: work.id })
  return home.id
}, { d: Object.fromEntries([-2, -1, 0, 1, 2, 4, 6].map(n => [n, iso(n)])) })
const homeId = await seed()
await page.reload(); await page.getByText('Renew passport').waitFor({ timeout: 15000 })
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` })
// Today with overdue group
await page.goto(base + '/today'); await page.getByRole('heading', { name: 'Overdue' }).waitFor(); await page.waitForTimeout(600); await shot('today')
// Upcoming grouped
await page.goto(base + '/upcoming'); await page.getByRole('heading', { name: 'Tomorrow' }).waitFor(); await page.waitForTimeout(400); await shot('upcoming')
// Project with detail panel
await page.goto(base + `/project/${homeId}`); await page.getByText('Get three quotes for the kitchen').waitFor()
await page.getByText('Get three quotes for the kitchen').click(); await page.getByRole('button', { name: 'P1' }).waitFor(); await page.waitForTimeout(400); await shot('project')
// Keyboard help
await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.keyboard.press('j'); await page.keyboard.press('?'); await page.getByText('Keyboard shortcuts').waitFor(); await page.waitForTimeout(300); await shot('shortcuts')
await page.keyboard.press('Escape')
// Settings with token
await page.goto(base + '/settings'); await page.getByPlaceholder(/Token name/).fill('laptop CLI'); await page.getByRole('button', { name: 'Create' }).click(); await page.getByText('Copy this token now').waitFor(); await shot('settings')
// Inbox
await page.goto(base + '/'); await page.getByText('Email the landlord').waitFor(); await page.waitForTimeout(300); await shot('inbox')
// Offline on a second context
const c2 = await mk({}); const p2 = await c2.newPage(); await p2.goto(base)
await p2.getByLabel('Email').fill('ada@example.com'); await p2.getByLabel(/Password/).fill('correct horse battery staple'); await p2.getByRole('button', { name: 'Sign in' }).click()
await p2.getByText('Renew passport').waitFor({ timeout: 15000 }); await p2.goto(base + `/project/${homeId}`); await p2.getByText('Order new taps').waitFor()
await c2.setOffline(true); await p2.getByLabel('Add a task').fill('Added on the train, no signal'); await p2.getByLabel('Add a task').press('Enter')
await p2.waitForFunction(() => /Offline/.test(document.body.innerText)); await p2.waitForTimeout(300); await p2.screenshot({ path: `${out}/offline.png` })
await c2.setOffline(false)
// Dark desktop + mobile dark
const c3 = await mk({ colorScheme: 'dark' }); const p3 = await c3.newPage(); await p3.goto(base + '/today')
await p3.getByLabel('Email').fill('ada@example.com'); await p3.getByLabel(/Password/).fill('correct horse battery staple'); await p3.getByRole('button', { name: 'Sign in' }).click()
await p3.getByText('Renew passport').waitFor({ timeout: 15000 }); await p3.goto(base + '/today'); await p3.getByRole('heading', { name: 'Overdue' }).waitFor(); await p3.waitForTimeout(500); await p3.screenshot({ path: `${out}/today-dark.png` })
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, colorScheme: 'dark' }); const mp = await m.newPage(); await mp.goto(base + '/today')
await mp.getByLabel('Email').fill('ada@example.com'); await mp.getByLabel(/Password/).fill('correct horse battery staple'); await mp.getByRole('button', { name: 'Sign in' }).click()
await mp.getByText('Renew passport').waitFor({ timeout: 15000 }); await mp.goto(base + '/today'); await mp.getByRole('heading', { name: 'Overdue' }).waitFor(); await mp.waitForTimeout(500); await mp.screenshot({ path: `${out}/mobile-dark.png` })
await mp.getByText('Review pull request #42').click(); await mp.getByRole('button', { name: 'P1' }).waitFor(); await mp.waitForTimeout(300); await mp.screenshot({ path: `${out}/mobile-detail.png` })
// setup screen on a fresh-looking page (reuse: just the login screen)
const c4 = await mk({}); const p4 = await c4.newPage(); await p4.goto(base); await p4.getByLabel('Email').waitFor(); await p4.screenshot({ path: `${out}/signin.png` })
await browser.close(); console.log('SHOTS OK')
