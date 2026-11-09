// @vitest-environment happy-dom
// Workspaces in the app (OpenSpec change workspaces, tasks 5.3, 5.4, 6.1, 7.1).
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, getMeta } from '../lib/db'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import type { User, Workspace, WorkspaceEntry } from '../lib/types'
import { CURRENT_WORKSPACE_KEY, storeWorkspaces, switchTo } from '../lib/workspaces'
import { click, render, visibleText, waitFor } from '../ui/test-utils'
import { resetPanel } from './panel'
import { routeAfterSwitch } from './workspaceNav'
import { Sidebar } from './Sidebar'
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
afterEach(() => { vi.unstubAllGlobals() })


describe('the workspace control', () => {
  // Workspace picture (sidebar-brand-and-row-grid D1, app-shell "Workspace picture").
  const trigger = (root: ParentNode) => root.querySelector<HTMLElement>('[data-workspace-trigger]')!
  const mark = (root: ParentNode) => trigger(root).querySelector<HTMLElement>('[data-workspace-mark]')!

  it('Default workspace without an icon: "P" on the neutral surface and "Personal" on one line, no app mark', async () => {
    await storeWorkspaces([entry('w-p', { default: true, name: 'Personal' })])
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} onSearch={() => {}} />)
    await waitFor(() => visibleText(trigger(r.container)).includes('Personal'))
    expect(mark(r.container).textContent).toBe('P')
    expect(mark(r.container).getAttribute('data-hue')).toBeNull()
    expect(mark(r.container).className).toContain('bg-sunken')
    expect(mark(r.container).className).toContain('size-5')
    expect(trigger(r.container).querySelector('[data-workspace-name]')!.textContent).toBe('Personal')
    expect(trigger(r.container).querySelector('[data-workspace-name]')!.className).toMatch(/\btruncate\b/)
    expect(visibleText(trigger(r.container))).not.toContain('OpenTodo')
    expect(trigger(r.container).querySelector('[data-brand-mark]')).toBeNull()
    expect(trigger(r.container).getAttribute('aria-label')).toBe('Workspace: Personal')
    await r.unmount()
  })

  it('Chosen icon and colour: the briefcase on blue and "Work"', async () => {
    await storeWorkspaces([entry('w-p', { default: true, name: 'Personal' }), entry('w-work', { name: 'Work', icon: 'briefcase', color: '#3b82f6' })])
    await switchTo('w-work')
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} onSearch={() => {}} />)
    await waitFor(() => visibleText(trigger(r.container)).includes('Work'))
    expect(mark(r.container).getAttribute('data-workspace-mark')).toBe('icon')
    expect(mark(r.container).getAttribute('data-hue')).toBe('blue')
    expect(mark(r.container).querySelector('svg')).not.toBeNull()
    expect(trigger(r.container).querySelector('[data-workspace-name]')!.textContent).toBe('Work')
    await r.unmount()
  })

  it('A colour without an icon: the initial on that colour', async () => {
    await storeWorkspaces([entry('w-p', { default: true, name: 'Personal' }), entry('w-home', { name: 'home', color: '#22c55e' })])
    await switchTo('w-home')
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} onSearch={() => {}} />)
    await waitFor(() => visibleText(trigger(r.container)).includes('home'))
    expect(mark(r.container).textContent).toBe('H')
    expect(mark(r.container).getAttribute('data-hue')).toBe('green')
    await r.unmount()
  })

  it('Rail: the picture alone, named by the workspace', async () => {
    await storeWorkspaces([entry('w-p', { default: true, name: 'Personal' }), entry('w-work', { name: 'Work', icon: 'briefcase', color: '#3b82f6' })])
    await switchTo('w-work')
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} onSearch={() => {}} collapsed />)
    await waitFor(() => r.container.querySelector('[data-sidebar-header] [role="img"]')?.getAttribute('aria-label') === 'Work')
    expect(r.container.querySelector('[data-sidebar-header] [data-workspace-mark="icon"]')).not.toBeNull()
    expect(r.container.querySelector('[data-sidebar-header] [data-workspace-name]')).toBeNull()
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

describe('tasks follow their workspace', () => {
  it('a project-less task created in Work is not in Personal', async () => {
    await storeWorkspaces([entry('w-p', { default: true, name: 'Personal' }), entry('w-work', { name: 'Work' })])
    await switchTo('w-work')
    const id = await createTask({ title: 'Call' })
    expect((await db.tasks.get(id))?.workspace_id).toBe('w-work')
  })
})
