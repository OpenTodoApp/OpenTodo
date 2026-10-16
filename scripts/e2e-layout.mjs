// Layout check (OpenSpec change `mobile-layout`): opens every screen and every
// overlay at phone and tablet widths, in light and dark, in Chromium and WebKit,
// and fails when
//   - a page scrolls sideways outside a designated scroll region (`data-scroll-x`),
//   - more than three regions scroll vertically outside designated ones (`data-scroll-y`),
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
// CHROMIUM_PATH / WEBKIT_PATH (optional executables), OPENTODO_LANG (an interface
// language such as de: the synced preference is written before capturing, and
// signed-out screens start in it too; OpenSpec change app-localization 11.1).
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
const HEIGHTS = { 320: 640, 360: 740, 390: 844, 768: 1024, 1280: 900 }
const WIDTHS = (process.env.WIDTHS ?? '360,390,768').split(',').map(Number)
const THEMES = (process.env.THEMES ?? 'light,dark').split(',')
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 3)
const SHOTS_ALL = process.env.SHOTS === 'all'
const LANG = process.env.OPENTODO_LANG ?? ''
const PASSWORD = 'correct horse battery staple'
const MIN_TARGET = 44
mkdirSync(outDir, { recursive: true })

const failures = []
const log = (...a) => console.log(...a)
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// ------------------------------------------------------------------ seed
// A 2×2 grey PNG for image attachments and shared files.
const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGOYs3g9EDFAKAA1yge5YXhuBgAAAABJRU5ErkJggg=='
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
  // A pending project invite link (project-invite-links): its acceptance screen is
  // checked signed out and signed in, and the share dialog lists it.
  const { link: projectLink } = await A('POST', `/api/v1/projects/${home.id}/invites`, { role: 'editor', email: 'dora@example.com' })
  const { link: publicLink } = await A('POST', `/api/v1/projects/${home.id}/public-links`, { rights: 'tick', name: 'Family chat' })
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
  // Waits for the quotes (task-dependencies): dimmed in the project, in Today's Blocked group.
  await T({ title: 'Book the kitchen fitters', project_id: home.id, section_id: sections.Waiting, due: { date: today }, blocked_by: [quotes.id] })
  await T({ title: 'Call the plumber', project_id: home.id, section_id: sections.Waiting, assignee_id: bob.id })
  await T({ title: 'Plan the team offsite', project_id: work.id, due: { date: today, time: '14:00' }, estimate_minutes: 90 })
  await T({ title: 'Submit expense report', project_id: work.id, completed_at: Date.now() - 3600e3 })
  // Five custom fields on Work (custom-fields): the columns layout at 768 px.
  const F = {}
  for (const [i, [name, type, options]] of [['Cost', 'number'], ['Client', 'choice', 'Acme\nGlobex'], ['Order date', 'date'], ['Quote', 'link'], ['Paid', 'checkbox']].entries()) {
    F[name] = (await A('POST', '/api/v1/fields', { name, type, project_id: work.id, options: options ?? '', position: i + 1 })).id
  }
  const offsite = (await A('GET', '/api/v1/tasks')).tasks.find((t) => t.title === 'Plan the team offsite')
  await A('PATCH', `/api/v1/tasks/${offsite.id}`, { fields: { [F.Cost]: 12500, [F.Client]: 'Acme', [F['Order date']]: today, [F.Quote]: LONG_URL, [F.Paid]: true } })
  // A reminder that is already due: its toast shows on every screen.
  const passport = (await A('GET', '/api/v1/tasks')).tasks.find((t) => t.title === 'Renew passport')
  await A('POST', '/api/v1/reminders', { task_id: passport.id, kind: 'absolute', fire_at: Date.now() - 60e3 })
  const trashed = await T({ title: 'Old shopping list' })
  await A('DELETE', `/api/v1/tasks/${trashed.id}`)

  // Notifications for Ada: a mention and an assignment from Bob.
  const bobComment = await B('POST', `/api/v1/tasks/${quotes.id}/comments`, { body: `@Ada can you check ${LONG_URL} before Thursday? It has the supplier's full price list.`, mentions: [me.id] })
  // Attachments (OpenSpec attachments): files and a link on the passport task (the
  // task panel overlay), and a file on Bob's comment (the comments tab).
  const upload = (c) => async (taskId, name, mimeType, body, extra = {}) => {
    const r = await c.request.fetch(`${base}/api/v1/tasks/${taskId}/attachments`, { method: 'POST', headers: { Origin: base }, multipart: { file: { name, mimeType, buffer: Buffer.from(body) }, ...extra } })
    if (!r.ok()) throw new Error(`upload ${name} → ${r.status()} ${await r.text()}`)
  }
  const passportTask = (await A('GET', '/api/v1/tasks')).tasks.find((t) => t.title === 'Renew passport')
  await upload(ctx)(passportTask.id, 'Passport application form with a long file name that has to truncate.pdf', 'application/pdf', '%PDF-1.4 layout check')
  await upload(ctx)(passportTask.id, 'photo.png', 'image/png', Buffer.from(TINY_PNG, 'base64'))
  await A('POST', `/api/v1/tasks/${passportTask.id}/attachments`, { url: LONG_URL, name: 'Appointment booking' })
  await upload(bctx)(quotes.id, 'price-list.pdf', 'application/pdf', '%PDF-1.4 prices', { comment_id: bobComment.id })
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
  // Member keys allowed, so Settings → AI shows "Which assistant you use" and
  // the owner's cap switch (assistant-member-provider); Ada stays on the server's.
  await A('PUT', '/api/v1/settings/assistant', { enabled: true, default_provider: 'compatible', allow_private_endpoint: true, allow_member_keys: true,
    providers: { compatible: { enabled: true, model: 'fake-model', base_url: `http://127.0.0.1:${llm.address().port}/v1` } } })
  await A('PUT', '/api/v1/me/assistant', { consent: true, provider: 'compatible' })
  await A('POST', '/api/v1/tasks', { title: 'Water the plants', due: { date: new Date(Date.now() - 2 * 86400e3).toISOString().slice(0, 10) } })
  if (LANG) {
    // The interface language is a synced preference (user_prefs.language); written
    // like any device would, so every screen of the run opens in it.
    await A('POST', '/api/v1/sync', { device: 'layout-check', cursor: 0, ops: [{ id: `lang-${Date.now()}`, entity: 'user_prefs', entityId: 'me', field: 'language', value: LANG, ts: Date.now(), device: 'layout-check' }] })
  }
  // One session for every browser context: logging in per context trips the rate limit.
  const storageState = await ctx.storageState()
  await browser.close()
  return { storageState, projectInvite: projectLink.split('/invite/p/')[1], publicLink: publicLink.split('/public/')[1], home: home.id, work: work.id, view: v1.id, dashboard: dash.id, label: L.errand, quotes: quotes.id, llm }
}

// ------------------------------------------------------------------ screens
// `overlays` names openers from OVERLAYS below; each runs on the screen it is listed for.
function screens(ids) {
  const row = (title) => (p) => p.locator('[data-task-id]').filter({ hasText: title }).first().waitFor()
  const heading = (name) => (p) => p.getByRole('heading', { name, level: 1 }).first().waitFor()
  return [
    { name: 'sign-in', path: '/', anon: true, ready: (p) => p.getByRole('button', { name: 'Sign in', exact: true }).waitFor() },
    // Project invite link (project-invite-links): a visitor's choice, and the creator, who is a member already.
    { name: 'project-invite', path: `/invite/p/${ids.projectInvite}`, anon: true, ready: (p) => p.getByRole('button', { name: /sign in to join/ }).waitFor() },
    { name: 'public-list', path: `/public/${ids.publicLink}`, anon: true, ready: (p) => p.locator('[data-public-task]').first().waitFor() },
    { name: 'project-invite-member', path: `/invite/p/${ids.projectInvite}`, ready: heading(/already a member/) },
    { name: 'inbox', path: '/inbox', ready: row('Renew passport'), overlays: ['notifications', 'command-palette', 'help', 'sidebar', 'sidebar-view-menu', 'task-detail', 'label-picker', 'bulk-actions-menu', 'bulk-review', 'bulk-toast', 'reminder-toast', 'assistant', 'assistant-review', 'template-dialog'] },
    { name: 'today', path: '/today', ready: row('Renew passport') },
    // Display mode (display-mode 3.4, 5.1): no shell, large type; high contrast and the largest size included.
    { name: 'display-today', path: '/display/today', ready: (p) => p.locator('[data-screen="display"] [data-display-row]').first().waitFor() },
    { name: 'display-today-high-xl', path: '/display/today?contrast=high&size=xl', ready: (p) => p.locator('[data-screen="display"] [data-display-row]').first().waitFor() },
    { name: 'display-upcoming', path: '/display/upcoming?eink=1', ready: (p) => p.locator('[data-screen="display"] [data-display-columns]').waitFor() },
    { name: 'display-project', path: `/display/project/${ids.home}?size=xl`, ready: (p) => p.locator('[data-screen="display"] [data-display-row]').first().waitFor() },
    { name: 'display-view', path: `/display/view/${ids.view}?contrast=high`, ready: (p) => p.locator('[data-screen="display"] h1').waitFor() },
    { name: 'public-display', path: `/public/${ids.publicLink}?display=1&eink=1`, anon: true, ready: (p) => p.locator('[data-screen="public/display"] [data-display-row]').first().waitFor() },
    { name: 'triage', path: '/triage', ready: (p) => p.locator('[data-triage-card]').waitFor() },
    { name: 'upcoming', path: '/upcoming', ready: heading('Upcoming') },
    { name: 'assigned', path: '/assigned', ready: row('Pick paint colours') },
    { name: 'day', path: '/day', ready: (p) => p.locator('[data-now-line], main').first().waitFor() },
    { name: 'week', path: '/week', ready: (p) => p.locator('main').first().waitFor() },
    { name: 'month', path: '/month', ready: (p) => p.locator('[data-month-grid]').waitFor() },
    { name: 'completed', path: '/completed', ready: row('Submit expense report') },
    { name: 'filter', path: '/filter', ready: (p) => p.getByLabel('Filter query').waitFor() },
    { name: 'ask', path: '/ask', ready: heading('Ask OpenTodo') },
    { name: 'trash', path: '/trash', ready: (p) => p.getByText('Old shopping list').first().waitFor() },
    { name: 'updates', path: '/updates', ready: heading('Updates') },
    // The old address still opens Updates (ux-overhaul vocabulary).
    { name: 'activity-redirect', path: '/activity', ready: heading('Updates') },
    { name: 'project', path: `/project/${ids.home}`, ready: row('Pick paint colours'), overlays: ['project-menu', 'project-move-picker', 'section-menu', 'share', 'share-invite-link', 'mention-picker', 'assignee-picker', 'help-panel', 'project-picker', 'parent-picker', 'section-picker', 'zone-control', 'task-history', 'blocked-by-picker', 'duplicate-project', 'save-template'] },
    { name: 'board', path: `/project/${ids.home}`, ready: row('Pick paint colours'), layout: 'Board' },
    { name: 'timeline', path: `/project/${ids.home}`, ready: row('Pick paint colours'), layout: 'Timeline' },
    // Custom fields (custom-fields): five columns at 768 px; below it the layout is not offered.
    { name: 'columns', path: `/project/${ids.work}`, widths: [768, 1280], overlays: ['fields-dialog'], ready: async (p) => {
      await row('Plan the team offsite')(p)
      const toggle = p.locator('[data-columns-toggle]')
      if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click()
      await p.getByRole('table', { name: 'Tasks and fields' }).waitFor()
    } },
    { name: 'saved-view', path: `/view/${ids.view}`, ready: heading(/Deep work/), overlays: ['view-header-menu'] },
    { name: 'dashboard', path: `/view/${ids.dashboard}`, ready: heading(/Weekly review/) },
    { name: 'label', path: `/label/${ids.label}`, ready: row('Renew passport') },
    { name: 'labels', path: '/labels', ready: heading('Labels'), overlays: ['label-menu', 'label-edit', 'label-merge-picker', 'confirm-dialog', 'new-label'] },
    { name: 'views', path: '/views', ready: heading('Filters'), overlays: ['view-menu', 'rename-view', 'new-dashboard'] },
    // Settings (settings-navigation): the overview and every section, each overlay on
    // the section that holds its control (the owner sees all of them).
    // From 1024 px /settings opens the first section (settings-navigation), so the page title reads Account there.
    { name: 'settings', path: '/settings', ready: (p) => p.getByRole('heading', { name: /^(Settings|Account)$/, level: 1 }).first().waitFor(), overlays: ['notifications'] },
    ...[
      ['account', 'Account'], ['appearance', 'Appearance'],
      ['general', 'General'], ['notifications', 'Notifications'], ['capture', 'Capture', ['voice-consent']],
      ['integrations', 'Integrations'], ['data', 'Data'],
      ['people', 'People', ['delete-user']], ['server', 'Server'],
    ].map(([id, title, overlays]) => ({ name: `settings-${id}`, path: `/settings/${id}`, ready: heading(title), ...(overlays ? { overlays } : {}) })),
    // A legacy address opens its section in place (settings-navigation "Legacy settings addresses").
    { name: 'settings-legacy', path: '/settings/security', ready: heading('Account') },
    { name: 'import', path: '/settings/import', ready: heading(/Import/) },
    // The capture screen with shared files (attachments D9): the service worker's
    // hand-over store is filled in the page, then /share?inbox=<id> opens. Chromium
    // only: WebKit's throwaway contexts are private sessions, which cannot store
    // Blobs in IndexedDB (and Safari has no share target to receive files anyway).
    { name: 'share-files', path: '/inbox', engines: ['chromium'], ready: async (p) => {
      await p.locator('[data-task-id]').first().waitFor()
      const id = await p.evaluate(async (png) => {
        const db = await new Promise((resolve, reject) => {
          const r = indexedDB.open('opentodo-share', 1)
          r.onupgradeneeded = () => r.result.createObjectStore('inbox', { keyPath: 'id' })
          r.onsuccess = () => resolve(r.result)
          r.onerror = () => reject(r.error)
        })
        const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0))
        const entry = { id: crypto.randomUUID(), createdAt: Date.now(), title: 'Receipt from the hardware store', text: '', url: '', files: [
          { name: 'IMG_20261015_143012_receipt_with_a_long_camera_name.png', type: 'image/png', blob: new Blob([bytes], { type: 'image/png' }) },
          { name: 'warranty.pdf', type: 'application/pdf', blob: new Blob(['%PDF-1.4'], { type: 'application/pdf' }) },
        ] }
        await new Promise((resolve, reject) => {
          const tx = db.transaction('inbox', 'readwrite')
          tx.objectStore('inbox').put(entry)
          tx.oncomplete = resolve
          tx.onerror = () => reject(tx.error)
        })
        return entry.id
      }, TINY_PNG)
      await p.goto(`${base}/share?inbox=${id}`)
      await p.locator('[data-shared-file]').first().waitFor()
    } },
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

async function tickTwo(p) {
  await p.locator('main').click({ position: { x: 5, y: 5 } }).catch(() => {})
  await p.keyboard.press('j')
  await p.keyboard.press('x')
  await p.keyboard.press('Shift+ArrowDown')
  await p.locator('[data-selection-bar]').waitFor()
}

/** Opens a task panel property's editor: its chip when shown, else Add › `label`. Returns the property's element. */
async function openProperty(p, field, label) {
  const panel = p.locator('aside[data-detail-for]')
  await panel.waitFor()
  const row = panel.locator(`[data-property="${field}"]`)
  const chip = row.locator('button[aria-labelledby]').first()
  // The chips settle after the panel's live queries (sections, parent) resolve.
  await panel.locator('[data-property-chips]').waitFor()
  const shown = await chip.waitFor({ state: 'visible', timeout: 2000 }).then(() => true, () => false)
  if (shown) {
    await chip.scrollIntoViewIfNeeded()
    await chip.click()
  } else {
    const add = panel.getByRole('button', { name: 'Add a property' })
    await add.scrollIntoViewIfNeeded()
    await add.click()
    await p.getByRole('menuitem', { name: label }).click()
  }
  await row.locator('[data-property-editor]').waitFor()
  return row
}

const OVERLAYS = {
  async notifications(p, ctx) {
    // The bell lives in the sidebar footer (app-shell "No desktop top bar"): the drawer below 768 px.
    if (ctx.width < 768) await openSidebar(p)
    const trigger = p.locator('[data-notifications]')
    await trigger.click()
    return { overlay: p.getByRole('dialog', { name: 'Notifications' }), trigger, kind: 'popover' }
  },
  // Search and commands (search-and-command-palette 1.3), from the header button.
  async 'command-palette'(p, ctx) {
    if (ctx.width < 768) await openSidebar(p)
    const trigger = p.locator('[data-palette-button]')
    await trigger.click()
    const overlay = p.getByRole('dialog', { name: 'Search and commands' })
    await overlay.getByRole('option').first().waitFor()
    return { overlay, trigger, kind: 'dialog' }
  },
  async help(p, ctx) {
    if (ctx.width < 768) await openSidebar(p)
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
  // Bulk actions (bulk-edit 6.2): two rows ticked from the keyboard.
  async 'bulk-actions-menu'(p) {
    await tickTwo(p)
    const trigger = p.getByRole('button', { name: /^Actions for 2 tasks/ })
    await trigger.click()
    return { overlay: overlayLoc(p), trigger, kind: 'popover' }
  },
  async 'bulk-review'(p) {
    await tickTwo(p)
    await p.getByRole('button', { name: /^Actions for 2 tasks/ }).click()
    await p.getByRole('menuitem', { name: 'Move to project' }).click()
    await p.locator('[data-picker-step] [role="option"]').filter({ hasNotText: 'Inbox' }).first().click()
    const overlay = p.getByRole('dialog', { name: /^Move 2 tasks to/ })
    await overlay.locator('[data-assistant-apply]').waitFor()
    return { overlay, kind: 'dialog' }
  },
  async 'bulk-toast'(p) {
    await tickTwo(p)
    // Priority 4 is the seeded default: the toast shows without changing the data.
    await p.keyboard.press('4')
    const overlay = p.locator('[data-bulk-toast]')
    await overlay.waitFor()
    return { overlay, kind: 'toast' }
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
  // Project templates: the project menu's dialogs and the sidebar's From a template.
  ...Object.fromEntries([['duplicate-project', 'Duplicate…'], ['save-template', 'Save as template…']].map(([name, item]) => [name, async (p) => {
    await p.getByRole('button', { name: /^Project/ }).first().click()
    await p.getByRole('menuitem', { name: item }).click()
    return { overlay: p.locator(`[data-testid="${name}"]`), kind: 'dialog' }
  }])),
  // Custom fields (custom-fields): the project menu's Fields… dialog.
  async 'fields-dialog'(p) {
    await p.getByRole('button', { name: /^Project/ }).first().click()
    await p.getByRole('menuitem', { name: 'Fields…' }).click()
    return { overlay: p.locator('[data-testid="fields-dialog"]'), kind: 'dialog' }
  },
  async 'template-dialog'(p) {
    await openSidebar(p)
    await p.locator('aside[data-sidebar]').getByRole('button', { name: 'New project' }).click()
    await p.getByRole('menuitem', { name: 'From a template…' }).click()
    return { overlay: p.locator('[data-testid="template-dialog"]'), kind: 'dialog' }
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
  // The share dialog with the "Invite with a link" form open (project-invite-links).
  async 'share-invite-link'(p) {
    const trigger = p.getByRole('button', { name: /^Share/ }).first()
    await trigger.click()
    const dialog = p.getByRole('dialog', { name: /^Share/ })
    await dialog.getByRole('button', { name: 'Create a link…' }).click()
    await dialog.getByRole('button', { name: 'Create link' }).waitFor()
    return { overlay: dialog, trigger, kind: 'dialog' }
  },
  // Blocked by (task-dependencies, ux-overhaul chips): the chip when set, else Add › Blocked by.
  async 'blocked-by-picker'(p) {
    await p.locator('[data-task-id]').filter({ hasText: 'Pick paint colours' }).first().getByRole('button').nth(1).click()
    const row = await openProperty(p, 'blocked-by', 'Blocked by')
    await row.getByRole('combobox').first().waitFor()
    return { overlay: row, kind: 'inline', after: async () => p.keyboard.press('Escape') }
  },
  async 'mention-picker'(p) {
    await p.locator('[data-task-id]').filter({ hasText: 'Get three quotes' }).first().getByRole('button').nth(1).click()
    const comments = p.locator('aside[data-detail-for]').getByRole('tab', { name: /^Comments/ })
    await comments.evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await comments.click()
    const box = p.locator('aside[data-detail-for]').getByLabel('Write a comment')
    // The composer sits at the end of the Comments tab, where the reminder toast can
    // cover it on a phone; focus it as a keyboard user would.
    await box.focus()
    await box.pressSequentially('@B')
    return { overlay: p.getByRole('listbox', { name: 'Mention a member' }), kind: 'combobox', after: async () => { await box.fill(''); await p.keyboard.press('Escape'); await p.keyboard.press('Escape') } }
  },
  // Task panel (ux-overhaul "Task panel layout"): a property's picker opens inline under its
  // chip; a property without a value has no chip yet and is reached through Add.
  ...Object.fromEntries([['project', 'Project'], ['parent', 'Parent task'], ['section', 'Section']].map(([field, label]) => [`${field}-picker`, async (p) => {
    await p.locator('[data-task-id]').filter({ hasText: 'Get three quotes' }).first().getByRole('button').nth(1).click()
    const row = await openProperty(p, field, label)
    await row.getByRole('combobox').first().waitFor()
    return { overlay: row, kind: 'inline', after: async () => p.keyboard.press('Escape') }
  }])),
  async 'zone-control'(p) {
    await p.locator('[data-task-id]').filter({ hasText: 'Get three quotes' }).first().getByRole('button').nth(1).click()
    const trigger = p.locator('aside[data-detail-for]').getByRole('button', { name: /^Time zone:/ }).first()
    await trigger.scrollIntoViewIfNeeded()
    await trigger.click()
    return { overlay: p.getByRole('dialog', { name: 'Time zone' }), trigger, kind: 'popover' }
  },
  async 'task-history'(p) {
    await p.locator('[data-task-id]').filter({ hasText: 'Get three quotes' }).first().getByRole('button').nth(1).click()
    const panel = p.locator('aside[data-detail-for]')
    const tab = panel.getByRole('tab', { name: 'History' })
    await tab.evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await tab.click()
    const versions = panel.getByRole('list', { name: 'Versions' })
    await versions.waitFor({ timeout: 10000 })
    const first = versions.getByRole('button', { expanded: false }).first()
    await first.focus()
    await p.keyboard.press('Enter')
    // The first change of the expanded version (values and its Restore action) is the
    // part to check; a whole version can be taller than a phone screen.
    const change = panel.locator('[aria-label^="Changes:"] > li').first()
    await change.waitFor()
    await change.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    return { overlay: change, kind: 'inline', after: async () => panel.getByRole('tab', { name: /^Comments/ }).click() }
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
  // labels-and-menus: the edit panel, the merge picker step and a destructive confirmation.
  async 'label-edit'(p) {
    const trigger = p.locator('main').getByRole('button', { name: 'Menu for label errand' })
    await trigger.click()
    await overlayLoc(p).getByRole('menuitem', { name: 'Edit…' }).click()
    return { overlay: p.getByRole('dialog', { name: 'Edit label errand' }), kind: 'popover', after: async () => p.keyboard.press('Escape') }
  },
  async 'label-merge-picker'(p) {
    const trigger = p.locator('main').getByRole('button', { name: 'Menu for label errand' })
    await trigger.click()
    await overlayLoc(p).getByRole('menuitem', { name: 'Merge into…' }).click()
    await p.locator('[data-picker-step]').waitFor()
    // The first Escape goes back to the items, the second closes (spec: picker steps).
    return { overlay: overlayLoc(p), trigger, kind: 'popover', escapes: 2 }
  },
  async 'confirm-dialog'(p) {
    await p.locator('main').getByRole('button', { name: 'Menu for label errand' }).click()
    await overlayLoc(p).getByRole('menuitem', { name: 'Delete label…' }).click()
    return { overlay: p.getByRole('alertdialog', { name: /Delete label/ }), kind: 'dialog', after: async () => p.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click() }
  },
  async 'project-move-picker'(p) {
    await p.locator('main').click({ position: { x: 5, y: 5 } }).catch(() => {})
    await p.keyboard.press('m')
    await p.locator('[data-picker-step]').waitFor()
    return { overlay: overlayLoc(p), kind: 'popover', escapes: 2 }
  },
  async 'new-label'(p) {
    await p.locator('main').getByRole('button', { name: 'New label' }).first().click()
    return { overlay: p.locator('main form').first(), kind: 'inline', after: async () => p.keyboard.press('Escape') }
  },
  async 'view-menu'(p) {
    const trigger = p.locator('main').getByRole('button', { name: /^Menu for view/ }).first()
    await trigger.click()
    return { overlay: overlayLoc(p), trigger, kind: 'popover' }
  },
  async 'rename-view'(p) {
    await p.locator('main').getByRole('button', { name: /^Menu for view/ }).first().click()
    await overlayLoc(p).getByRole('menuitem', { name: 'Rename' }).click()
    return { overlay: p.getByRole('dialog', { name: 'Rename view' }), kind: 'dialog' }
  },
  async 'new-dashboard'(p) {
    const trigger = p.getByRole('button', { name: 'New board' })
    await trigger.click()
    return { overlay: p.getByRole('dialog', { name: 'New board' }), trigger, kind: 'dialog' }
  },
  async 'voice-consent'(p) {
    const box = p.getByRole('switch', { name: /Dictate tasks into quick add/ })
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
  async assistant(p, ctx) {
    if (ctx.width < 768) await openSidebar(p)
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
      out.push(`${describe(el)} scrolls sideways (${el.scrollWidth}px in ${el.clientWidth}px)${culprits(el)}`)
    }
  }
  return out
  // The descendants that stick out of a sideways-scrolling box (deepest first), so
  // a failure names the element to fix instead of only its scroll container.
  function culprits(box) {
    const right = box.getBoundingClientRect().right
    const wide = [...box.querySelectorAll('*')]
      .filter((c) => c.getBoundingClientRect().width > 0 && (c.getBoundingClientRect().right > right + 1 || c.scrollWidth > c.clientWidth + 1))
      .filter((c, _, all) => !all.some((o) => o !== c && c.contains(o)))
      .slice(0, 3)
    return wide.length ? `; widest: ${wide.map((c) => `${describe(c)} (${Math.round(c.getBoundingClientRect().width)}px, scroll ${c.scrollWidth}px)`).join(', ')}` : ''
  }
  function describe(el) {
    const label = el.getAttribute('aria-label') || el.getAttribute('role') || ''
    return `<${el.tagName.toLowerCase()}${label ? ` "${label}"` : ''}${el.className && typeof el.className === 'string' ? ` .${el.className.split(' ').slice(0, 3).join('.')}` : ''}>`
  }
}

// Vertical scroll regions (OpenSpec ux-overhaul, app-shell "Three columns, three
// scrollers"): at most the sidebar, the content column and the panel may scroll
// vertically; everything else scrolls inside them. Designated regions
// (`data-scroll-y`: board columns, the calendar grid) and anything off screen or
// inside an overlay are not counted.
function verticalScrollers() {
  const vw = window.innerWidth
  const out = []
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('[data-scroll-y], [data-overlay-root], [data-overlay]')) continue
    const cs = getComputedStyle(el)
    if (!/(auto|scroll)/.test(cs.overflowY) || cs.visibility === 'hidden') continue
    if (el.scrollHeight <= el.clientHeight + 1 || el.clientHeight === 0) continue
    const r = el.getBoundingClientRect()
    if (r.right <= 0 || r.left >= vw) continue
    const label = el.getAttribute('aria-label') || el.getAttribute('role') || ''
    out.push(`<${el.tagName.toLowerCase()}${label ? ` "${label}"` : ''}${typeof el.className === 'string' ? ` .${el.className.split(' ').slice(0, 3).join('.')}` : ''}> (${el.scrollHeight}px in ${el.clientHeight}px)`)
  }
  return out
}
const MAX_SCROLLERS = 3

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
    // First paint in the chosen language (the device mirror the app keeps), also signed out.
    if (LANG) for (const c of [anonCtx, ctx]) await c.addInitScript((code) => { try { localStorage.setItem('opentodo.lang', code) } catch { /* storage blocked */ } }, LANG)
    const page = await ctx.newPage()
    page.on('dialog', (d) => d.dismiss())
    const pageErrors = []
    // WebKit reports fetches cut off by a navigation as errors; those are not app bugs.
    page.on('pageerror', (e) => { if (!/access control checks|Load failed|The network connection was lost|cancelled/i.test(e.message)) pageErrors.push(e.message) })
    await page.goto(base + '/inbox')
    await page.locator('[data-task-id]').first().waitFor({ timeout: 30000 })
    for (const s of screens(ids)) {
      if (ONLY && !ONLY.has(s.name)) continue
      if (s.engines && !s.engines.includes(engine)) continue
      if (s.widths && !s.widths.includes(width)) continue
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
        if (s.layout) {
          await p.getByRole('group', { name: 'Project layout' }).getByRole('button', { name: s.layout }).click()
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
      const scrollers = await p.evaluate(verticalScrollers)
      if (scrollers.length > MAX_SCROLLERS) await fail(p, s.name, null, `${scrollers.length} vertical scroll regions (at most ${MAX_SCROLLERS}): ${scrollers.join(', ')}`)
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
        const checkOne = async () => {
          await visit()
          const res = await OVERLAYS[o](p, { width })
          if (!res) return
          checked++
          // Accessibility of the overlay itself (the screen behind it was checked above).
          await res.overlay.waitFor({ state: 'visible', timeout: 5000 })
          await p.waitForTimeout(250)
          await res.overlay.evaluate((el) => el.setAttribute('data-axe-target', ''))
          for (const m of await axeProblems(p, '[data-axe-target]')) await fail(p, s.name, o, m)
          await res.overlay.evaluate((el) => el.removeAttribute('data-axe-target')).catch(() => {})
          await checkOverlay(p, s.name, o, res, fail, shot)
          if (res.after) await res.after().catch(() => {})
        }
        // An overlay that does not open in time gets one more try, like a screen that does
        // not load (WebKit on a loaded runner); the second failure is the one reported.
        try {
          await checkOne()
        } catch {
          await p.keyboard.press('Escape').catch(() => {})
          try {
            await checkOne()
          } catch (e) {
            await fail(p, s.name, o, `could not be checked: ${e.message.split('\n')[0]}`)
          }
        }
      }
      if (s.layout) {
        await p.getByRole('group', { name: 'Project layout' }).getByRole('button', { name: s.layout === 'Columns' ? 'Columns' : 'List' }).click().catch(() => {})
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

async function checkOverlay(p, screen, name, { overlay, trigger, kind, destructive, escapes = 1 }, fail, shot) {
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
  // Escape closes (a picker step needs two: back, then close), focus returns to the trigger.
  for (let i = 0; i < escapes; i++) { await p.keyboard.press('Escape'); await p.waitForTimeout(150) }
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
    // A point outside the panel: above a bottom sheet, else a top corner. The
    // tap must not land on a control, or it would also press it (a chip or a
    // link under the point) and change the screen for the next overlay.
    const preferred = box && box.y > 40 ? { x: vs.width / 2, y: Math.max(5, box.y / 2) } : { x: 5, y: vs.height - 5 }
    const candidates = [preferred, { x: 5, y: vs.height - 5 }, { x: vs.width - 5, y: vs.height - 5 }, { x: vs.width / 2, y: vs.height - 5 }, { x: vs.width - 5, y: 5 }]
    const outside = (q) => !box || q.x < box.x || q.x > box.x + box.width || q.y < box.y || q.y > box.y + box.height
    let pt = preferred
    for (const q of candidates.filter(outside)) {
      const inert = await p.evaluate(({ x, y }) => !document.elementFromPoint(x, y)?.closest('button, a, input, select, textarea, label, [role="button"], [role="switch"], [tabindex]'), q)
      if (inert) { pt = q; break }
    }
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
