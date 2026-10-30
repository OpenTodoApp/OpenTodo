// @vitest-environment happy-dom
// "Flow…" in the project and section menus and the command palette (OpenSpec change
// project-flow-modes, tasks 4.1 and 4.2): each mode and role, the keyboard path, one
// op with Undo.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from '../../lib/db'
import { createProject, resetDeviceId } from '../../lib/ops'
import type { Project, Section, User } from '../../lib/types'
import { undoBatch } from '../../lib/undo'
import { key, render, waitFor } from '../../ui/test-utils'
import { projectMenuGroups } from '../ProjectHeader'
import { commands, type PaletteContext } from '../palette/registry'
import { ActionMenu, flatItems } from './ActionMenu'
import { projectFlowItem, sectionFlowItem } from './flowMenu'

let n = 0
beforeEach(() => {
  useDatabase(`flow-menu-${Date.now()}-${n++}`)
  resetDeviceId()
  document.body.innerHTML = ''
})

const project = (extra: Partial<Project> = {}) => ({ id: 'p1', name: 'Move house', color: '#000', position: 0, archived: false, parent_id: null, created_at: 0, deleted_at: null, _clock: {}, ...extra }) as Project
const section = (extra: Partial<Section> = {}) => ({ id: 's1', name: 'Prepare', project_id: 'p1', position: 0, created_at: 0, deleted_at: null, _clock: {}, ...extra }) as Section
const groupsFor = (p: Project, role: 'owner' | 'admin' | 'editor' | 'viewer', mode: 'lists' | 'companion' | 'first') =>
  projectMenuGroups(p, { role, shared: role !== 'owner', targets: [], subCount: 0, openTasks: 0, mode }, { rename: () => {} })
const hasFlow = (groups: ReturnType<typeof groupsFor>) => groups.some((g) => g.items.some((i) => i.id === 'flow'))

describe('project "Flow…" item', () => {
  it('Make a project sequential: offered in Companion and Open Loops first, with the current flow checked', () => {
    for (const mode of ['companion', 'first'] as const) expect(hasFlow(groupsFor(project(), 'owner', mode))).toBe(true)
    const item = projectFlowItem(project({ flow_mode: 'sequential' }), { mode: 'companion', canEdit: true })!
    expect(item.kind).toBe('submenu')
    if (item.kind !== 'submenu') return
    expect(item.items.map((i) => i.label)).toEqual(['Parallel', 'Sequential', 'Area'])
    expect(item.items.map((i) => (i.kind === 'check' ? i.checked : null))).toEqual([false, true, false])
    expect(item.items.every((i) => !!i.description)).toBe(true)
  })

  it('Simple lists see nothing new, unless a flow is already set', () => {
    expect(hasFlow(groupsFor(project(), 'owner', 'lists'))).toBe(false)
    expect(hasFlow(groupsFor(project({ flow_mode: 'staged' }), 'owner', 'lists'))).toBe(false)
    expect(hasFlow(groupsFor(project({ flow_mode: 'area' }), 'owner', 'lists'))).toBe(true)
  })

  it('Editor of a shared project: no project item; admins get it; viewers see nothing', () => {
    expect(hasFlow(groupsFor(project(), 'admin', 'companion'))).toBe(true)
    expect(hasFlow(groupsFor(project(), 'editor', 'companion'))).toBe(false)
    expect(hasFlow(groupsFor(project(), 'viewer', 'companion'))).toBe(false)
  })
})

describe('section "Flow…" item', () => {
  it('names the project flow it follows, for editors; nothing for viewers', () => {
    const item = sectionFlowItem(section(), project({ flow_mode: 'sequential' }), { mode: 'companion', canEdit: true })!
    if (item.kind !== 'submenu') throw new Error('not a submenu')
    expect(item.items.map((i) => i.label)).toEqual(['Follow project (Sequential)', 'Parallel', 'Sequential'])
    expect(item.items[0].kind === 'check' && item.items[0].checked).toBe(true)
    expect(sectionFlowItem(section(), project({ flow_mode: 'area' }), { mode: 'companion', canEdit: true })!.kind === 'submenu').toBe(true)
    expect(sectionFlowItem(section(), project(), { mode: 'companion', canEdit: false })).toBeNull()
  })

  it('Simple lists: only on a section with a flow of its own', () => {
    expect(sectionFlowItem(section(), project(), { mode: 'lists', canEdit: true })).toBeNull()
    expect(sectionFlowItem(section({ flow_mode: 'parallel' }), project(), { mode: 'lists', canEdit: true })).not.toBeNull()
  })
})

describe('choosing a flow', () => {
  it('the keyboard path writes one op, and Undo restores the previous flow', async () => {
    const id = await createProject({ name: 'Move house' })
    const row = (await db.projects.get(id))!
    const r = await render(<ActionMenu label="Project menu" groups={groupsFor(row, 'owner', 'companion')} open onOpenChange={() => {}} />)
    const items = () => [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')]
    const item = (label: string) => items().find((m) => m.textContent?.startsWith(label))
    await waitFor(() => !!item('Flow…'))
    await act(async () => { item('Flow…')!.click() })
    await waitFor(() => !!item('Sequential'))
    // Keyboard: focus moves onto the first choice, and Escape goes back to the item.
    expect(document.activeElement).toBe(item('Parallel'))
    await key(document.activeElement as HTMLElement, 'Escape')
    await waitFor(() => document.activeElement === item('Flow…'))
    await act(async () => { item('Flow…')!.click() })
    await waitFor(() => !!item('Sequential'))
    const before = await db.outbox.count()
    await act(async () => { item('Sequential')!.click() })
    await waitFor(async () => (await db.projects.get(id))?.flow_mode === 'sequential')
    expect(await db.outbox.count()).toBe(before + 1)
    const entry = (await db.assistantUndo.toArray()).at(-1)!
    await undoBatch(entry.id)
    expect((await db.projects.get(id))?.flow_mode).toBe('')
    await r.unmount()
  })
})

describe('command palette', () => {
  const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User
  const base = { route: { view: 'project', id: 'p1' }, user, today: '2026-10-30', list: null, filterQuery: null, query: '', vimEnabled: false, showShortcuts: () => {}, focusQuickAdd: () => false } as unknown as PaletteContext
  const ctxFor = (role: 'owner' | 'editor'): PaletteContext => ({ ...base, project: { row: project(), role, shared: role !== 'owner', targets: [], subCount: 0, openTasks: 0 } })

  it('offers "Set project flow…" in every mode to those who may change the project', () => {
    const cmd = commands(ctxFor('owner')).find((c) => c.id === 'project:flow')
    expect(cmd?.label).toBe('Project “Move house”: Set project flow…')
    const step = cmd!.run() as { kind: string; picker: { source: { flow: string }[] } }
    expect(step.kind).toBe('picker')
    expect(step.picker.source.map((c) => c.flow)).toEqual(['parallel', 'sequential', 'area'])
    expect(commands(ctxFor('editor')).some((c) => c.id === 'project:flow')).toBe(false)
  })

  it('the palette does not list the menu choices twice', () => {
    const menu = flatItems(projectMenuGroups(project(), { role: 'owner', shared: false, targets: [], subCount: 0 }, { rename: () => {} }))
    expect(menu.some((i) => i.id.startsWith('flow-'))).toBe(false)
  })
})
