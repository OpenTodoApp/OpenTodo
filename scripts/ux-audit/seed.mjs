// The seeded account every screen tour uses (OpenSpec change ux-audit-three-widths
// D2): two users, projects with sections and a deep tree, labels, tasks in every
// state, comments, attachments, saved views, a dashboard, settings and the scripted
// assistant. Written through the REST API against a FRESH data directory, by the
// layout check (scripts/e2e-layout.mjs) and the audit tour (scripts/ux-audit/tour.mjs).
import { startFakeLLM } from '../fake-llm.mjs'

export const PASSWORD = 'correct horse battery staple'

// A 2×2 grey PNG for image attachments and shared files.
export const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGOYs3g9EDFAKAA1yge5YXhuBgAAAABJRU5ErkJggg=='
export const LONG_URL = 'https://example.com/a/very/long/path/that/does/not/fit/on/a/phone/screen/' + 'segment'.repeat(6) + '?ref=layout-check'
export async function seed({ base, pw, lang = '' }) {
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
  // Four levels under Work (ux-feedback-2 D6): the sidebar's guide lines and capped indentation at 360 px.
  let nested = work.id
  for (const name of ['Clients', 'Acme Corporation international', 'Q4 launch campaign', 'Press kit']) nested = (await A('POST', '/api/v1/projects', { name, parent_id: nested })).id
  await A('POST', `/api/v1/projects/${home.id}/members`, { email: 'bob@example.com', role: 'editor' })
  // A pending project invite link (project-invite-links): its acceptance screen is
  // checked signed out and signed in, and the share dialog lists it.
  const { link: projectLink } = await A('POST', `/api/v1/projects/${home.id}/invites`, { role: 'editor', email: 'dora@example.com' })
  const { link: publicLink } = await A('POST', `/api/v1/projects/${home.id}/public-links`, { rights: 'tick', name: 'Family chat' })
  // A task page with a long title, a checklist and a guest's reply (task-pages).
  const fence = await A('POST', '/api/v1/tasks', { title: 'Paint the fence along the garden path before the neighbours come over', description: `Two coats. See ${LONG_URL}` })
  for (const title of ['Buy primer', 'Sand the boards']) await A('POST', '/api/v1/tasks', { title, parent_id: fence.id })
  const { link: pageLink } = await A('POST', `/api/v1/tasks/${fence.id}/page`, { rights: 'tick', label: 'paint-the-fence' })
  const pageSecret = pageLink.split('/t/')[1].split('/')[0]
  await A('POST', `/api/v1/pages/${pageSecret}/replies`, { name: 'Marco', body: 'Bought the primer.' })
  const sections = {}
  let i = 1
  for (const n of ['Planning', 'In progress', 'Waiting']) sections[n] = (await A('POST', '/api/v1/sections', { name: n, project_id: home.id, position: i++ })).id
  const today = new Date().toISOString().slice(0, 10)
  const T = (b) => A('POST', '/api/v1/tasks', b)
  await T({ title: 'Inbox task with a deliberately long title that has to wrap or truncate on a narrow phone screen', priority: 1, due: { date: today }, labels: [L.errand, L.waiting] })
  // Undated and without a project: an Inbox task (inbox-means-unplaced); dated tasks without a project are not.
  await T({ title: 'Undated inbox task with a long title that has to wrap or truncate on a narrow phone screen', labels: [L.errand] })
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
  // Member keys allowed, so Settings → Integrations shows "Which assistant you use" and
  // the owner's cap switch (assistant-member-provider); Ada stays on the server's.
  await A('PUT', '/api/v1/settings/assistant', { enabled: true, default_provider: 'compatible', allow_private_endpoint: true, allow_member_keys: true,
    providers: { compatible: { enabled: true, model: 'fake-model', base_url: `http://127.0.0.1:${llm.address().port}/v1` } } })
  await A('PUT', '/api/v1/me/assistant', { consent: true, provider: 'compatible' })
  await A('POST', '/api/v1/tasks', { title: 'Water the plants', due: { date: new Date(Date.now() - 2 * 86400e3).toISOString().slice(0, 10) } })
  if (lang) {
    // The interface language is a synced preference (user_prefs.language); written
    // like any device would, so every screen of the run opens in it.
    await A('POST', '/api/v1/sync', { device: 'layout-check', cursor: 0, ops: [{ id: `lang-${Date.now()}`, entity: 'user_prefs', entityId: 'me', field: 'language', value: lang, ts: Date.now(), device: 'layout-check' }] })
  }
  // One session for every browser context: logging in per context trips the rate limit.
  const storageState = await ctx.storageState()
  await browser.close()
  return { storageState, projectInvite: projectLink.split('/invite/p/')[1], publicLink: publicLink.split('/public/')[1], pageSecret, home: home.id, work: work.id, view: v1.id, dashboard: dash.id, label: L.errand, quotes: quotes.id, llm }
}
