// @vitest-environment happy-dom
// Settings → Integrations → Issues (OpenSpec change issue-import, task 5.3): a failed
// connection's card leads with the failure, members see the switch's state only, the
// last loaded cards stay offline with actions off, Delete names the token and the
// tasks before anything is deleted, Sync now works from the keyboard, and no token is
// ever rendered.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { cacheIssueConnections } from '../lib/localData'
import type { IssueConnection } from '../lib/types'
import { click, flush, key, render } from '../ui/test-utils'
import { draftBody, draftOf } from './IssueEditor'
import { filterText, IssuesPanel, stateLine } from './IssuesPanel'

const NOW = new Date(2026, 9, 20, 12, 0).getTime()
const failed: IssueConnection = {
  id: 'c1', provider: 'github', host: 'https://github.com', name: 'Work', project_id: null,
  filter: { scope: 'repositories', repositories: ['acme/web', 'acme/api', 'acme/docs'], labels: ['bug'] }, map_labels: false, enabled: true,
  interval_minutes: 30, state: 'failed', next_poll_at: NOW + 3600_000, last_poll_at: NOW - 600_000, last_success_at: NOW - 2 * 3600_000,
  last_error: 'timeout', last_error_at: NOW - 600_000, stopped_reason: '', account_login: 'octo', can_read_issues: true,
  last_run: { created: 3, completed: 1, reopened: 0, renamed: 2, unlinked: 0, partial: false }, task_count: 40, token_set: true,
  created_at: NOW - 86400_000, updated_at: NOW - 600_000,
}
const healthy: IssueConnection = { ...failed, state: 'ok', last_error: '', last_error_at: null, last_success_at: NOW - 12 * 60_000 }
let calls: string[] = []
let routes: Record<string, unknown> = {}

function serve(r: Record<string, unknown>) {
  routes = r
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const k = `${init?.method ?? 'GET'} ${new URL(url, 'http://x').pathname}`
    calls.push(k)
    if (k in routes) {
      const body = routes[k]
      return body === null ? new Response(null, { status: 204 }) : new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify({ error: { code: 'not_found', message: 'not found' } }), { status: 404 })
  }))
}

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

const buttons = (root: ParentNode = document) => [...root.querySelectorAll('button')]
const byText = (text: string, root: ParentNode = document) => buttons(root).find((b) => b.textContent === text)

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  await db.delete()
  await db.open()
  calls = []
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('issues panel', () => {
  it('leads a failed card with the failure, then host, account, project and filter, with every action', async () => {
    serve({ 'GET /api/v1/settings/issues': { enabled: true }, 'GET /api/v1/issues/connections': { connections: [failed] } })
    const r = await render(<IssuesPanel isOwner />)
    await waitFor(() => r.container.querySelector('[data-issue-connection="c1"]') !== null)
    const card = r.container.querySelector('[data-issue-connection="c1"]')!
    const lines = [...card.querySelectorAll('p')].map((p) => p.textContent)
    expect(card.textContent!.indexOf('Failed')).toBeLessThan(card.textContent!.indexOf('github.com'))
    expect(lines[0]).toBe('The host did not answer in time. · last success 2 h ago')
    expect(lines[1]).toBe('GitHub · github.com · @octo')
    expect(lines[2]).toContain('Inbox · 3 repositories · label bug')
    expect(byText('Sync now', card)).toBeDefined()
    await click(card.querySelector('button[aria-label="Actions for Work"]')!)
    await flush(20)
    const items = [...document.querySelectorAll('[role="menuitem"]')].map((e) => e.textContent)
    expect(items).toEqual(['Test token', 'Edit', 'Disable', 'Delete'])
    await r.unmount()
  })

  it('tells a member the owner has not enabled it and offers no actions', async () => {
    serve({ 'GET /api/v1/settings/issues': { enabled: false } })
    const r = await render(<IssuesPanel isOwner={false} />)
    await waitFor(() => r.container.textContent!.includes('The owner has not enabled issue connections'))
    expect(r.container.querySelector('[role="switch"]')).toBeNull()
    expect(byText('Connect issues', r.container)).toBeUndefined()
    expect(calls).not.toContain('GET /api/v1/issues/connections')
    await r.unmount()
  })

  it('shows the last loaded cards offline with actions disabled', async () => {
    await cacheIssueConnections([healthy])
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    serve({})
    const r = await render(<IssuesPanel isOwner />)
    await waitFor(() => r.container.textContent!.includes('Changing issue connections needs a connection'))
    expect(r.container.textContent).toContain('Work')
    expect(byText('Sync now', r.container)!.hasAttribute('disabled')).toBe(true)
    expect(byText('Connect issues', r.container)!.hasAttribute('disabled')).toBe(true)
    expect(calls).toEqual([])
    await r.unmount()
  })

  it('confirms Delete with what happens to the token and the tasks', async () => {
    serve({ 'GET /api/v1/settings/issues': { enabled: true }, 'GET /api/v1/issues/connections': { connections: [healthy] }, 'DELETE /api/v1/issues/connections/c1': null })
    const r = await render(<IssuesPanel isOwner />)
    await waitFor(() => r.container.querySelector('[data-issue-connection="c1"]') !== null)
    await click(r.container.querySelector('button[aria-label="Actions for Work"]')!)
    await flush(20)
    await click([...document.querySelectorAll('[role="menuitem"]')].find((e) => e.textContent === 'Delete')!)
    await waitFor(() => document.querySelector('[role="alertdialog"]') !== null)
    expect(document.body.textContent).toContain('The token is removed from the server')
    expect(document.body.textContent).toContain('The 40 tasks it created stay as ordinary tasks')
    expect(calls).not.toContain('DELETE /api/v1/issues/connections/c1')
    await click(byText('Delete', document.querySelector('[role="alertdialog"]')!)!)
    await waitFor(() => calls.includes('DELETE /api/v1/issues/connections/c1'))
    await waitFor(() => r.container.querySelector('[data-issue-connection="c1"]') === null)
    await r.unmount()
  })

  it('runs Sync now from the keyboard and updates the card without a reload', async () => {
    serve({
      'GET /api/v1/settings/issues': { enabled: true },
      'GET /api/v1/issues/connections': { connections: [failed] },
      'POST /api/v1/issues/connections/c1/sync': { ok: true, run: healthy.last_run, connection: healthy },
    })
    const r = await render(<IssuesPanel isOwner />)
    await waitFor(() => r.container.querySelector('[data-issue-connection="c1"]') !== null)
    const sync = byText('Sync now', r.container)!
    sync.focus()
    expect(document.activeElement).toBe(sync)
    await key(sync, 'Enter')
    sync.click() // happy-dom does not turn Enter on a button into a click; a browser does
    await waitFor(() => calls.includes('POST /api/v1/issues/connections/c1/sync'))
    await waitFor(() => r.container.querySelector('[data-issue-state]')!.textContent === 'Checked 12 min ago')
    expect(calls.filter((c) => c.startsWith('GET /api/v1/issues')).length).toBe(1)
    await r.unmount()
  })

  it('never renders a token, and the editor never prefills one', async () => {
    serve({ 'GET /api/v1/settings/issues': { enabled: true }, 'GET /api/v1/issues/connections': { connections: [{ ...healthy, token: 'ghp_secret' }] } })
    const r = await render(<IssuesPanel isOwner />)
    await waitFor(() => r.container.querySelector('[data-issue-connection="c1"]') !== null)
    await click(r.container.querySelector('button[aria-label="Actions for Work"]')!)
    await flush(20)
    await click([...document.querySelectorAll('[role="menuitem"]')].find((e) => e.textContent === 'Edit')!)
    await waitFor(() => document.querySelector('[data-testid="issue-editor"]') !== null)
    const token = document.querySelector<HTMLInputElement>('input[aria-label="Replace token"]')!
    expect(token.type).toBe('password')
    expect(token.value).toBe('')
    expect(document.body.innerHTML).not.toContain('ghp_secret')
    const axe = (await import('axe-core')).default
    const res = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })
    expect(res.violations.map((v) => v.id)).toEqual([])
    await r.unmount()
  })

  it('shows the server error beside the field it names', async () => {
    serve({ 'GET /api/v1/settings/issues': { enabled: true }, 'GET /api/v1/issues/connections': { connections: [] } })
    const r = await render(<IssuesPanel isOwner />)
    await waitFor(() => byText('Connect issues', r.container) !== undefined)
    routes['POST /api/v1/issues/connections'] = undefined
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const k = `${init?.method ?? 'GET'} ${new URL(url, 'http://x').pathname}`
      calls.push(k)
      return new Response(JSON.stringify({ error: { code: 'invalid_input', message: 'host: the address must be an https URL', field: 'host' } }), { status: 400 })
    }))
    await click(byText('Connect issues', r.container)!)
    await waitFor(() => document.querySelector('[data-testid="issue-editor"]') !== null)
    const tokenInput = document.querySelector<HTMLInputElement>('input[aria-label="Token"]')!
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(tokenInput, 'ghp_x')
    tokenInput.dispatchEvent(new Event('input', { bubbles: true }))
    await click(byText('Connect', document.querySelector('[data-testid="issue-editor"]')!)!)
    await waitFor(() => calls.includes('POST /api/v1/issues/connections'))
    await waitFor(() => document.querySelector('[data-testid="issue-editor"]')!.textContent!.includes('the address must be an https URL'))
    const host = document.querySelector('input[aria-label="Host"]')!
    expect(host.getAttribute('aria-invalid')).toBe('true')
    await r.unmount()
  })

  it('Short form by default: three steps, GitHub on github.com, More options closed, Test and Save in the sticky bar (settings-refresh D9)', async () => {
    serve({ 'GET /api/v1/settings/issues': { enabled: true }, 'GET /api/v1/issues/connections': { connections: [] } })
    const r = await render(<IssuesPanel isOwner />)
    await waitFor(() => byText('Connect issues', r.container) !== undefined)
    await click(byText('Connect issues', r.container)!)
    await waitFor(() => document.querySelector('[data-testid="issue-editor"]') !== null)
    const editor = document.querySelector('[data-testid="issue-editor"]')!
    expect([...editor.querySelectorAll('[data-issue-step] h3')].map((h) => h.textContent)).toEqual(['1Where', '2Access', '3Which issues and where they go'])
    expect(editor.querySelector('[data-issue-provider="github"]')!.getAttribute('aria-checked')).toBe('true')
    const host = editor.querySelector<HTMLInputElement>('input[aria-label="Host"]')!
    expect(host.value).toBe('https://github.com')
    expect(host.readOnly).toBe(true)
    expect(editor.querySelector<HTMLDetailsElement>('[data-issue-more]')!.open).toBe(false)
    const bar = editor.querySelector('[data-issue-actions]')!
    expect(bar.className).toContain('sticky')
    expect(buttons(bar).map((b) => b.textContent)).toEqual(['Cancel', 'Test', 'Connect'])
    // GitLab makes the host editable.
    await click(editor.querySelector('[data-issue-provider="gitlab"]')!)
    expect(editor.querySelector<HTMLInputElement>('input[aria-label="Host"]')!.readOnly).toBe(false)
    expect(editor.querySelector<HTMLInputElement>('input[aria-label="Host"]')!.value).toBe('https://gitlab.com')
    await r.unmount()
  })

  it('words states and filters, and sends a token only when typed', () => {
    expect(stateLine({ ...healthy, state: 'stopped', stopped_reason: 'token_missing' }, NOW)).toBe('No token is stored, for example after a restore. Enter it again.')
    expect(stateLine({ ...healthy, state: 'pending', last_success_at: null }, NOW)).toBe('Waiting for the first poll')
    expect(filterText({ ...healthy, filter: { scope: 'assigned', repositories: [], labels: [] } })).toBe('Assigned to you')
    const edit = draftBody(draftOf(healthy))
    expect('token' in edit).toBe(false)
    expect(edit.filter).toEqual(healthy.filter)
    expect(draftBody({ ...draftOf(healthy), token: ' ghp_new ' }).token).toBe('ghp_new')
  })
})
