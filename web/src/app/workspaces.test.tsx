// @vitest-environment happy-dom
// Workspaces in the app (OpenSpec change workspaces, tasks 5.3, 5.4, 6.1, 7.1).
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, getMeta } from '../lib/db'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import type { User, Workspace, WorkspaceEntry } from '../lib/types'
import { CURRENT_WORKSPACE_KEY, storeWorkspaces, switchTo } from '../lib/workspaces'
import { click, flush, render, visibleText } from '../ui/test-utils'
import { resetPanel } from './panel'
import { routeAfterSwitch } from './workspaceNav'
import { Sidebar } from './Sidebar'
import { WorkspacesSettings } from './WorkspacesSettings'
import { commands } from './palette/registry'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User

const entry = (id: string, extra: Partial<Workspace> = {}, members: WorkspaceEntry['members'] = [{ userId: 'u1', name: 'Ada', role: 'owner' }]): WorkspaceEntry =>
  ({ id, name: id, icon: '', color: '', default: false, role: 'owner', ownerId: 'u1', members, groups: [], ...extra })

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  localStorage.clear()
  resetPanel()
})
afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals() })

async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

describe('the workspace control', () => {
  it('One workspace: the header reads OpenTodo · Personal', async () => {
    await storeWorkspaces([entry('w-p', { default: true, name: 'Personal' })])
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} onSearch={() => {}} />)
    await waitFor(() => visibleText(r.container.querySelector('[data-workspace-trigger]')!).includes('Personal'))
    expect(visibleText(r.container.querySelector('[data-workspace-trigger]')!)).toContain('OpenTodo')
    await r.unmount()
  })

  it('switching shows the other workspace\'s projects, and the choice stays on the device', async () => {
    await storeWorkspaces([entry('w-p', { default: true, name: 'Personal' }), entry('w-work', { name: 'Work' })])
    await createProject({ name: 'Garden' })
    await switchTo('w-work')
    await createProject({ name: 'Website' })
    await switchTo('w-p')
    const r = await render(<Sidebar route={{ view: 'today' }} user={user} onSearch={() => {}} />)
    await waitFor(() => r.container.textContent!.includes('Garden'))
    expect(r.container.textContent).not.toContain('Website')
    await click(r.container.querySelector('[data-workspace-trigger]')!)
    await waitFor(() => !!document.querySelector('[data-workspace-item="w-work"]'))
    await click(document.querySelector('[data-workspace-item="w-work"]')!)
    await waitFor(() => r.container.textContent!.includes('Website'))
    expect(r.container.textContent).not.toContain('Garden')
    expect(await getMeta(CURRENT_WORKSPACE_KEY, '')).toBe('w-work')
    await r.unmount()
  })

  it('a project view is left for the Inbox; Today stays Today', () => {
    expect(routeAfterSwitch({ view: 'project', id: 'p1' })).toEqual({ view: 'inbox' })
    expect(routeAfterSwitch({ view: 'today' })).toEqual({ view: 'today' })
  })
})

describe('palette commands', () => {
  it('lists Switch to workspace for every other workspace and New workspace, without keys', () => {
    const list = [entry('w-p', { default: true, name: 'Personal' }), entry('w-work', { name: 'Work' })]
    const cmds = commands({ route: { view: 'inbox' }, user, today: '2026-10-22', list: null, filterQuery: null, query: '', vimEnabled: false,
      workspaces: { list, current: 'w-p' }, showShortcuts: () => {}, focusQuickAdd: () => false })
    const sw = cmds.filter((c) => c.id.startsWith('workspace:'))
    expect(sw.map((c) => c.label)).toEqual(['Switch to workspace: Work', 'New workspace'])
    expect(sw.every((c) => !c.shortcut)).toBe(true)
  })
})

describe('Settings → Workspaces', () => {
  it('Owner manages a workspace; a member sees it read-only with Leave', async () => {
    await storeWorkspaces([
      entry('w-p', { default: true, name: 'Personal' }),
      entry('w-fam', { name: 'Family' }, [{ userId: 'u1', name: 'Ada', role: 'owner' }, { userId: 'u2', name: 'Bob', role: 'member' }]),
      entry('w-club', { name: 'Club', role: 'member', ownerId: 'u3' }, [{ userId: 'u3', name: 'Cleo', role: 'owner' }, { userId: 'u1', name: 'Ada', role: 'member' }]),
    ])
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"invites":[]}', { status: 200, headers: { 'Content-Type': 'application/json' } })))
    await switchTo('w-fam')
    const r = await render(<WorkspacesSettings user={user} />)
    await waitFor(() => r.container.textContent!.includes('Danger zone'))
    expect(r.container.querySelector('[data-add-workspace-member]')).not.toBeNull()
    expect(r.container.textContent).toContain('Delete workspace')
    await r.unmount()
    await switchTo('w-club')
    const m = await render(<WorkspacesSettings user={user} />)
    await waitFor(() => m.container.textContent!.includes('Leave workspace'))
    expect(m.container.querySelector('[data-add-workspace-member]')).toBeNull()
    expect(m.container.textContent).not.toContain('Delete workspace')
    await m.unmount()
  })

  it('Offline: the lists stay and the controls say a connection is needed', async () => {
    await storeWorkspaces([entry('w-p', { default: true, name: 'Personal' }), entry('w-fam', { name: 'Family' })])
    await switchTo('w-fam')
    vi.stubGlobal('navigator', { ...navigator, onLine: false })
    const r = await render(<WorkspacesSettings user={user} />)
    await waitFor(() => r.container.textContent!.includes('need a connection'))
    expect((r.container.querySelector('[data-settings-new-workspace]') as HTMLButtonElement).disabled).toBe(true)
    await r.unmount()
  })
})

describe('tasks follow their workspace', () => {
  it('a project-less task created in Work is not in Personal', async () => {
    await storeWorkspaces([entry('w-p', { default: true, name: 'Personal' }), entry('w-work', { name: 'Work' })])
    await switchTo('w-work')
    const id = await createTask({ title: 'Call' })
    expect((await db.tasks.get(id))?.workspace_id).toBe('w-work')
  })
})
