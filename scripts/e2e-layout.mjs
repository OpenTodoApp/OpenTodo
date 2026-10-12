// Layout check (OpenSpec change `mobile-layout`): opens every screen and every
// overlay at phone and tablet widths, in light and dark, in Chromium and WebKit,
// and fails when
//   - a page scrolls sideways outside a designated scroll region (`data-scroll-x`),
//   - an overlay or its close control is outside the viewport or not clickable,
//   - an overlay does not close with Escape, with its close button (sheets and
//     dialogs) or with a tap outside (popovers),
//   - a control on the touch screen is smaller than 44 × 44 px or only appears on hover,
//   - any screen or overlay has a serious or critical axe-core issue (colour contrast,
//     names, labels, roles), in light and dark (release 0.2.0; first added for the
//     Help view by user-documentation),
//   - help does not open offline, or text typed in the share dialog is lost when the
//     help panel opens and closes over it.
// Every failure names screen, overlay, viewport, theme and engine, and saves a
// screenshot into the report directory.
//
//   node scripts/e2e-layout.mjs [report-dir]        (default: layout-report)
//
// Run it against a FRESH data directory (it creates the owner account and seeds
// data through the API). Env: OPENTODO_URL (default http://127.0.0.1:8080),
// ENGINES (default chromium,webkit), WIDTHS (default 360,390,768), THEMES
// (default light,dark), ONLY (comma-separated screen names), CONCURRENCY
// (default 3), SHOTS=all (also save a screenshot of every screen and overlay),
// CHROMIUM_PATH / WEBKIT_PATH (optional executables).
const pw = await import('playwright').catch(async () => {
  const { createRequire } = await import('node:module')
  const { execSync } = await import('node:child_process')
  return createRequire(execSync('npm root -g').toString().trim() + '/')('playwright')
})
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { startFakeLLM } from './fake-llm.mjs'

// axe-core (web devDependency, user-documentation task 5.1), or a global install.
const AXE = (() => {
  try { return readFileSync(createRequire(new URL('../web/package.json', import.meta.url)).resolve('axe-core/axe.min.js'), 'utf8') } catch { /* global */ }
  try { return readFileSync(join(execSync('npm root -g').toString().trim(), 'axe-core/axe.min.js'), 'utf8') } catch { return null }
})()
async function axeProblems(p, include) {
  if (!AXE) return ['axe-core is not installed (npm ci in web/)']
  if (!(await p.evaluate(() => typeof window.axe !== 'undefined'))) await p.addScriptTag({ content: AXE })
  return p.evaluate(async (sel) => {
    // eslint-disable-next-line no-undef
    const r = await axe.run(sel ? { include: [sel] } : document, { resultTypes: ['violations'] })
    return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `axe ${v.impact} ${v.id}: ${v.help} (${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')})`)
  }, include ?? null)
}

const base = process.env.OPENTODO_URL ?? 'http://127.0.0.1:8080'
const outDir = process.argv[2] ?? 'layout-report'
const ENGINES = (process.env.ENGINES ?? 'chromium,webkit').split(',').filter(Boolean)
const HEIGHTS = { 360: 740, 390: 844, 768: 1024 }
const WIDTHS = (process.env.WIDTHS ?? '360,390,768').split(',').map(Number)
const THEMES = (process.env.THEMES ?? 'light,dark').split(',')
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 3)
const SHOTS_ALL = process.env.SHOTS === 'all'
const PASSWORD = 'correct horse battery staple'
const MIN_TARGET = 44
mkdirSync(outDir, { recursive: true })

const failures = []
const log = (...a) => console.log(...a)
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// ------------------------------------------------------------------ seed
const LONG_URL = 'https://example.com/a/very/long/path/that/does/not/fit/on/a/phone/screen/' + 'segment'.repeat(6) + '?ref=layout-check'
async function seed() {
  const browser = await pw.chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
  const ctx = await browser.newContext()
  const call = (c) => async (method, path, body) => {
    const r = await c.request.fetch(base + path, { method, headers: { Origin: base, 'Content-Type': 'application/json' }, data: body === undefined ? undefined : JSON.stringify(body) })
    const text = await r.text()
    if (!r.ok()) throw new Error(`${method} ${path} → ${r.status()} ${text}`)
    return text ? JSON.parse(text) : null
  }
  const A = call(ctx)
  await A('POST', '/api/v1/auth/register', { email: 'ada@example.com', name: 'Ada Lovelace', password: PASSWORD })
  const { link } = await A('POST', '/api/v1/invitations', { email: 'bob@example.com' })
  const bctx = await browser.newContext()
  const B = call(bctx)
  const { user: bob } = await B('POST', '/api/v1/auth/register', { email: 'bob@example.com', name: 'Bob Okafor', password: PASSWORD, invitation: link.split('/invite/')[1] })
  const me = (await A('GET', '/api/v1/me')).user

  const L = {}
  for (const [name, color] of [['errand', '#f59e0b'], ['waiting', '#64748b'], ['deep-work', '#8b5cf6']]) L[name] = (await A('POST', '/api/v1/labels', { name, color })).id
  const home = await A('POST', '/api/v1/projects', { name: 'Home renovation with a rather long project name', color: '#f59e0b' })
  const work = await A('POST', '/api/v1/projects', { name: 'Work', color: '#38bdf8' })
  await A('POST', `/api/v1/projects/${home.id}/members`, { email: 'bob@example.com', role: 'editor' })
  const sections = {}
  let i = 1
  for (const n of ['Planning', 'In progress', 'Waiting']) sections[n] = (await A('POST', '/api/v1/sections', { name: n, project_id: home.id, position: i++ })).id
  const today = new Date().toISOString().slice(0, 10)
  const T = (b) => A('POST', '/api/v1/tasks', b)
  await T({ title: 'Inbox task with a deliberately long title that has to wrap or truncate on a narrow phone screen', priority: 1, due: { date: today }, labels: [L.errand, L.waiting] })
  await T({ title: 'Renew passport', priority: 2, due: { date: today }, labels: [L.errand], estimate_minutes: 30 })
  await T({ title: 'Read ' + LONG_URL, description: 'See ' + LONG_URL })
  const quotes = await T({ title: 'Get three quotes for the kitchen', project_id: home.id, section_id: sections['In progress'], due: { date: today, time: '10:00' }, estimate_minutes: 60 })
  await T({ title: 'Pick paint colours', project_id: home.id, section_id: sections.Planning, labels: [L['deep-work']] })
  await T({ title: 'Call the plumber', project_id: home.id, section_id: sections.Waiting, assignee_id: bob.id })
  await T({ title: 'Plan the team offsite', project_id: work.id, due: { date: today, time: '14:00' }, estimate_minutes: 90 })
  await T({ title: 'Submit expense report', project_id: work.id, completed_at: Date.now() - 3600e3 })
  // A reminder that is already due: its toast shows on every screen.
  const passport = (await A('GET', '/api/v1/tasks')).tasks.find((t) => t.title === 'Renew passport')
  await A('POST', '/api/v1/reminders', { task_id: passport.id, kind: 'absolute', fire_at: Date.now() - 60e3 })
  const trashed = await T({ title: 'Old shopping list' })
  await A('DELETE', `/api/v1/tasks/${trashed.id}`)

  // Notifications for Ada: a mention and an assignment from Bob.
  await B('POST', `/api/v1/tasks/${quotes.id}/comments`, { body: `@Ada can you check ${LONG_URL} before Thursday? It has the supplier's full price list.`, mentions: [me.id] })
  const paint = (await B('GET', '/api/v1/tasks')).tasks.find((t) => t.title === 'Pick paint colours')
  await B('PATCH', `/api/v1/tasks/${paint.id}`, { assignee_id: me.id })

  const v1 = await A('POST', '/api/v1/views', { name: 'Deep work and everything else that matters', query: '@deep-work | p1', pinned: true, color: '#8b5cf6', position: 1 })
  const v2 = await A('POST', '/api/v1/views', { name: 'Due today', query: 'due <= today', pinned: false, position: 2 })
  const dash = await A('POST', '/api/v1/views', { name: 'Weekly review', kind: 'dashboard', query: '', pinned: true, panels: [v1.id, v2.id], position: 3 })
  await A('POST', '/api/v1/webhooks', { url: 'https://ha.example.com/api/webhook/opentodo', events: ['task.completed'] }).catch(() => {})
  await A('POST', '/api/v1/tokens', { name: 'laptop CLI' }).catch(() => {})
  // AI assistants with changes allowed, so Settings shows every switch and the
  // agent token shortcut (mcp-write-tools).
  await A('PUT', '/api/v1/settings/mcp', { enabled: true, writes_enabled: true })
  await A('PUT', '/api/v1/me/agent-access', { allow_writes: true })
  await A('POST', '/api/v1/tokens', { name: 'Desk assistant', scope: 'agent' }).catch(() => {})
  // The in-app assistant (in-app-assistant) against the scripted fake provider
  // in scripts/fake-llm.mjs: no real model provider is ever contacted.
  const llm = await startFakeLLM(0)
  await A('PUT', '/api/v1/settings/assistant', { enabled: true, default_provider: 'compatible', allow_private_endpoint: true,
    providers: { compatible: { enabled: true, model: 'fake-model', base_url: `http://127.0.0.1:${llm.address().port}/v1` } } })
  await A('PUT', '/api/v1/me/assistant', { consent: true, provider: 'compatible' })
  await A('POST', '/api/v1/tasks', { title: 'Water the plants', due: { date: new Date(Date.now() - 2 * 86400e3).toISOString().slice(0, 10) } })
  // One session for every browser context: logging in per context trips the rate limit.
  const storageState = await ctx.storageState()
  await browser.close()
  return { storageState, home: home.id, work: work.id, view: v1.id, dashboard: dash.id, label: L.errand, quotes: quotes.id, llm }
}

// ------------------------------------------------------------------ screens
// `overlays` names openers from OVERLAYS below; each runs on the screen it is listed for.
function screens(ids) {
  const row = (title) => (p) => p.locator('[data-task-id]').filter({ hasText: title }).first().waitFor()
  const heading = (name) => (p) => p.getByRole('heading', { name, level: 1 }).first().waitFor()
  return [
    { name: 'sign-in', path: '/', anon: true, ready: (p) => p.getByRole('button', { name: 'Sign in' }).waitFor() },
    { name: 'inbox', path: '/inbox', ready: row('Renew passport'), overlays: ['notifications', 'help', 'sidebar', 'sidebar-view-menu', 'task-detail', 'label-picker', 'reminder-toast', 'assistant', 'assistant-review'] },
    { name: 'today', path: '/today', ready: row('Renew passport') },
    { name: 'upcoming', path: '/upcoming', ready: heading('Upcoming') },
    { name: 'assigned', path: '/assigned', ready: row('Pick paint colours') },
    { name: 'day', path: '/day', ready: (p) => p.locator('[data-now-line], main').first().waitFor() },
    { name: 'week', path: '/week', ready: (p) => p.locator('main').first().waitFor() },
    { name: 'completed', path: '/completed', ready: row('Submit expense report') },
    { name: 'filter', path: '/filter', ready: (p) => p.getByLabel('Filter query').waitFor() },
    { name: 'trash', path: '/trash', ready: (p) => p.getByText('Old shopping list').first().waitFor() },
    { name: 'activity', path: '/activity', ready: heading(/Activity/) },
    { name: 'project', path: `/project/${ids.home}`, ready: row('Pick paint colours'), overlays: ['project-menu', 'section-menu', 'share', 'mention-picker', 'assignee-picker', 'help-panel'] },
    { name: 'board', path: `/project/${ids.home}`, ready: row('Pick paint colours'), board: true },
    { name: 'saved-view', path: `/view/${ids.view}`, ready: heading(/Deep work/), overlays: ['view-header-menu'] },
    { name: 'dashboard', path: `/view/${ids.dashboard}`, ready: heading(/Weekly review/) },
    { name: 'label', path: `/label/${ids.label}`, ready: row('Renew passport') },
    { name: 'labels', path: '/labels', ready: heading('Labels'), overlays: ['label-menu', 'new-label'] },
    { name: 'views', path: '/views', ready: heading('Views'), overlays: ['view-menu', 'rename-view', 'new-dashboard'] },
    { name: 'settings', path: '/settings', ready: heading('Settings'), overlays: ['notifications', 'voice-consent', 'delete-user'] },
    { name: 'import', path: '/settings/import', ready: heading(/Import/) },
    // In-app Help (user-documentation): also checked offline.
    { name: 'help', path: '/help', ready: heading('Help'), offline: '/help/keyboard' },
    { name: 'help-guide', path: '/help/sections-and-boards', ready: heading('Sections and boards') },
  ]
}

// An opener returns { overlay, trigger?, kind } or null when it does not apply here.
// kind: 'dialog' (close button + Escape + tap outside unless destructive), 'popover'
// (Escape + tap outside, close button on phones), 'panel' (detail panel / drawer:
// close button + Escape), 'toast' (inside the viewport only).
const overlayLoc = (p) => p.locator('[data-overlay]').last()
async function openSidebar(p) {
  const burger = p.getByRole('button', { name: 'Open menu' })
  if (await burger.isVisible()) { await burger.click(); await p.waitForTimeout(350) }
}
// Serialises assistant turns across parallel viewports (see 'assistant-review').
let assistantTurnLock = Promise.resolve()

const OVERLAYS = {
  async notifications(p) {
    const trigger = p.locator('[data-notifications]')
    await trigger.click()
    return { overlay: p.getByRole('dialog', { name: 'Notifications' }), trigger, kind: 'popover' }
  },
  async help(p) {
    const trigger = p.getByRole('button', { name: 'Keyboard shortcuts' })
    await trigger.click()
    return { overlay: p.getByRole('dialog', { name: 'Keyboard shortcuts' }), trigger, kind: 'dialog' }
  },
  async sidebar(p, ctx) {
    if (ctx.width >= 768) return null
    await openSidebar(p)
    return { overlay: p.locator('aside[data-sidebar]'), kind: 'drawer' }
  },
  async 'sidebar-view-menu'(p) {
    await openSidebar(p)
    const trigger = p.locator('aside[data-sidebar]').getByRole('button', { name: /^Menu for view/ }).first()
    await trigger.click()
    return { overlay: overlayLoc(p), trigger, kind: 'popover', after: async () => p.keyboard.press('Escape') }
  },
  async 'task-detail'(p) {
    await p.locator('[data-task-id]').filter({ hasText: 'Renew passport' }).first().getByRole('button').nth(1).click()
    return { overlay: p.locator('aside[data-detail-for]'), kind: 'panel' }
  },
  async 'label-picker'(p) {
    await p.locator('[data-task-id]').filter({ hasText: 'Renew passport' }).first().getByRole('button').nth(1).click()
    await p.locator('aside[data-detail-for]').waitFor()
    await p.keyboard.press('Escape')
    await p.keyboard.press('L')
    return { overlay: p.getByRole('dialog', { name: 'Labels for task' }), kind: 'dialog' }
  },
  async 'reminder-toast'(p) {
    const toast = p.getByRole('alertdialog', { name: /Reminder/ }).first()
    await toast.waitFor({ timeout: 60000 })
    return { overlay: toast, kind: 'toast' }
  },
  async 'project-menu'(p) {
    const trigger = p.getByRole('button', { name: /^Project/ }).first()
    await trigger.click()
    return { overlay: overlayLoc(p), trigger, kind: 'popover' }
  },
  async 'section-menu'(p) {
    const trigger = p.getByRole('button', { name: 'Section menu for Planning' })
    await trigger.click()
    return { overlay: overlayLoc(p), trigger, kind: 'popover' }
  },
  async share(p) {
    const trigger = p.getByRole('button', { name: /^Share/ }).first()
    await trigger.click()
    return { overlay: p.getByRole('dialog', { name: /^Share/ }), trigger, kind: 'dialog' }
  },
  async 'mention-picker'(p) {
    await p.locator('[data-task-id]').filter({ hasText: 'Get three quotes' }).first().getByRole('button').nth(1).click()
    const box = p.locator('aside[data-detail-for]').getByLabel('Write a comment')
    await box.scrollIntoViewIfNeeded()
    await box.click()
    await box.pressSequentially('@B')
    return { overlay: p.getByRole('listbox', { name: 'Mention a member' }), kind: 'combobox', after: async () => { await box.fill(''); await p.keyboard.press('Escape'); await p.keyboard.press('Escape') } }
  },
  async 'assignee-picker'(p) {
    await p.locator('[data-task-id]').filter({ hasText: 'Pick paint colours' }).first().getByRole('button').nth(1).click()
    await p.locator('aside[data-detail-for]').waitFor()
    await p.keyboard.press('Escape')
    await p.keyboard.press('A')
    return { overlay: p.getByRole('dialog', { name: 'Assign task' }), kind: 'dialog' }
  },
  async 'view-header-menu'(p) {
    const trigger = p.locator('main').getByRole('button', { name: /^Menu for view/ }).first()
    if (!(await trigger.isVisible())) return null
    await trigger.click()
    return { overlay: overlayLoc(p), trigger, kind: 'popover' }
  },
  async 'label-menu'(p) {
    const trigger = p.locator('main').getByRole('button', { name: 'Menu for label errand' })
    await trigger.click()
    return { overlay: overlayLoc(p), trigger, kind: 'popover' }
  },
  async 'new-label'(p) {
    await p.getByRole('button', { name: '+ New label' }).click()
    return { overlay: p.locator('main form').first(), kind: 'inline', after: async () => p.keyboard.press('Escape') }
  },
  async 'view-menu'(p) {
    const trigger = p.locator('main').getByRole('button', { name: /^Menu for view/ }).first()
    await trigger.click()
    return { overlay: overlayLoc(p), trigger, kind: 'popover' }
  },
  async 'rename-view'(p) {
    await p.locator('main').getByRole('button', { name: /^Menu for view/ }).first().click()
    await overlayLoc(p).getByRole('button', { name: 'Rename' }).click()
    return { overlay: p.getByRole('dialog', { name: 'Rename view' }), kind: 'dialog' }
  },
  async 'new-dashboard'(p) {
    const trigger = p.getByRole('button', { name: '+ New dashboard' })
    await trigger.click()
    return { overlay: p.getByRole('dialog', { name: 'New dashboard' }), trigger, kind: 'dialog' }
  },
  async 'voice-consent'(p) {
    const box = p.getByRole('checkbox', { name: /Dictate tasks into quick add/ })
    if (!(await box.count()) || await box.isDisabled()) return null
    if (await box.isChecked()) return null
    await box.scrollIntoViewIfNeeded()
    await box.click()
    const d = p.getByRole('dialog', { name: 'Turn on voice capture?' })
    await p.waitForTimeout(300)
    if (!(await d.isVisible())) return null
    return { overlay: d, kind: 'dialog' }
  },
  // Contextual help over the share dialog (user-documentation 4.2): the panel opens on
  // top, and closing it leaves the dialog with the typed email in place.
  async 'help-panel'(p) {
    await p.getByRole('button', { name: /^Share/ }).first().click()
    const dialog = p.getByRole('dialog', { name: /^Share/ })
    await dialog.waitFor()
    const email = dialog.getByRole('textbox').first()
    await email.fill('chen@example.com')
    const trigger = dialog.locator('[data-help-screen="share-dialog"]')
    await trigger.click()
    const overlay = p.locator('[data-help-panel]')
    return {
      overlay, trigger, kind: 'dialog',
      after: async () => {
        if (await overlay.isVisible()) await p.keyboard.press('Escape')
        if (!(await dialog.isVisible())) throw new Error('closing help also closed the share dialog')
        const v = await email.inputValue()
        if (v !== 'chen@example.com') throw new Error(`the typed email was lost when help opened (now "${v}")`)
        await p.keyboard.press('Escape')
      },
    }
  },
  // In-app assistant (in-app-assistant): the panel from the header button, and
  // a proposal to review after a scripted answer.
  async assistant(p) {
    const trigger = p.locator('[data-assistant-launcher]')
    await trigger.click()
    return { overlay: p.locator('[data-assistant-panel]'), trigger, kind: 'dialog' }
  },
  // Viewports run in parallel as the same user and the server allows one turn
  // per user at a time (409 turn_in_progress), so turns take a shared lock
  // until the answer has finished streaming.
  async 'assistant-review'(p) {
    let release
    const prev = assistantTurnLock
    assistantTurnLock = new Promise((r) => { release = r })
    await prev
    try {
      await p.keyboard.press('Shift+I')
      const panel = p.locator('[data-assistant-panel]')
      await panel.waitFor()
      await panel.locator('[data-assistant-composer]').fill('Move everything overdue to Friday')
      await p.keyboard.press('Enter')
      await panel.locator('[data-assistant-review]').waitFor({ timeout: 20000 })
      await panel.locator('[aria-busy="true"]').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {})
      return { overlay: panel, kind: 'dialog', after: async () => { if (await panel.isVisible()) await p.keyboard.press('Escape') } }
    } finally {
      release()
    }
  },
  async 'delete-user'(p) {
    const del = p.getByRole('button', { name: 'Delete', exact: true }).first()
    if (!(await del.count())) return null
    await del.scrollIntoViewIfNeeded()
    await del.click()
    return { overlay: p.getByRole('dialog', { name: /^Delete bob@example.com/ }), kind: 'dialog', destructive: true }
  },
}

// ------------------------------------------------------------------ checks (run in the page)
// Horizontal overflow: the document, and any scroll container outside a designated
// `[data-scroll-x]` region whose content is wider than its box.
function pageOverflow() {
  const out = []
  const vw = window.innerWidth
  const de = document.documentElement
  if (de.scrollWidth > vw + 1) out.push(`page scrolls sideways (${de.scrollWidth}px > ${vw}px)`)
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('[data-scroll-x]')) continue
    const cs = getComputedStyle(el)
    if (!/(auto|scroll)/.test(cs.overflowX)) continue
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
      out.push(`${describe(el)} scrolls sideways (${el.scrollWidth}px in ${el.clientWidth}px)`)
    }
  }
  return out
  function describe(el) {
    const label = el.getAttribute('aria-label') || el.getAttribute('role') || ''
    return `<${el.tagName.toLowerCase()}${label ? ` "${label}"` : ''}${el.className && typeof el.className === 'string' ? ` .${el.className.split(' ').slice(0, 3).join('.')}` : ''}>`
  }
}

// Touch targets inside `root` (default: the whole page) that are visible in the viewport.
function smallTargets([rootSel, min]) {
  const root = rootSel ? document.querySelector(rootSel) : document.body
  if (!root) return []
  const vw = window.innerWidth, vh = window.innerHeight
  const out = []
  const sel = 'a[href], button, [role="button"], input:not([type="hidden"]), select, textarea, summary, [role="option"], [role="menuitem"], [role="tab"], [role="checkbox"], [role="switch"]'
  const seen = new Set()
  for (const el of root.querySelectorAll(sel)) {
    if (el.closest('[data-touch-exempt], [aria-hidden="true"], [inert]')) continue
    if (el.closest('[role="option"]') && el.getAttribute('role') !== 'option') continue
    let box = el
    const type = el.getAttribute('type')
    if (el.tagName === 'INPUT' && (type === 'checkbox' || type === 'radio')) box = el.closest('label') ?? el
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none') continue
    // Inline text links inside running text are exempt (WCAG 2.5.8 inline exception).
    if (el.tagName === 'A' && cs.display === 'inline') continue
    const r = box.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    if (r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) continue
    // Clipped away by a scrolling ancestor (offscreen in a scroll region).
    let clipped = false
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const acs = getComputedStyle(a)
      if (/(auto|scroll|hidden|clip)/.test(acs.overflowX + acs.overflowY)) {
        const ar = a.getBoundingClientRect()
        if (r.right <= ar.left || r.left >= ar.right || r.bottom <= ar.top || r.top >= ar.bottom) { clipped = true; break }
      }
    }
    if (clipped) continue
    let opacity = 1
    for (let a = el; a && a !== document.body; a = a.parentElement) opacity *= Number(getComputedStyle(a).opacity)
    const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.getAttribute('name') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40)
    const key = `${el.tagName}:${name}`
    if (seen.has(key)) continue
    if (opacity < 0.05) { seen.add(key); out.push(`"${name}" (${el.tagName.toLowerCase()}) is invisible until hovered`); continue }
    if (r.width + 0.5 < min || r.height + 0.5 < min) { seen.add(key); out.push(`"${name}" (${el.tagName.toLowerCase()}) is ${Math.round(r.width)}×${Math.round(r.height)}px`) }
  }
  return out
}

// Overlay geometry: inside the viewport, close control inside and hit-testable.
function overlayGeometry(el) {
  const vw = window.innerWidth, vh = window.innerHeight
  const r = el.getBoundingClientRect()
  const out = { problems: [], hasClose: false }
  // A scrolling dialog overlay may be taller than the screen: then the panel scrolls
  // inside the fixed overlay; only the horizontal extent and the top must fit.
  const scrolls = (() => { for (let a = el; a; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.position === 'fixed') return /(auto|scroll)/.test(cs.overflowY) && a.scrollHeight > a.clientHeight; } return false })()
  if (r.left < -1 || r.right > vw + 1) out.problems.push(`overlay is outside the viewport horizontally (left ${Math.round(r.left)}, right ${Math.round(r.right)}, viewport ${vw})`)
  if (r.top < -1 || (!scrolls && r.bottom > vh + 1)) out.problems.push(`overlay is outside the viewport vertically (top ${Math.round(r.top)}, bottom ${Math.round(r.bottom)}, viewport ${vh})`)
  const close = el.querySelector('[data-overlay-close]') ?? el.querySelector('button[aria-label="Close"]')
  if (close) {
    out.hasClose = true
    const c = close.getBoundingClientRect()
    if (c.left < 0 || c.right > vw || c.top < 0 || c.bottom > vh) out.problems.push(`close control is outside the viewport (${Math.round(c.left)},${Math.round(c.top)} ${Math.round(c.width)}×${Math.round(c.height)})`)
    else {
      const hit = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2)
      if (!hit || !close.contains(hit)) out.problems.push(`close control is covered by ${hit ? hit.tagName.toLowerCase() + (hit.getAttribute('aria-label') ? ` "${hit.getAttribute('aria-label')}"` : '') : 'nothing'}`)
    }
  }
  return out
}

// ------------------------------------------------------------------ runner
async function runCombo(engine, width, theme, ids) {
  const tag = `${engine} ${width}px ${theme}`
  const launcher = pw[engine]
  const exe = engine === 'chromium' ? process.env.CHROMIUM_PATH : engine === 'webkit' ? process.env.WEBKIT_PATH : undefined
  const browser = await launcher.launch(exe ? { executablePath: exe } : {})
  // bypassCSP lets the check inject axe-core into the app's strict Content-Security-Policy.
  const ctxOpts = { viewport: { width, height: HEIGHTS[width] ?? 900 }, colorScheme: theme, hasTouch: true, isMobile: true, deviceScaleFactor: 1, locale: 'en-GB', timezoneId: 'UTC', bypassCSP: true }
  const fail = async (page, screen, overlay, msg) => {
    const name = `${engine}-${width}-${theme}-${screen}${overlay ? '-' + overlay : ''}`.replace(/[^a-z0-9-]/gi, '_')
    failures.push(`${screen}${overlay ? ' › ' + overlay : ''} [${tag}]: ${msg}`)
    if (page) await page.screenshot({ path: `${outDir}/${name}.png` }).catch(() => {})
  }
  const shot = async (page, screen, overlay) => {
    if (!SHOTS_ALL) return
    await page.screenshot({ path: `${outDir}/ok-${engine}-${width}-${theme}-${screen}${overlay ? '-' + overlay : ''}.png` }).catch(() => {})
  }
  let checked = 0
  try {
    const anonCtx = await browser.newContext(ctxOpts)
    const ctx = await browser.newContext({ ...ctxOpts, storageState: ids.storageState })
    const page = await ctx.newPage()
    page.on('dialog', (d) => d.dismiss())
    const pageErrors = []
    // WebKit reports fetches cut off by a navigation as errors; those are not app bugs.
    page.on('pageerror', (e) => { if (!/access control checks|Load failed|The network connection was lost|cancelled/i.test(e.message)) pageErrors.push(e.message) })
    await page.goto(base + '/inbox')
    await page.locator('[data-task-id]').first().waitFor({ timeout: 30000 })
    for (const s of screens(ids)) {
      if (ONLY && !ONLY.has(s.name)) continue
      const p = s.anon ? await anonCtx.newPage() : page
      // A screen that does not load is retried once (a slow CI machine); the second
      // failure is reported with whether the session was still valid.
      const visit = () => load().catch(async () => load().catch(async (e) => {
        const st = s.anon ? null : await ctx.request.get(base + '/api/v1/auth/status').then((r) => r.json()).catch(() => null)
        throw new Error(`${e.message.split('\n')[0]}${st && !st.authenticated ? ' (the session was signed out)' : ''}`)
      }))
      const load = async () => {
        await p.goto(base + s.path)
        await s.ready(p)
        if (s.board) {
          await p.getByRole('group', { name: 'Project layout' }).getByRole('button', { name: 'Board' }).click()
          await p.waitForTimeout(300)
        }
        await p.waitForTimeout(250)
      }
      try {
        await visit()
      } catch (e) {
        await fail(p, s.name, null, `screen did not load: ${e.message.split('\n')[0]}`)
        continue
      }
      checked++
      for (const m of await p.evaluate(pageOverflow)) await fail(p, s.name, null, m)
      for (const m of await p.evaluate(smallTargets, [null, MIN_TARGET])) await fail(p, s.name, null, `touch target: ${m}`)
      // Accessibility of the whole screen (axe-core, serious and critical issues).
      for (const m of await axeProblems(p)) await fail(p, s.name, null, m)
      if (s.offline && engine === 'chromium') {
        // Help ships with the app: offline, another guide still opens from the precache.
        await ctx.setOffline(true)
        try {
          await p.goto(base + s.offline)
          await p.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 10000 })
          await p.getByLabel('Search help').fill('board')
          await p.locator('[data-help-result]').first().waitFor({ timeout: 5000 })
        } catch (e) {
          await fail(p, s.name, null, `help does not work offline: ${e.message.split('\n')[0]}`)
        } finally {
          await ctx.setOffline(false)
        }
      }
      await shot(p, s.name)
      for (const o of s.overlays ?? []) {
        try {
          await visit()
          const res = await OVERLAYS[o](p, { width })
          if (!res) continue
          checked++
          // Accessibility of the overlay itself (the screen behind it was checked above).
          await res.overlay.waitFor({ state: 'visible', timeout: 5000 })
          await p.waitForTimeout(250)
          await res.overlay.evaluate((el) => el.setAttribute('data-axe-target', ''))
          for (const m of await axeProblems(p, '[data-axe-target]')) await fail(p, s.name, o, m)
          await res.overlay.evaluate((el) => el.removeAttribute('data-axe-target')).catch(() => {})
          await checkOverlay(p, s.name, o, res, fail, shot)
          if (res.after) await res.after().catch(() => {})
        } catch (e) {
          await fail(p, s.name, o, `could not be checked: ${e.message.split('\n')[0]}`)
        }
      }
      if (s.board) {
        await p.getByRole('group', { name: 'Project layout' }).getByRole('button', { name: 'List' }).click().catch(() => {})
      }
      if (s.anon) await p.close()
    }
    for (const e of pageErrors) failures.push(`page error [${tag}]: ${e}`)
  } catch (e) {
    failures.push(`[${tag}] aborted: ${e.message.split('\n')[0]}`)
  } finally {
    await browser.close()
  }
  log(`  ${tag}: ${checked} screens and overlays checked`)
}

async function checkOverlay(p, screen, name, { overlay, trigger, kind, destructive }, fail, shot) {
  await overlay.waitFor({ state: 'visible', timeout: 5000 })
  await p.waitForTimeout(250)
  const handle = await overlay.elementHandle()
  const geo = await p.evaluate(overlayGeometry, handle)
  for (const m of geo.problems) await fail(p, screen, name, m)
  for (const m of await p.evaluate(pageOverflow)) await fail(p, screen, name, m)
  const tagged = await overlay.evaluate((el) => (el.hasAttribute('data-overlay') ? el : el.closest('[data-overlay]')) ? true : false)
  const sel = await overlay.evaluate((el) => { el.setAttribute('data-layout-check', ''); return '[data-layout-check]' })
  for (const m of await p.evaluate(smallTargets, [sel, MIN_TARGET])) await fail(p, screen, name, `touch target: ${m}`)
  await overlay.evaluate((el) => el.removeAttribute('data-layout-check'))
  await shot(p, screen, name)
  if (kind === 'toast' || kind === 'inline' || kind === 'drawer' || kind === 'combobox') {
    if (kind === 'combobox') {
      await p.keyboard.press('Escape')
      if (await overlay.isVisible()) await fail(p, screen, name, 'does not close with Escape')
    }
    if (kind === 'drawer') {
      await p.mouse.click(p.viewportSize().width - 10, p.viewportSize().height / 2)
      await p.waitForTimeout(350)
      const box = await overlay.boundingBox()
      if (box && box.x + box.width > 1) await fail(p, screen, name, 'drawer does not close with a tap outside')
    }
    return
  }
  if (!tagged && kind !== 'panel') await fail(p, screen, name, 'is not built on the overlay module (no data-overlay)')
  // Scrolling inside a modal overlay leaves the page behind where it was.
  if (kind === 'popover' || kind === 'dialog') {
    const scrollers = () => [...document.querySelectorAll('main .overflow-y-auto')].map((e) => e.scrollTop).join(',')
    const box = await overlay.boundingBox()
    const before = await p.evaluate(scrollers)
    const wheeled = box && await p.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height - 5, 60)).then(() => p.mouse.wheel(0, 600)).then(() => true, () => false)
    if (wheeled) {
      await p.waitForTimeout(200)
      if ((await p.evaluate(scrollers)) !== before) await fail(p, screen, name, 'the page behind scrolls while the overlay is open')
    }
  }
  // Escape closes, focus returns to the trigger.
  await p.keyboard.press('Escape')
  await p.waitForTimeout(150)
  if (await overlay.isVisible().catch(() => false)) await fail(p, screen, name, 'does not close with Escape')
  else if (trigger) {
    const back = await trigger.evaluate((el) => el === document.activeElement || el.contains(document.activeElement)).catch(() => false)
    if (!back) await fail(p, screen, name, 'focus does not return to the trigger after Escape')
  }
  if (!trigger) return
  // Close button (dialogs, sheets) or tap outside (anchored popovers).
  await trigger.click()
  await overlay.waitFor({ state: 'visible', timeout: 5000 })
  if (geo.hasClose) {
    await overlay.locator('[data-overlay-close], button[aria-label="Close"]').first().click()
    await p.waitForTimeout(150)
    if (await overlay.isVisible().catch(() => false)) { await fail(p, screen, name, 'does not close with its close button'); await p.keyboard.press('Escape') }
  } else if (kind === 'dialog') {
    await fail(p, screen, name, 'dialog has no close button')
    await p.keyboard.press('Escape')
  }
  if (kind === 'popover' || (kind === 'dialog' && !destructive)) {
    if (!(await overlay.isVisible().catch(() => false))) {
      await trigger.click()
      await overlay.waitFor({ state: 'visible', timeout: 5000 })
    }
    const vs = p.viewportSize()
    const box = await overlay.boundingBox()
    // A full-screen sheet has no outside to tap.
    if (box && box.x <= 1 && box.width >= vs.width - 1 && box.y <= 1) { await p.keyboard.press('Escape'); return }
    // A point outside the panel: above a bottom sheet, else a top corner.
    const pt = box && box.y > 40 ? { x: vs.width / 2, y: Math.max(5, box.y / 2) } : { x: 5, y: vs.height - 5 }
    await p.mouse.click(pt.x, pt.y)
    await p.waitForTimeout(200)
    if (await overlay.isVisible().catch(() => false)) { await fail(p, screen, name, 'does not close with a tap outside'); await p.keyboard.press('Escape') }
  }
}

// ------------------------------------------------------------------ main
log('· seeding', base)
const ids = await seed()
const llmServer = ids.llm
const combos = []
for (const e of ENGINES) for (const w of WIDTHS) for (const t of THEMES) combos.push([e, w, t])
log(`· checking ${combos.length} combinations (${ENGINES.join(', ')} × ${WIDTHS.join('/')} px × ${THEMES.join('/')})`)
const queue = [...combos]
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
  while (queue.length) { const [e, w, t] = queue.shift(); await runCombo(e, w, t, ids) }
}))
llmServer?.close()
writeFileSync(`${outDir}/failures.txt`, failures.join('\n') + '\n')
if (failures.length) {
  log(`\n✗ ${failures.length} layout problems (screenshots in ${outDir}/):`)
  for (const f of failures) log('  -', f)
  process.exit(1)
}
log('\nLAYOUT OK')
