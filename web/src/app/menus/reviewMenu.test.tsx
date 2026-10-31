// @vitest-environment happy-dom
// "Review every…" and "Put in maintenance" / "End maintenance" in the project menus,
// the All projects row menu, the command palette and the project page's lead line
// (OpenSpec change project-review-cadence, tasks 2.4 and 3.1): each mode and role,
// one op with Undo.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from '../../lib/db'
import { createProject, resetDeviceId } from '../../lib/ops'
import type { Project, User } from '../../lib/types'
import { undoBatch } from '../../lib/undo'
import { render, waitFor } from '../../ui/test-utils'
import { projectMenuGroups } from '../ProjectHeader'
import { commands, type PaletteContext } from '../palette/registry'
import { ActionMenu, flatItems } from './ActionMenu'
import { maintenanceItem, reviewEveryItem } from './reviewMenu'

let n = 0
beforeEach(() => {
  useDatabase(`review-menu-${Date.now()}-${n++}`)
  resetDeviceId()
  document.body.innerHTML = ''
})

const project = (extra: Partial<Project> = {}) => ({ id: 'p1', name: 'Garden', color: '#000', position: 0, archived: false, parent_id: null, created_at: 0, deleted_at: null, _clock: {}, ...extra }) as Project
type Role = 'owner' | 'admin' | 'editor' | 'viewer'
type Mode = 'lists' | 'companion' | 'first'
const groupsFor = (p: Project, role: Role, mode: Mode, reviewEvery?: string) =>
  projectMenuGroups(p, { role, shared: role !== 'owner', targets: [], subCount: 0, openTasks: 0, mode, reviewEvery }, { rename: () => {} })
const ids = (p: Project, role: Role, mode: Mode, reviewEvery?: string) => groupsFor(p, role, mode, reviewEvery).flatMap((g) => g.items.map((i) => i.id))

describe('"Review every…" in the project menu', () => {
  it('Companion and Open Loops first offer it with the current interval checked', () => {
    for (const mode of ['companion', 'first'] as const) expect(ids(project(), 'owner', mode)).toContain('review-every')
    const item = reviewEveryItem('p1', 'month', { mode: 'companion' })!
    if (item.kind !== 'submenu') throw new Error('not a submenu')
    expect(item.items.map((i) => i.label)).toEqual(['Every week', 'Every 2 weeks', 'Every month', 'Every quarter', 'Paused'])
    expect(item.items.map((i) => (i.kind === 'check' ? i.checked : null))).toEqual([false, false, true, false, false])
  })

  it('Simple lists: only once a value other than the default is stored', () => {
    expect(ids(project(), 'owner', 'lists')).not.toContain('review-every')
    expect(ids(project(), 'owner', 'lists', 'week')).not.toContain('review-every')
    expect(ids(project(), 'owner', 'lists', 'quarter')).toContain('review-every')
  })

  it('is personal: editors get it, viewers do not', () => {
    expect(ids(project(), 'editor', 'companion')).toContain('review-every')
    expect(ids(project(), 'viewer', 'companion')).not.toContain('review-every')
  })
})

describe('maintenance in the project menu', () => {
  it('offers Put in maintenance or End maintenance to the owner and admins only', () => {
    expect(ids(project(), 'owner', 'companion')).toContain('maintenance-start')
    expect(ids(project({ status: 'maintenance' }), 'admin', 'first')).toContain('maintenance-end')
    expect(ids(project(), 'editor', 'companion')).not.toContain('maintenance-start')
    expect(ids(project({ status: 'maintenance' }), 'viewer', 'companion')).not.toContain('maintenance-end')
  })

  it('Simple lists: nothing on an active project, End maintenance on one in maintenance', () => {
    expect(ids(project(), 'owner', 'lists')).not.toContain('maintenance-start')
    expect(ids(project({ status: 'on-hold' }), 'owner', 'lists')).not.toContain('maintenance-start')
    expect(ids(project({ status: 'maintenance' }), 'owner', 'lists')).toContain('maintenance-end')
    expect(maintenanceItem(project(), { mode: 'lists', canEdit: true, always: true })?.id).toBe('maintenance-start')
  })
})

describe('choosing', () => {
  const items = () => [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')]
  const item = (label: string) => items().find((m) => m.textContent?.startsWith(label))

  it('Put in maintenance writes one op, and Undo restores the project', async () => {
    const id = await createProject({ name: 'Garden' })
    const row = (await db.projects.get(id))!
    const r = await render(<ActionMenu label="Project menu" groups={groupsFor(row, 'owner', 'companion')} open onOpenChange={() => {}} />)
    await waitFor(() => !!item('Put in maintenance'))
    const before = await db.outbox.count()
    await act(async () => { item('Put in maintenance')!.click() })
    await waitFor(async () => (await db.projects.get(id))?.status === 'maintenance')
    expect(await db.outbox.count()).toBe(before + 1)
    await undoBatch((await db.assistantUndo.toArray()).at(-1)!.id)
    expect((await db.projects.get(id))?.status).toBe('')
    await r.unmount()
  })

  it('a review interval is a personal op, with Undo', async () => {
    const id = await createProject({ name: 'Car' })
    const row = (await db.projects.get(id))!
    const r = await render(<ActionMenu label="Project menu" groups={groupsFor(row, 'editor', 'companion')} open onOpenChange={() => {}} />)
    await waitFor(() => !!item('Review every'))
    await act(async () => { item('Review every')!.click() })
    await waitFor(() => !!item('Every quarter'))
    await act(async () => { item('Every quarter')!.click() })
    await waitFor(async () => (await db.prefs.get(id))?.review_every === 'quarter')
    const queued = (await db.outbox.toArray()).filter((o) => o.entity === 'project_prefs')
    expect(queued.map((o) => [o.entityId, o.field, o.value])).toEqual([[id, 'review_every', 'quarter']])
    await undoBatch((await db.assistantUndo.toArray()).at(-1)!.id)
    expect((await db.prefs.get(id))?.review_every).toBe('')
    await r.unmount()
  })
})

describe('command palette', () => {
  const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User
  const base = { route: { view: 'project', id: 'p1' }, user, today: '2026-10-30', list: null, filterQuery: null, query: '', vimEnabled: false, showShortcuts: () => {}, focusQuickAdd: () => false } as unknown as PaletteContext
  const ctxFor = (p: Project, role: 'owner' | 'editor', reviewEvery?: string): PaletteContext => ({ ...base, project: { row: p, role, shared: role !== 'owner', targets: [], subCount: 0, openTasks: 0, reviewEvery } })

  it('offers Review every… with the stored interval selected, and maintenance to the owner', () => {
    const cmd = commands(ctxFor(project(), 'owner', 'paused')).find((c) => c.id === 'project:review-every')!
    const step = cmd.run() as { kind: string; picker: { selected: string[]; source: { every: string }[] } }
    expect(step.picker.source.map((c) => c.every)).toEqual(['week', '2weeks', 'month', 'quarter', 'paused'])
    expect(step.picker.selected).toEqual(['paused'])
    expect(commands(ctxFor(project(), 'owner')).some((c) => c.id === 'project:maintenance-start')).toBe(true)
    expect(commands(ctxFor(project({ status: 'maintenance' }), 'owner')).some((c) => c.id === 'project:maintenance-end')).toBe(true)
    expect(commands(ctxFor(project(), 'editor')).some((c) => c.id.startsWith('project:maintenance'))).toBe(false)
  })

  it('the palette does not list the interval choices twice', () => {
    const menu = flatItems(projectMenuGroups(project(), { role: 'owner', shared: false, targets: [], subCount: 0 }, { rename: () => {} }))
    expect(menu.some((i) => i.id.startsWith('review-every-'))).toBe(false)
  })
})
