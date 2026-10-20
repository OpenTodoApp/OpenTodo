// @vitest-environment happy-dom
// UI correctness (OpenSpec change ui-correctness): viewers' keys change nothing,
// Today and the sidebar roll over at midnight, selectors do not depend on the
// interface language, the Logbook note is translated, and confirmations are the
// app's own dialog instead of the browser's.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { setDateTime } from '../lib/dates'
import { applyCatalog, loadLanguage } from '../lib/i18n/catalog'
import { createProject, createTask, mutateMany, resetDeviceId, type Change } from '../lib/ops'
import type { ImportJob, Membership, Project, ProjectInvite } from '../lib/types'
import { SidebarGroup } from '../ui'
import { click, flush, key, mockFetch, noPublicLinks, render, waitFor } from '../ui/test-utils'
import { resetCollapsedGroups } from './collapsedGroups'
import { ImportScreen } from './ImportScreen'
import { InviteLinksSection } from './InviteLinksSection'
import { resetPanel } from './panel'
import { PanelHost } from './PanelHost'
import { ShareDialog } from './ShareDialog'
import { Sidebar } from './Sidebar'
import { TaskListView } from './TaskListView'
import { MfaPolicyPanel } from './TwoFactorPanel'

let n = 0
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
  useDatabase(`ui-correctness-${Date.now()}-${n++}`)
  resetDeviceId()
  localStorage.clear()
  resetCollapsedGroups()
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'DM', hour12: false, weekStart: 1 })
  mockFetch(noPublicLinks)
  // A native dialog must never be asked; answering "yes" would hide one that is.
  vi.stubGlobal('confirm', vi.fn(() => true))
  vi.stubGlobal('prompt', vi.fn(() => null))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  resetPanel()
  applyCatalog('en', 'en', {})
  setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' })
  document.body.innerHTML = ''
})

const confirmDialog = () => document.querySelector<HTMLElement>('[data-testid="confirm-dialog"]')
const button = (root: ParentNode, text: string) => [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text)
const nativeAsked = () => (globalThis.confirm as unknown as ReturnType<typeof vi.fn>).mock.calls.length

describe('a viewer of a shared project (UI-10)', () => {
  it('skip, this occurrence only, schedule and estimate change nothing and open nothing', async () => {
    const p = await createProject({ name: 'Shared' })
    await db.memberships.put({ projectId: p, role: 'viewer', ownerId: 'someone', members: [] })
    const id = await createTask({ title: 'Standup', project_id: p, due: { date: '2026-10-14' }, recurrence: 'every day' })
    const before = await db.tasks.get(id)
    const r = await render(<><TaskListView route={{ view: 'project', id: p }} /><PanelHost /></>)
    await waitFor(() => r.container.textContent!.includes('Standup'), 'the row')
    await key(document.body, 'j')
    await waitFor(() => !!r.container.querySelector('[data-task-id][aria-current]'), 'a selected row')
    const path = location.pathname
    await key(document.body, 'K', { shiftKey: true })
    await key(document.body, 'O', { shiftKey: true })
    await key(document.body, 's')
    await key(document.body, 'e')
    await flush(100)
    expect((await db.tasks.get(id))!.due).toEqual(before!.due)
    expect(await db.tasks.count()).toBe(1)
    expect(location.pathname).toBe(path)
    expect(document.querySelector('[data-detail-for]')).toBeNull()
    await r.unmount()
  })
})

describe('midnight while the app is open (UI-17)', () => {
  it('Today and the sidebar count take in the new day', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(new Date(2026, 9, 14, 23, 58))
    await createTask({ title: 'Tomorrow thing', due: { date: '2026-10-15' } })
    const r = await render(<>
      <Sidebar route={{ view: 'today' }} user={{ id: 'u1', email: 'u@example.com', name: 'U', role: 'owner' } as never} />
      <TaskListView route={{ view: 'today' }} />
    </>)
    const today = () => [...r.container.querySelectorAll('a, button')].find((a) => a.textContent?.startsWith('Today')) as HTMLElement | undefined
    await waitFor(() => !!r.container.querySelector('[data-list-page]') && !!today(), 'the list and sidebar')
    await flush(50)
    expect(r.container.querySelector('[data-list-page]')!.textContent).not.toContain('Tomorrow thing')
    vi.setSystemTime(new Date(2026, 9, 15, 0, 0, 30))
    await act(async () => { vi.advanceTimersByTime(60_000) })
    await waitFor(() => r.container.querySelector('[data-list-page]')!.textContent!.includes('Tomorrow thing'), 'the task in Today after midnight', 3000)
    await waitFor(() => today()!.querySelector('[data-count]')?.textContent === '1', 'the sidebar count after midnight', 3000)
    await r.unmount()
  })
})

describe('selectors in another language (UI-5)', () => {
  it('moving through the list leaves a focused sidebar project in German', async () => {
    await loadLanguage('de')
    await createTask({ title: 'Report' })
    const r = await render(<>
      <SidebarGroup title="Projekte"><ul role="tree"><li role="treeitem" data-project-row="p1"><button type="button">Arbeit</button></li></ul></SidebarGroup>
      <TaskListView route={{ view: 'inbox' }} />
    </>)
    await waitFor(() => r.container.textContent!.includes('Report'), 'the row')
    const project = button(r.container, 'Arbeit')!
    project.focus()
    expect(document.activeElement).toBe(project)
    await key(project, 'j')
    expect(document.activeElement).not.toBe(project)
    await r.unmount()
  })
})

describe('Logbook note (UI-20)', () => {
  it('counts a day\'s completions in the interface language', async () => {
    await loadLanguage('de')
    const ms = new Date(2026, 9, 14, 9).getTime()
    const changes: Change[] = [0, 1].map((i) => ({ entity: 'task', entityId: `t-${i}`, patch: { title: `Done ${i}`, priority: 4, labels: [], position: i, created_at: ms - 1000, completed_at: ms, deleted_at: null } }))
    await mutateMany(changes)
    const r = await render(<TaskListView route={{ view: 'completed' }} />)
    await waitFor(() => r.container.textContent!.includes('Done 1'), 'the logbook')
    expect([...r.container.querySelectorAll('[data-group-note]')].map((e) => e.textContent)).toEqual(['2 erledigt'])
    await r.unmount()
  })
})

describe('confirmations use the app dialog (UI-19)', () => {
  it('revoking an invite link asks in the app and revokes on confirm', async () => {
    const invite: ProjectInvite = { id: 'i1', projectId: 'p1', role: 'editor', email: null, createdBy: 'u1', createdByName: 'Ada', createdAt: 1, expiresAt: Date.now() + 86_400_000 }
    const calls: string[] = []
    mockFetch((method, path) => {
      if (path.endsWith('/invites') && method === 'GET') return { invites: calls.includes('DELETE') ? [] : [invite] }
      if (path.endsWith('/invites/i1') && method === 'DELETE') { calls.push('DELETE'); return {} }
      if (path.includes('outgoing-email') || path.includes('/email')) return { enabled: false }
      return undefined
    })
    const r = await render(<InviteLinksSection projectId="p1" myRole="owner" />)
    await waitFor(() => !!button(r.container, 'Revoke'), 'the invite')
    await click(button(r.container, 'Revoke')!)
    expect(nativeAsked()).toBe(0)
    expect(confirmDialog()).toBeTruthy()
    expect(calls).toEqual([])
    await click(button(confirmDialog()!, 'Revoke')!)
    await waitFor(() => calls.includes('DELETE'), 'the revoke request')
    await r.unmount()
  })

  it('making someone the owner and leaving a project ask in the app', async () => {
    const project = { id: 'p1', name: 'Garden' } as Project
    const membership: Membership = { projectId: 'p1', role: 'owner', ownerId: 'u1', members: [
      { userId: 'u1', name: 'Ada', email: 'ada@example.com', role: 'owner' },
      { userId: 'u2', name: 'Sam', email: 'sam@example.com', role: 'editor' },
    ] }
    const calls: string[] = []
    mockFetch((method, path) => {
      if (path.endsWith('/members') && method === 'GET') return membership
      if (path.endsWith('/transfer')) { calls.push('transfer'); return { ...membership, role: 'admin' } }
      if (path.endsWith('/invites') || path.endsWith('/public-links')) return path.endsWith('/invites') ? { invites: [] } : { links: [] }
      return undefined
    })
    const r = await render(<ShareDialog project={project} userId="u1" cached={membership} onClose={() => {}} />)
    const owner = () => document.querySelector<HTMLButtonElement>('button[aria-label="Make owner: Sam"]')
    await waitFor(() => !!owner(), 'the member row')
    await click(owner()!)
    expect(nativeAsked()).toBe(0)
    expect(confirmDialog()?.textContent).toContain('Garden')
    await click(button(confirmDialog()!, 'Make owner')!)
    await waitFor(() => calls.includes('transfer'), 'the transfer request')
    await r.unmount()

    const editor: Membership = { ...membership, role: 'editor', ownerId: 'u2', members: [
      { userId: 'u2', name: 'Sam', email: 'sam@example.com', role: 'owner' },
      { userId: 'u1', name: 'Ada', email: 'ada@example.com', role: 'editor' },
    ] }
    mockFetch((method, path) => (path.endsWith('/members') && method === 'GET' ? editor : path.endsWith('/public-links') ? { links: [] } : undefined))
    const s = await render(<ShareDialog project={project} userId="u1" cached={editor} onClose={() => {}} />)
    await waitFor(() => !!button(document.body, 'Leave'), 'the leave control')
    await click(button(document.body, 'Leave')!)
    expect(nativeAsked()).toBe(0)
    expect(confirmDialog()?.textContent).toContain('Garden')
    await s.unmount()
  })

  it('undoing an import asks in the app', async () => {
    const job = {
      id: 'j1', status: 'done', format: 'csv', fileName: 'tasks.csv', createdAt: 1, finishedAt: 2, undoneAt: null, error: '',
      totals: { entities: 3, written: 3, create: 2, update: 0, skip: 0, newProjects: 1, newLabels: 0 }, warnings: [],
    } as unknown as ImportJob
    const calls: string[] = []
    mockFetch((method, path) => {
      if (path === '/api/v1/import/jobs') return { jobs: [job] }
      if (method === 'POST' && path.endsWith('/undo')) { calls.push('undo'); return { job: { ...job, status: 'undone' } } }
      return undefined
    })
    const r = await render(<ImportScreen />)
    await waitFor(() => !!button(r.container, 'Undo'), 'the finished import')
    await click(button(r.container, 'Undo')!)
    expect(nativeAsked()).toBe(0)
    expect(confirmDialog()?.textContent).toContain('3 items')
    expect(calls).toEqual([])
    await click(button(confirmDialog()!, 'Undo import')!)
    await waitFor(() => calls.includes('undo'), 'the undo request')
    await r.unmount()
  })

  it('requiring two-factor without having it asks in the app', async () => {
    const calls: string[] = []
    mockFetch((method, path) => {
      if (path === '/api/v1/settings/mfa' && method === 'GET') return { required: 'none' }
      if (path === '/api/v1/settings/mfa' && method === 'PUT') { calls.push('put'); return { required: 'admins' } }
      if (path === '/api/v1/mfa') return { mfa: { enrolled: false } }
      return undefined
    })
    const r = await render(<MfaPolicyPanel />)
    const select = () => r.container.querySelector<HTMLSelectElement>('#mfa-policy-select')!
    await waitFor(() => !!select() && !select().disabled, 'the policy select')
    const other = [...select().options].find((o) => o.value !== 'none')!.value
    await act(async () => {
      select().value = other
      select().dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(nativeAsked()).toBe(0)
    expect(confirmDialog()).toBeTruthy()
    expect(calls).toEqual([])
    await r.unmount()
  })
})
