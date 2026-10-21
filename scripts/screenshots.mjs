// Seeds a fresh OpenTodo server with realistic demo data (three accounts, shared
// projects, sections, subtasks, comments, reminders, views, settings) and captures
// the screenshots used by README.md and the website.
//
//   node scripts/screenshots.mjs [png-dir] [webp-dir]
//
// png-dir  (default docs/screenshots)     PNGs referenced by README.md
// webp-dir (default docs/screenshots/site) every shot as WebP for the website (site bundle `shots/`)

//
// Run it against an EMPTY data directory: it creates the owner account.
// Optional env: OPENTODO_URL (default http://127.0.0.1:8080), CHROMIUM_PATH,
// ONLY=name,name to capture a subset (seeding always runs).
const { chromium } = await import('playwright').catch(async () => {
  const { createRequire } = await import('node:module')
  const { execSync } = await import('node:child_process')
  return createRequire(execSync('npm root -g').toString().trim() + '/')('playwright')
})
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

const base = process.env.OPENTODO_URL ?? 'http://127.0.0.1:8080'
const pngDir = process.argv[2] ?? 'docs/screenshots'
const webpDir = process.argv[3] ?? 'docs/screenshots/site'
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null
// Shots also written as PNG (README.md embeds these).
const PNG = new Set(['today', 'project', 'mobile-dark', 'day'])
// Shots the website does not use (README only).
const NO_WEBP = new Set(['day'])
mkdirSync(pngDir, { recursive: true }); mkdirSync(webpDir, { recursive: true })

const PASSWORD = 'correct horse battery staple'
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
// Every shot shows the same moment: 08:40 (UTC) on the next Tuesday, Wednesday or
// Thursday, so the week grid has days on both sides and nothing seeded is "in the future"
// of the server's own timestamps (comments, activity).
const DAY = 864e5
const now = new Date()
const today0 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
let ahead = 1
while (![2, 3, 4].includes(new Date(today0 + ahead * DAY).getUTCDay())) ahead++
const anchor = today0 + ahead * DAY
const iso = (n) => new Date(anchor + n * DAY).toISOString().slice(0, 10)
const at = (n, hhmm) => new Date(`${iso(n)}T${hhmm}:00Z`).getTime()
const NOW = at(0, '08:40')
const mk = async (o = {}, time = NOW) => {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, colorScheme: 'light', timezoneId: 'UTC', locale: 'en-GB', ...o })
  await c.addInitScript(() => { try { localStorage.setItem('opentodo.rowClick', 'open') } catch {} })  // click opens the panel, as these flows expect (inline-task-editing)
  await c.clock.setFixedTime(time)
  // The owner's "Set up the assistant" line on Today (assistant-skills) is off-topic in product shots.
  await c.addInitScript(() => {
    const hide = () => { const st = document.createElement('style'); st.textContent = '[data-ask-hint]{display:none!important}'; document.head.append(st) }
    if (document.head) hide(); else document.addEventListener('DOMContentLoaded', hide)
  })
  return c
}
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const row = (p, title) => p.getByRole('button', { name: new RegExp('^' + esc(title)) }).first()
const detail = (p) => p.locator('aside[data-detail-for]')
const settle = (p, ms = 500) => p.waitForTimeout(ms)

// ------------------------------------------------------------------ encoder
// Chromium encodes WebP through a canvas, so no image tooling is needed.
const enc = await (await browser.newContext()).newPage()
async function save(name, png) {
  if (PNG.has(name)) writeFileSync(`${pngDir}/${name}.png`, png)
  if (NO_WEBP.has(name)) return console.log('  shot', name)
  const b64 = await enc.evaluate(async (src) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + src; await img.decode()
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight
    c.getContext('2d').drawImage(img, 0, 0)
    return c.toDataURL('image/webp', 0.78).split(',')[1]
  }, png.toString('base64'))
  writeFileSync(`${webpDir}/${name}.webp`, Buffer.from(b64, 'base64'))
  console.log('  shot', name)
}
const want = (name) => !only || only.has(name)
const shot = async (p, name, opts = {}) => { if (want(name)) await save(name, await p.screenshot(opts)) }

// ------------------------------------------------------------------ accounts
async function api(ctx, method, path, body) {
  const r = await ctx.request.fetch(base + path, { method, headers: { Origin: base, 'Content-Type': 'application/json' }, data: body === undefined ? undefined : JSON.stringify(body) })
  const text = await r.text()
  if (!r.ok()) throw new Error(`${method} ${path} → ${r.status()} ${text}`)
  return text ? JSON.parse(text) : null
}
async function signIn(page, email) {
  await page.goto(base)
  await page.getByLabel('Email').fill(email); await page.getByLabel(/Password/).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('combobox', { name: 'Add a task' }).waitFor({ timeout: 15000 })
}


const ctx = await mk(); const page = await ctx.newPage()
await page.goto(base)
await page.getByLabel('Name').fill('Ada Lovelace'); await page.getByLabel('Email').fill('ada@example.com'); await page.getByLabel(/Password/).fill(PASSWORD)
await page.getByRole('button', { name: 'Create owner account' }).click()
await page.getByRole('combobox', { name: 'Add a task' }).waitFor()
const A = (m, p, b) => api(ctx, m, p, b)

async function member(name, email) {
  const { link } = await A('POST', '/api/v1/invitations', { email })
  const c = await browser.newContext()
  const { user } = await api(c, 'POST', '/api/v1/auth/register', { email, name, password: PASSWORD, invitation: link.split('/invite/')[1] })
  return { ctx: c, id: user.id, call: (m, p, b) => api(c, m, p, b) }
}
const bob = await member('Bob Okafor', 'bob@example.com')
const chen = await member('Chen Wei', 'chen@example.com')
const me = (await A('GET', '/api/v1/me')).user

// ------------------------------------------------------------------ data
console.log('· seeding')
const d = (n) => iso(n)
const proj = (b) => A('POST', '/api/v1/projects', b)
const task = (b) => A('POST', '/api/v1/tasks', b)
const label = (name, color) => A('POST', '/api/v1/labels', { name, color })
const L = {
  errand: (await label('errand', '#f59e0b')).id,
  waiting: (await label('waiting', '#64748b')).id,
  deep: (await label('deep-work', '#8b5cf6')).id,
  call: (await label('call', '#0ea5e9')).id,
}
const home = await proj({ name: 'Home renovation', color: '#f59e0b', position: 1 })
const work = await proj({ name: 'Work', color: '#38bdf8', position: 2 })
const launch = await proj({ name: 'Q4 launch', color: '#0ea5e9', position: 1, parent_id: work.id })
const side = await proj({ name: 'Side project', color: '#a78bfa', position: 3 })
const garage = await proj({ name: 'Garage sale', color: '#ef4444', position: 4 })

// Share Home renovation with Bob (editor) and Chen (viewer); Q4 launch with Bob.
await A('POST', `/api/v1/projects/${home.id}/members`, { email: 'bob@example.com', role: 'editor' })
await A('POST', `/api/v1/projects/${home.id}/members`, { email: 'chen@example.com', role: 'viewer' })
await A('POST', `/api/v1/projects/${launch.id}/members`, { email: 'bob@example.com', role: 'admin' })

const sec = async (project, names) => { const out = {}; let i = 1; for (const n of names) out[n] = (await A('POST', '/api/v1/sections', { name: n, project_id: project, position: i++ })).id; return out }
const hs = await sec(home.id, ['Planning', 'In progress', 'Waiting'])
const ls = await sec(launch.id, ['Backlog', 'This week', 'Review'])

// Inbox and personal
await task({ title: 'Renew passport', priority: 1, due: { date: d(-2) }, labels: [L.errand] })
await task({ title: 'Email the landlord about the heating', labels: [L.waiting] })
await task({ title: 'Set up backups for the NAS', priority: 3 })
await task({ title: 'Pick up groceries', priority: 4, due: { date: d(0), time: '18:00' }, estimate_minutes: 30, labels: [L.errand] })
await task({ title: 'Water the plants', due: { date: d(0) }, recurrence: 'every 3 days' })
await task({ title: 'Pay rent', priority: 2, due: { date: d(3) }, recurrence: 'every 1st' })
await task({ title: 'Book dentist appointment', priority: 3, due: { date: d(4) }, labels: [L.call] })
await task({ title: 'Buy a birthday present for Sam', completed_at: Date.now() - 3600e3 })

// Home renovation (shared)
const quotes = await task({ title: 'Get three quotes for the kitchen', priority: 1, due: { date: d(0), time: '10:00' }, estimate_minutes: 60, project_id: home.id, section_id: hs['In progress'], labels: [L.call],
  description: 'Ask about **lead times** and the payment schedule. Budget is around 12k.' })
for (const [i, t] of ['Call Northside Kitchens', 'Email Brightwood for a site visit', 'Compare payment schedules'].entries())
  await task({ title: t, project_id: home.id, section_id: hs['In progress'], parent_id: quotes.id, position: i + 1, completed_at: i === 0 ? Date.now() - 86400e3 : null })
const paint = await task({ title: 'Pick paint colours', priority: 3, due: { date: d(1) }, project_id: home.id, section_id: hs.Planning })
await task({ title: 'Measure the hallway', due: { date: d(1), time: '08:30' }, estimate_minutes: 15, project_id: home.id, section_id: hs.Planning })
const taps = await task({ title: 'Order new taps', priority: 2, project_id: home.id, section_id: hs.Planning, labels: [L.errand] })
await task({ title: 'Call the plumber about the leak', priority: 2, due: { date: d(-1), time: '09:30' }, project_id: home.id, section_id: hs.Waiting, labels: [L.call, L.waiting] })
await task({ title: 'Electrician sign-off', due: { date: d(5) }, project_id: home.id, section_id: hs.Waiting, labels: [L.waiting] })
await task({ title: 'Remove old wallpaper', project_id: home.id, section_id: hs['In progress'], completed_at: Date.now() - 2 * 86400e3 })

// Work
await task({ title: 'Review pull request #42', priority: 2, due: { date: d(0), time: '11:00' }, estimate_minutes: 45, project_id: work.id, labels: [L.deep], description: 'Focus on the sync edge cases.' })
await task({ title: 'Write release notes for v1.0', priority: 3, due: { date: d(0), time: '14:00' }, estimate_minutes: 90, project_id: work.id, labels: [L.deep] })
await task({ title: '1:1 with Chen', due: { date: d(0), time: '16:00' }, estimate_minutes: 30, project_id: work.id, recurrence: 'every week' })
await task({ title: 'Submit expense report', completed_at: Date.now() - 7200e3, project_id: work.id })
await task({ title: 'Plan the team offsite', priority: 2, due: { date: d(2), time: '09:00' }, estimate_minutes: 120, project_id: work.id })
await task({ title: 'Draft the conference talk', priority: 1, due: { date: d(1), time: '13:00' }, estimate_minutes: 120, project_id: work.id, labels: [L.deep] })
// Q4 launch board
const lt = async (title, section, extra = {}) => task({ title, project_id: launch.id, section_id: ls[section], ...extra })
await lt('Pricing page copy', 'Backlog', { priority: 3 })
await lt('Customer interviews summary', 'Backlog')
await lt('Migration guide', 'Backlog', { labels: [L.deep] })
await lt('Landing page hero', 'This week', { priority: 1, due: { date: d(1) } })
const launchMail = await lt('Launch emails', 'This week', { priority: 3 })
const pressKit = await lt('Press kit', 'This week', { due: { date: d(3) } })
await lt('Status page', 'Review', { priority: 2, due: { date: d(0) } })
await lt('Analytics dashboard', 'Review')

await task({ title: 'Run club', due: { date: d(-1), time: '18:00' }, estimate_minutes: 60, recurrence: 'every monday' })
await task({ title: 'Kitchen site visit (Brightwood)', due: { date: d(2), time: '10:00' }, estimate_minutes: 60, project_id: home.id, section_id: hs.Planning })
await task({ title: 'Prepare demo for the board', priority: 2, due: { date: d(-1), time: '14:00' }, estimate_minutes: 90, project_id: work.id, completed_at: Date.now() - 3 * 3600e3 })
// Side project
await task({ title: 'Sketch the landing page', priority: 2, due: { date: d(2) }, project_id: side.id })
await task({ title: 'Plan the weekend hike', due: { date: d(6) }, project_id: side.id })
await task({ title: 'Read the sync protocol doc', project_id: side.id, labels: [L.deep] })

// Garage sale: deleted, to fill the Trash; plus two deleted tasks
await task({ title: 'Price the old bike', project_id: garage.id })
await task({ title: 'Post flyers', project_id: garage.id })
const oldList = await task({ title: 'Old shopping list' })
const dup = await task({ title: 'Call Northside (duplicate)', project_id: home.id })

// History: a few edits on one task
await A('PATCH', `/api/v1/tasks/${paint.id}`, { title: 'Pick paint colours for the hallway' })
await A('PATCH', `/api/v1/tasks/${paint.id}`, { priority: 2, description: 'Warm white or sage? Samples are in the drawer.' })

// Collaboration: assignment, comments with mentions, Bob's edits
await bob.call('PATCH', `/api/v1/tasks/${paint.id}`, { assignee_id: me.id, title: 'Pick paint colours' })
await A('PATCH', `/api/v1/tasks/${taps.id}`, { assignee_id: bob.id })
await A('PATCH', `/api/v1/tasks/${pressKit.id}`, { assignee_id: bob.id })
await A('PATCH', `/api/v1/tasks/${launchMail.id}`, { title: 'Launch email sequence', due: { date: d(1) } })
await bob.call('PATCH', `/api/v1/tasks/${launchMail.id}`, { priority: 2, description: 'Three emails: announcement, migration tips, one-week check-in.' })
await bob.call('PATCH', `/api/v1/tasks/${launchMail.id}`, { due: { date: d(2) }, estimate_minutes: 90 })
const c1 = await bob.call('POST', `/api/v1/tasks/${quotes.id}/comments`, { body: `Brightwood can come **Thursday at 10**. @Ada does that work for you?`, mentions: [me.id] })
await A('POST', `/api/v1/tasks/${quotes.id}/comments`, { body: 'Thursday works. I will ask them about the worktop too.', parent_id: c1.id })
await chen.call('GET', '/api/v1/me')
await bob.call('POST', `/api/v1/tasks/${quotes.id}/comments`, { body: 'Northside quoted 11.4k, lead time 6 weeks. PDF is in the shared folder.' })
await bob.call('PATCH', `/api/v1/tasks/${taps.id}`, { description: 'Brushed steel, single lever.' })
const bobTasks = (await bob.call('GET', '/api/v1/tasks')).tasks
const wallpaper = bobTasks.find((t) => t.title === 'Measure the hallway')
await bob.call('PATCH', `/api/v1/tasks/${wallpaper.id}`, { completed_at: Date.now() - 600e3 })
await bob.call('PATCH', `/api/v1/tasks/${wallpaper.id}`, { completed_at: null })

// Reminders
await A('POST', '/api/v1/reminders', { task_id: quotes.id, kind: 'relative', offset_minutes: -30, fire_at: at(0, '09:30') })
await A('POST', '/api/v1/reminders', { task_id: quotes.id, kind: 'absolute', fire_at: at(1, '08:00') })

// Saved views and a dashboard
const v1 = await A('POST', '/api/v1/views', { name: 'Deep work', query: '@deep-work & open', pinned: true, color: '#8b5cf6', group_by: 'project', sort_by: 'priority', sort_dir: 'desc', position: 1 })
const v2 = await A('POST', '/api/v1/views', { name: 'Waiting on others', query: '@waiting & open', pinned: true, color: '#64748b', position: 2 })
const v3 = await A('POST', '/api/v1/views', { name: 'Due this week', query: 'due <= 7 days & open', pinned: false, group_by: 'due', position: 3 })
await A('POST', '/api/v1/views', { name: 'Weekly review', kind: 'dashboard', query: '', pinned: true, color: '#10b981', panels: [v3.id, v1.id, v2.id], position: 4 })

// Trash
await A('DELETE', `/api/v1/tasks/${oldList.id}`)
await A('DELETE', `/api/v1/tasks/${dup.id}`)
await A('DELETE', `/api/v1/projects/${garage.id}`)

// Server settings: CalDAV, MCP, a webhook, an app password, backups
await A('PUT', '/api/v1/settings/caldav', { enabled: true }).catch((e) => console.log('  caldav:', e.message))
await A('PUT', '/api/v1/settings/mcp', { enabled: true }).catch((e) => console.log('  mcp:', e.message))
await A('POST', '/api/v1/app-passwords', { name: 'iPhone Reminders' }).catch((e) => console.log('  app password:', e.message))
await A('POST', '/api/v1/webhooks', { url: 'https://ha.example.com/api/webhook/opentodo', events: ['task.completed', 'task.created'] }).catch((e) => console.log('  webhook:', e.message))
await A('POST', '/api/v1/webhooks', { url: 'https://n8n.example.com/webhook/tasks', events: ['task.created'], projectId: work.id }).catch((e) => console.log('  webhook:', e.message))
await A('POST', '/api/v1/tokens', { name: 'Claude Desktop (MCP)', scope: 'read' }).catch((e) => console.log('  token:', e.message))
await A('POST', '/api/v1/tokens', { name: 'laptop CLI' }).catch((e) => console.log('  token:', e.message))
await A('PUT', '/api/v1/backups/settings', { settings: { destination: 'local', local: { dir: '' }, schedule: { frequency: 'daily', time: '03:00', weekday: 0 }, retention: { keepLast: 7, maxAgeDays: 0 }, compress: true } }).catch((e) => console.log('  backups:', e.message))
await A('POST', '/api/v1/backups/run').catch((e) => console.log('  backup run:', e.message))
await A('GET', '/api/v1/email-inbox').catch(() => {})


console.log('· seeded')

// Reload so the device pulls everything.
await page.reload(); await row(page, 'Renew passport').waitFor({ timeout: 20000 }).catch(() => {})
await settle(page, 1500)

// ------------------------------------------------------------------ helpers
const go = async (p, path, ready) => { await p.goto(base + path); if (ready) await ready(); await settle(p, 700) }
// Scroll the settings page so the section headed `name` sits at the top of the viewport.
async function toSection(p, name) {
  const h = p.getByRole('heading', { level: 2, name, exact: true }).first()
  await h.waitFor()
  await h.evaluate((el) => {
    let sc = el.parentElement
    while (sc && !(sc.scrollHeight > sc.clientHeight && /(auto|scroll)/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement
    const target = sc ?? document.scrollingElement
    target.scrollTop += el.getBoundingClientRect().top - (sc ? sc.getBoundingClientRect().top : 0) - 24
  })
  await settle(p, 300)
}
const openTask = async (p, title) => { await row(p, title).click(); await detail(p).waitFor(); await settle(p, 400) }

// ------------------------------------------------------------------ shots
console.log('· capturing')
await go(page, '/today', () => page.getByRole('heading', { name: 'Overdue' }).waitFor())
await shot(page, 'today')

// Natural-language quick add: chips under the input as you type
const qa = page.getByRole('combobox', { name: 'Add a task' })
await qa.click(); await qa.pressSequentially('Call Sarah about the offsite next Wed at 3pm #Work @call p1 30m', { delay: 8 })
await settle(page, 500); await shot(page, 'quick-add')
await qa.fill(''); await page.keyboard.press('Escape')

await go(page, '/upcoming', () => page.getByRole('heading', { name: 'Tomorrow' }).first().waitFor())
await shot(page, 'upcoming')

// Project list with sections and the detail panel (subtasks, labels, reminders)
await go(page, `/project/${home.id}`, () => row(page, 'Get three quotes for the kitchen').waitFor())
await openTask(page, 'Get three quotes for the kitchen')
await shot(page, 'project')
// Same panel, scrolled to the conversation (comments, replies, @mentions)
await detail(page).getByLabel('Comments and activity').first().scrollIntoViewIfNeeded().catch(() => {})
await settle(page, 400); await shot(page, 'comments')
// History of a task: changes from the op log with restore
await page.keyboard.press('Escape')
await go(page, `/project/${launch.id}`, () => row(page, 'Launch email sequence').waitFor())
await openTask(page, 'Launch email sequence')
// History is a tab of the task detail since task-detail-redesign (a toggle button before).
const hist = detail(page).getByRole('tab', { name: /History/ }).or(detail(page).getByRole('button', { name: /History/ })).first()
await hist.scrollIntoViewIfNeeded(); await hist.click(); await settle(page, 800)
await hist.scrollIntoViewIfNeeded(); await shot(page, 'history')
await page.keyboard.press('Escape')

// Share dialog with roles
await go(page, `/project/${home.id}`, () => row(page, 'Order new taps').waitFor())
await page.getByRole('button', { name: /^Share/ }).first().click()
await page.getByRole('dialog', { name: /Share/ }).waitFor(); await settle(page, 600)
await shot(page, 'share')
await page.keyboard.press('Escape')

// Board view (sections as columns) with a card mid-drag
await go(page, `/project/${launch.id}`, () => row(page, 'Pricing page copy').waitFor())
await page.getByRole('group', { name: 'Project layout' }).getByRole('button', { name: 'Board' }).click()
await settle(page, 600); await shot(page, 'board')  // drag-and-drop reorders cards and moves them between columns
await page.getByRole('group', { name: 'Project layout' }).getByRole('button', { name: 'List' }).click().catch(() => {})

// Time blocking
await go(page, '/week', () => page.getByRole('button', { name: 'Week' }).first().waitFor())
await page.getByRole('button', { name: 'Hide task list' }).click().catch(() => {})
await settle(page, 400); await shot(page, 'week')
await page.getByRole('button', { name: /Show task list/ }).click().catch(() => {})
await go(page, '/day', () => page.getByRole('button', { name: 'Day' }).first().waitFor())
await shot(page, 'day')

// Filters and saved views
await go(page, '/filter', () => page.getByLabel('Filter query').waitFor())
await page.getByLabel('Filter query').fill('(@call | @errand) & due <= 7 days')
await page.getByLabel('Filter query').press('Enter'); await settle(page, 600)
await shot(page, 'filter')
const dash = (await A('GET', '/api/v1/views')).views.find((v) => v.kind === 'dashboard')
await go(page, `/view/${dash.id}`); await settle(page, 600)
await shot(page, 'dashboard')

// Activity feed, notifications, trash
await go(page, '/updates', () => page.getByRole('heading', { name: 'Updates' }).waitFor())
await shot(page, 'feed')
await go(page, '/today', () => page.getByRole('heading', { name: 'Overdue' }).waitFor())
await page.getByRole('button', { name: /^Notifications/ }).click()
await page.getByRole('dialog', { name: 'Notifications' }).waitFor(); await settle(page, 500)
await shot(page, 'notifications')
await page.keyboard.press('Escape')
await go(page, '/trash', () => page.getByRole('heading', { name: 'Trash' }).waitFor())
await shot(page, 'trash')

// Keyboard help
await go(page, '/today', () => page.getByRole('heading', { name: 'Overdue' }).waitFor())
await page.keyboard.press('?'); await page.getByText('Keyboard shortcuts').first().waitFor(); await settle(page, 400)
await shot(page, 'shortcuts')
await page.keyboard.press('Escape')

// In-app Help: the user guide of this version, searchable and offline
await go(page, '/help/tasks-and-projects', () => page.getByRole('heading', { level: 1, name: 'Tasks and projects' }).first().waitFor())
await shot(page, 'help')

// Settings: each section has its own page (settings-navigation)
// Legacy section ids open their section at the moved rows (settings-navigation).
await go(page, '/settings/security', () => page.getByRole('heading', { name: 'Two-factor authentication', level: 2 }).first().waitFor()).catch((e) => console.log('  2fa page:', e.message))
await page.getByRole('button', { name: 'Set up two-factor authentication' }).click().catch((e) => console.log('  2fa:', e.message))
await settle(page, 800)
await go(page, '/settings/preferences', () => page.getByRole('heading', { name: 'Keyboard', level: 2 }).first().waitFor()).catch((e) => console.log('  keyboard page:', e.message))
await page.getByLabel(/Vim keybindings/).check().catch((e) => console.log('  vim:', e.message))
for (const [section, heading, name] of [
  ['security', 'Two-factor authentication', 'settings-security'], ['encryption', 'End-to-end encryption', 'settings-encryption'],
  ['preferences', 'Keyboard', 'settings-keyboard'], ['admin', 'Users', 'settings-users'], ['access', 'Single sign-on', 'settings-sso'],
  ['integrations', 'Calendar apps (CalDAV)', 'settings-caldav'], ['integrations', 'Webhooks', 'settings-webhooks'],
  ['capture', 'Email to task', 'settings-email'], ['backups', 'Backups', 'settings-backups'], ['ai', 'AI assistants', 'settings-ai'],
]) {
  if (!want(name)) continue
  try {
    await go(page, `/settings/${section}`, () => page.getByRole('heading', { level: 2, name: heading, exact: true }).first().waitFor())
    await toSection(page, heading)
    await shot(page, name)
  } catch (e) {
    console.log(`  ${name}: ${e.message}`)
  }
}

// Voice capture asks once, with its privacy statement
if (want('settings-voice')) {
  await go(page, '/settings/capture', () => page.getByRole('heading', { level: 2, name: 'Voice capture', exact: true }).first().waitFor())
  await toSection(page, 'Voice capture')
  await page.getByLabel(/Dictate tasks into quick add/).click()
  await page.getByRole('dialog').filter({ hasText: 'Turn on voice capture?' }).waitFor({ timeout: 5000 }).catch((e) => console.log('  voice:', e.message))
  await settle(page, 300); await shot(page, 'settings-voice')
  await page.getByRole('button', { name: 'Turn on', exact: true }).last().click().catch(() => {})
}

// Dark mode, desktop and phone
const dark = await mk({ colorScheme: 'dark' }); const dp = await dark.newPage()
await signIn(dp, 'ada@example.com')
await go(dp, '/today', () => dp.getByRole('heading', { name: 'Overdue' }).waitFor())
await shot(dp, 'today-dark')
const phone = await mk({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark', isMobile: true, hasTouch: true }); const mp = await phone.newPage()
await signIn(mp, 'ada@example.com')
await go(mp, '/today', () => mp.getByRole('heading', { name: 'Overdue' }).waitFor())
await shot(mp, 'mobile-dark')
await openTask(mp, 'Get three quotes for the kitchen')
await shot(mp, 'mobile-detail')

// Reminders: fifty minutes later the 09:30 reminder fires on this device
const later = await mk({}, at(0, '09:31')); const rp = await later.newPage()
await signIn(rp, 'ada@example.com')
await go(rp, `/project/${home.id}`, () => row(rp, 'Get three quotes for the kitchen').waitFor())
await openTask(rp, 'Get three quotes for the kitchen')
await detail(rp).getByLabel('Reminders').first().scrollIntoViewIfNeeded().catch(() => {})
await rp.getByRole('button', { name: 'Tomorrow 09:00' }).first().waitFor({ timeout: 10000 }).catch(() => console.log('  no reminder toast'))
await settle(rp, 500); await shot(rp, 'reminders')

await browser.close()
console.log('SHOTS OK')

