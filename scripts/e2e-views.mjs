// End-to-end check of saved views (OpenSpec change `custom-views`) against a running
// server with a FRESH data directory: saving from the Filter view, editing, grouping
// and sort, sidebar order and counts, unpin and the g v overview, dashboards (Tab
// between panels, live counts, removed-view placeholder, stacking), the per-device
// start view with its fallback, and two devices converging on a view edited offline.
// See scripts/README.md.
// Resolve Playwright locally (npm i / npx -p) or from a global install (npm i -g playwright).
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
const shot = async (page, name) => { if (shots) await page.screenshot({ path: `${shots}/${name}` }) }
const assert = (c, msg) => { if (!c) throw new Error('ASSERT: ' + msg) }

function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const now = new Date()
const TODAY = iso(now)
const TOMORROW = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
const YESTERDAY = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))
const LATER = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 9))

async function device(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } })
  // The Filters group starts folded on a new device (sidebar-favourites, quiet-sidebar): open it, as a device that stored it.
  await ctx.addInitScript(() => { try { if (localStorage.getItem('ot.sidebar.group.filters') === null) localStorage.setItem('ot.sidebar.group.filters', '1') } catch { /* no storage */ } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|net::/.test(m.text())) errors.push(`${name} console: ${m.text()}`) })
  page.on('dialog', (d) => d.accept())
  return { ctx, page }
}

const A = await device('A')
const api = A.ctx.request
let r = await api.post(`${base}/api/v1/auth/register`, { data: { email: 'ada@example.com', name: 'Ada', password: 'correct horse battery staple' } })
assert(r.status() === 201, 'register ' + r.status())
const post = async (path, data) => { const res = await api.post(`${base}/api/v1/${path}`, { data }); assert(res.ok(), `${path} ${res.status()} ${await res.text()}`); return res.json() }
const get = async (path) => (await api.get(`${base}/api/v1/${path}`)).json()

step('seed labels, projects and tasks through the API')
const work = (await post('labels', { name: 'work' })).id
const waiting = (await post('labels', { name: 'waiting' })).id
const errand = (await post('labels', { name: 'errand' })).id
const pWork = (await post('projects', { name: 'Work' })).id
const seed = [
  { title: 'Overdue report', priority: 1, due: { date: YESTERDAY }, labels: [work], project_id: pWork },
  { title: 'Ship release', priority: 1, due: { date: TODAY }, labels: [work], project_id: pWork },
  { title: 'Review PR', priority: 3, due: { date: TODAY }, labels: [work] },
  { title: 'Plan sprint', priority: 1, due: { date: TOMORROW }, labels: [work, waiting], project_id: pWork },
  { title: 'Prepare demo', priority: 1, due: { date: TOMORROW }, labels: [work] },
  { title: 'Quarterly goals', priority: 1, due: { date: LATER }, labels: [work] },
  { title: 'Hear back from landlord', priority: 4, labels: [waiting] },
  { title: 'Buy stamps', priority: 2, due: { date: TODAY }, labels: [errand] },
  { title: 'Pick up parcel', priority: 1, due: { date: TODAY }, labels: [errand] },
]
for (const t of seed) await post('tasks', t)

const pageA = A.page
await pageA.goto(base)
await pageA.getByText('Hear back from landlord').waitFor()

step('Filter view: run a query, press s, save "Work tomorrow"')
// The Inbox opens with quick add focused: leave the field so g f is a shortcut, not text.
await pageA.getByRole('combobox', { name: 'Add a task' }).blur()
await pageA.keyboard.press('g'); await pageA.keyboard.press('f')
const q = pageA.getByLabel('Filter query')
await q.fill('@work & due <= tomorrow & p1')
await q.press('Enter')
await pageA.getByText('Plan sprint').waitFor()
const filterCount = await pageA.locator('[data-page-meta]').first().textContent()
assert(filterCount === '4', 'filter count ' + filterCount)
await pageA.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Filter results')
await pageA.keyboard.press('s')
await pageA.getByLabel('Filter name').fill('Work tomorrow')
await pageA.getByLabel('Filter name').press('Enter')
await pageA.getByRole('heading', { name: 'Work tomorrow' }).waitFor()
const sidebarViews = pageA.getByRole('navigation', { name: 'Filters' })
await sidebarViews.getByText('Work tomorrow').waitFor()
// The count renders before the view has evaluated; give it a moment to settle.
await pageA.waitForFunction(() => document.querySelector('[data-page-meta]')?.textContent === '4', null, { timeout: 5000 }).catch(() => undefined)
const viewCount = await pageA.locator('[data-page-meta]').first().textContent()
assert(viewCount === '4', 'view result count ' + viewCount)
// A filter row shows no number (quiet-sidebar): its name and data-open-count, the count read by assistive technology.
await pageA.waitForFunction(() => [...document.querySelectorAll('nav[aria-label="Filters"] button[data-view-id]')].some((b) => (b.querySelector('.truncate')?.textContent ?? '') + (b.querySelector('[data-open-count]')?.getAttribute('data-open-count') ?? '') === 'Work tomorrow4'))
await shot(pageA, 'views-saved.png')

step('Edit a saved query: / then add "& !@waiting", Enter')
await pageA.locator('body').click({ position: { x: 900, y: 700 } })
await pageA.keyboard.press('/')
const vq = pageA.getByLabel('View query')
assert(await vq.evaluate((el) => el === document.activeElement), '/ focuses the query')
await vq.press('End')
await vq.type(' & !@waiting')
await vq.press('Enter')
await pageA.waitForFunction(() => document.querySelector('[data-page-meta]')?.textContent === '3')
assert(!(await pageA.getByText('Plan sprint').isVisible()), 'Plan sprint filtered out')
let serverViews = (await get('views')).views
for (let i = 0; i < 20 && serverViews[0]?.query !== '@work & due <= tomorrow & p1 & !@waiting'; i++) {
  await pageA.waitForTimeout(250); serverViews = (await get('views')).views
}
assert(serverViews[0].query === '@work & due <= tomorrow & p1 & !@waiting', 'query synced to server: ' + serverViews[0]?.query)
const workId = serverViews[0].id

step('Invalid query edit shows the parse error and keeps the saved query')
await vq.fill('@work p1')
await vq.press('Enter')
await pageA.getByRole('alert').filter({ hasText: 'Expected "&" or "|" before "p1" at position 7' }).waitFor()
await vq.press('Escape')
assert((await vq.inputValue()) === '@work & due <= tomorrow & p1 & !@waiting', 'Esc restores the query')

step('Group by due date: Overdue, Today, Tomorrow headings in order; sort by priority descending')
await pageA.getByLabel('Group by').selectOption('due')
await pageA.getByRole('heading', { name: 'Overdue', level: 2 }).waitFor()
const headings = await pageA.locator('[aria-label="View results"] h2').allTextContents()
assert(JSON.stringify(headings) === JSON.stringify(['Overdue', 'Today', 'Tomorrow']), 'headings ' + headings)
await pageA.getByLabel('Sort by').selectOption('priority')
await pageA.getByLabel('Sort direction').selectOption('desc')
// keyboard reachability: options are selects in tab order after the query input
await vq.focus()
await pageA.keyboard.press('Tab')
assert(await pageA.evaluate(() => document.activeElement?.getAttribute('aria-label')) === 'Group by', 'Tab reaches Group by')
await shot(pageA, 'views-grouped.png')

step('Save a second view "Waiting" and move it first in the sidebar')
await pageA.keyboard.press('Escape')
await pageA.locator('body').click({ position: { x: 900, y: 700 } })
await pageA.keyboard.press('g'); await pageA.keyboard.press('f')
await pageA.getByLabel('Filter query').fill('@waiting')
await pageA.getByLabel('Filter query').press('Enter')
await pageA.getByText('Hear back from landlord').waitFor()
await pageA.getByRole('button', { name: 'Save filter' }).click()
await pageA.getByLabel('Filter name').fill('Waiting')
await pageA.getByLabel('Filter name').press('Enter')
await pageA.getByRole('heading', { name: 'Waiting' }).waitFor()
await sidebarViews.getByLabel('Menu for view Waiting').click()
await pageA.locator('[data-overlay]').getByRole('menuitem', { name: 'Move up' }).click() // menus open in the overlay layer
await pageA.waitForFunction(() => {
  const t = [...document.querySelectorAll('nav[aria-label="Filters"] button[data-view-id]')].map((b) => (b.querySelector('.truncate')?.textContent ?? '') + (b.querySelector('[data-open-count]')?.getAttribute('data-open-count') ?? ''))
  return t[0] === 'Waiting2' && t[1] === 'Work tomorrow3'
})
await shot(pageA, 'views-sidebar-order.png')

step('Device B signs in and sees the same order and counts after sync')
const B = await device('B')
const pageB = B.page
r = await B.ctx.request.post(`${base}/api/v1/auth/login`, { data: { email: 'ada@example.com', password: 'correct horse battery staple' } })
assert(r.ok(), 'login B')
await pageB.goto(base)
const sidebarB = pageB.getByRole('navigation', { name: 'Filters' })
await pageB.waitForFunction(() => {
  const t = [...document.querySelectorAll('nav[aria-label="Filters"] button[data-view-id]')].map((b) => (b.querySelector('.truncate')?.textContent ?? '') + (b.querySelector('[data-open-count]')?.getAttribute('data-open-count') ?? ''))
  return t[0] === 'Waiting2' && t[1] === 'Work tomorrow3'
}, null, { timeout: 15000 })
// The edited query arrived on B too.
await sidebarB.getByText('Work tomorrow').click()
assert((await pageB.getByLabel('View query').inputValue()) === '@work & due <= tomorrow & p1 & !@waiting', 'B sees edited query')
assert((await pageB.getByLabel('Group by').inputValue()) === 'due', 'B sees grouping')

step('Unpin "Waiting": leaves Favourites, still in Filters and the g v overview')
await sidebarViews.getByLabel('Menu for view Waiting').click()
await pageA.locator('[data-overlay]').getByRole('menuitemcheckbox', { name: 'Pin to sidebar' }).click()
await pageA.getByRole('navigation', { name: 'Favourites' }).getByText('Waiting').waitFor({ state: 'detached' })
await sidebarViews.getByText('Waiting').waitFor()
await pageA.locator('body').click({ position: { x: 900, y: 700 } })
await pageA.keyboard.press('g'); await pageA.keyboard.press('v')
await pageA.getByRole('heading', { name: 'Filters', level: 1 }).waitFor()
// The overview lists every saved filter; an unpinned one offers Pin.
const notPinned = pageA.locator('li', { has: pageA.getByRole('button', { name: 'Pin Waiting' }) })
await notPinned.getByText('Waiting', { exact: true }).waitFor()
await shot(pageA, 'views-overview.png')
await pageB.waitForFunction(() => ![...document.querySelectorAll('nav[aria-label="Favourites"] [data-favourite^="view:"]')].some((b) => b.textContent?.includes('Waiting')), null, { timeout: 15000 })
await notPinned.getByRole('button', { name: 'Pin Waiting' }).click()

step('Morning review dashboard with three panels')
const mk = async (name, query) => { await post('views', { name, query, pinned: false }) }
await mk('Today p1', 'today & p1')
await mk('Errands', '@errand')
await pageA.getByRole('button', { name: 'New board' }).click()
// The chooser (rule-boards): Empty board is preselected.
await pageA.locator('[data-board-choice="empty"] input').check()
await pageA.getByRole('button', { name: 'Next' }).click()
await pageA.getByLabel('Board name').fill('Morning')
await pageA.getByLabel('Board name').press('Enter')
await pageA.getByRole('heading', { name: 'Morning' }).waitFor()
for (const n of ['Today p1', 'Waiting', 'Errands']) {
  await pageA.getByLabel('Add panel').selectOption({ label: n })
  await pageA.locator(`section[aria-label="${n}"]`).waitFor()
}
// The visible count; the full phrase beside it is for screen readers (assistive-tech-semantics).
const panelText = async (n) => pageA.locator(`section[aria-label="${n}"] h2 + span [aria-hidden="true"]`).textContent()
assert(await panelText('Today p1') === '2', 'Today p1 count ' + await panelText('Today p1'))
assert(await panelText('Waiting') === '2', 'Waiting count')
assert(await panelText('Errands') === '2', 'Errands count')
await pageA.locator('section[aria-label="Errands"]').getByText('Pick up parcel').waitFor()
step('Tab / Shift+Tab move between panels, j/k inside one')
await pageA.locator('body').click({ position: { x: 1200, y: 830 } })
await pageA.keyboard.press('Tab')
const focusedPanel = () => pageA.evaluate(() => document.activeElement?.getAttribute('aria-label'))
assert(await focusedPanel() === 'Today p1', 'Tab → first panel, got ' + await focusedPanel())
await pageA.keyboard.press('Tab')
assert(await focusedPanel() === 'Waiting', 'Tab → second panel')
await pageA.keyboard.press('Shift+Tab')
assert(await focusedPanel() === 'Today p1', 'Shift+Tab → first panel')
await pageA.keyboard.press('j')
await pageA.locator('section[aria-label="Today p1"] li[aria-current]').waitFor()
step('Live update: completing a task through the API updates the panel')
const tasks = (await get('tasks')).tasks
const parcel = tasks.find((t) => t.title === 'Pick up parcel')
await api.patch(`${base}/api/v1/tasks/${parcel.id}`, { data: { completed_at: Date.now() } })
await pageA.waitForFunction(() => document.querySelector('section[aria-label="Errands"] h2 + span [aria-hidden="true"]')?.textContent === '1', null, { timeout: 15000 })
await shot(pageA, 'views-dashboard.png')
const dashId = (await get('views')).views.find((v) => v.name === 'Morning').id
await pageB.goto(`${base}/view/${dashId}`)
await pageB.locator('section[aria-label="Errands"]').waitFor({ timeout: 15000 })

step('Panel view deleted: placeholder with a remove action, other panels keep working')
const errandsId = (await get('views')).views.find((v) => v.name === 'Errands').id
await api.delete(`${base}/api/v1/views/${errandsId}`)
await pageA.getByText('View removed').waitFor({ timeout: 15000 })
assert(await panelText('Waiting') === '2', 'other panels still work')
await shot(pageA, 'views-panel-removed.png')
await pageA.getByRole('button', { name: 'Remove panel' }).click()
await pageA.getByText('View removed').waitFor({ state: 'detached' })

step('Narrow screen: panels stack')
await pageA.setViewportSize({ width: 380, height: 800 })
await pageA.waitForTimeout(400) // let the sidebar transition finish
const xs = await pageA.locator('section[data-panel-index]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)))
assert(new Set(xs).size === 1, 'stacked panels ' + xs)
await shot(pageA, 'views-dashboard-mobile.png')
await pageA.setViewportSize({ width: 1280, height: 860 })

step('Start view per device: A starts on "Work tomorrow", B keeps the Inbox')
await pageA.goto(`${base}/settings/preferences`)
await pageA.getByLabel('Start view on this device').selectOption({ label: 'Work tomorrow' })
await pageA.waitForTimeout(200)
await pageA.goto(base)
await pageA.waitForURL(`**/view/${workId}`)
await pageA.getByRole('heading', { name: 'Work tomorrow' }).waitFor()
await pageB.goto(base)
await pageB.waitForTimeout(800)
assert(new URL(pageB.url()).pathname === '/', 'B stays on the Inbox: ' + pageB.url())
await pageB.getByRole('combobox', { name: 'Add a task' }).waitFor()
step('B sets its own start view from a view menu')
await pageB.getByRole('navigation', { name: 'Filters' }).getByLabel('Menu for view Morning').click()
await pageB.getByRole('menuitemcheckbox', { name: 'Start view on this device' }).click()
await pageB.waitForTimeout(200) // the preference is written to IndexedDB asynchronously
await pageB.goto(base)
await pageB.waitForURL(`**/view/${dashId}`)
await pageA.goto(base)
await pageA.waitForURL(`**/view/${workId}`)

step('Deleted start view: B deletes "Work tomorrow"; A syncs, relaunches on the Inbox with a notice')
await pageB.getByRole('navigation', { name: 'Filters' }).getByLabel('Menu for view Work tomorrow').click()
await pageB.getByRole('menuitem', { name: 'Delete view…' }).click()
// Deleting asks first (labels-and-menus): confirm in the alert dialog.
await pageB.getByRole('alertdialog').getByRole('button', { name: 'Delete view' }).click()
await pageA.getByText('This view does not exist').waitFor({ timeout: 15000 })
await pageA.goto(base)
await pageA.getByRole('status').filter({ hasText: 'start view was deleted' }).waitFor()
assert(new URL(pageA.url()).pathname === '/', 'A fell back to the Inbox')
await shot(pageA, 'views-start-fallback.png')

step('Two devices offline: A saves and pins a view offline, B sees it after A reconnects')
await pageA.getByRole('button', { name: 'Dismiss' }).click()
await A.ctx.setOffline(true)
await pageA.keyboard.press('g'); await pageA.keyboard.press('f')
await pageA.getByLabel('Filter query').fill('@work & p1')
await pageA.getByLabel('Filter query').press('Enter')
await pageA.getByText('Quarterly goals').waitFor()
await pageA.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Filter results')
await pageA.keyboard.press('s')
await pageA.getByLabel('Filter name').fill('Work p1')
await pageA.getByLabel('Filter name').press('Enter')
await pageA.getByRole('heading', { name: 'Work p1' }).waitFor()
await sidebarViews.getByText('Work p1').waitFor()
await pageA.waitForTimeout(500)
assert(!(await get('views')).views.some((v) => v.name === 'Work p1'), 'not on server while offline')
await A.ctx.setOffline(false)
await pageB.getByRole('navigation', { name: 'Filters' }).getByText('Work p1').waitFor({ timeout: 20000 })
const wp1 = (await get('views')).views.find((v) => v.name === 'Work p1').id

step('Both offline: A changes sort and grouping, B later changes grouping; reconnect and converge')
await pageB.goto(`${base}/view/${wp1}`)
await pageB.getByRole('heading', { name: 'Work p1' }).waitFor()
await pageA.goto(`${base}/view/${wp1}`)
await pageA.getByRole('heading', { name: 'Work p1' }).waitFor()
await A.ctx.setOffline(true)
await B.ctx.setOffline(true)
await pageA.getByLabel('Group by').selectOption('priority')
await pageA.getByLabel('Sort by').selectOption('title')
await pageA.waitForTimeout(50)
await pageB.getByLabel('Group by').selectOption('due')
await pageA.waitForTimeout(300)
await A.ctx.setOffline(false)
await B.ctx.setOffline(false)
const converged = async (p) => p.waitForFunction(() => {
  const g = document.querySelector('select[aria-label="Group by"]')?.value
  const s = document.querySelector('select[aria-label="Sort by"]')?.value
  return g === 'due' && s === 'title'
}, null, { timeout: 30000 })
await converged(pageA)
await converged(pageB)
const sideCounts = (p) => p.evaluate(() => [...document.querySelectorAll('nav[aria-label="Filters"] button[data-view-id]')].map((b) => (b.querySelector('.truncate')?.textContent ?? '') + (b.querySelector('[data-open-count]')?.getAttribute('data-open-count') ?? '')))
const ca = await sideCounts(pageA), cb = await sideCounts(pageB)
assert(JSON.stringify(ca) === JSON.stringify(cb), `identical sidebars ${ca} / ${cb}`)
const ha = await pageA.locator('[aria-label="View results"] h2').allTextContents()
const hb = await pageB.locator('[aria-label="View results"] h2').allTextContents()
assert(JSON.stringify(ha) === JSON.stringify(hb) && ha[0] === 'Overdue', `identical groups ${ha} / ${hb}`)
const sv = (await get('views')).views.find((v) => v.id === wp1)
assert(sv.group_by === 'due' && sv.sort_by === 'title', 'server converged ' + JSON.stringify(sv))
console.log('  A sidebar:', ca.join(' | '))
console.log('  B sidebar:', cb.join(' | '))
await shot(pageA, 'views-converged-A.png')
await shot(pageB, 'views-converged-B.png')

step('one page frame: the header and the content start, and the actions end, at the same place on every page (ux-feedback-2)')
// app-shell "Page template": Inbox, a project as list, board and timeline, Labels, Trash and Filter.
const frameEdges = () => pageA.evaluate(() => {
  const row = document.querySelector('[data-page-header-row]')
  const body = row?.closest('[data-page-body]')
  const content = body ? [...body.children].find((c) => !c.matches('[data-page-header]')) : null
  if (!row || !content) return null
  const h = row.getBoundingClientRect()
  return { left: Math.round(h.left), right: Math.round(h.right), content: Math.round(content.getBoundingClientRect().left) }
})
const layout = (name) => pageA.getByRole('group', { name: 'Project layout' }).getByRole('button', { name })
for (const width of [1280, 1440]) {
  await pageA.setViewportSize({ width, height: 900 })
  const seen = []
  const measure = async (label) => {
    await pageA.locator('[data-page-header-row]').first().waitFor()
    await pageA.waitForTimeout(150)
    const e = await frameEdges()
    assert(e, `${label}: no page header or content at ${width} px`)
    seen.push([label, e])
  }
  for (const path of ['/inbox', '/labels', '/trash', '/filter']) { await pageA.goto(base + path); await measure(path) }
  await pageA.goto(`${base}/project/${pWork}`)
  for (const mode of ['List', 'Board', 'Timeline']) { await layout(mode).click(); await measure(`project ${mode}`) }
  await layout('List').click()
  const [first] = seen
  for (const [label, e] of seen) {
    assert(Math.abs(e.left - first[1].left) <= 1 && Math.abs(e.right - first[1].right) <= 1, `${label} header ${e.left}–${e.right} differs from ${first[0]} ${first[1].left}–${first[1].right} at ${width} px`)
    assert(Math.abs(e.content - e.left) <= 1, `${label} content starts at ${e.content}, header at ${e.left} (${width} px)`)
  }
  console.log(`  ${width} px: header ${first[1].left}–${first[1].right} on ${seen.length} pages`)
}
await pageA.setViewportSize({ width: 1280, height: 860 })

step('Help lists the new shortcuts')
await pageA.locator('body').click({ position: { x: 900, y: 700 } })
await pageA.keyboard.press('?')
await pageA.getByText('Go to Filters: saved views, boards and dashboards').first().waitFor()

await browser.close()
if (errors.length) {
  console.log('ERRORS:\n' + errors.join('\n'))
  process.exit(1)
}
console.log('OK: all saved-view flows passed')
