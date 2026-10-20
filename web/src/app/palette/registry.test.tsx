// @vitest-environment happy-dom
// Guard test (OpenSpec change search-and-command-palette, design D6): every item of
// the project, view, label and section menus has a palette command for that row.
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import type { Label, Project, Section, Task, User, View } from '../../lib/types'
import type { ListState } from '../listActions'
import { render } from '../../ui/test-utils'
import { labelMenuGroups } from '../LabelsView'
import { ActionMenu, type ActionGroup } from '../menus/ActionMenu'
import { projectMenuGroups } from '../ProjectHeader'
import { sectionMenuGroups } from '../Sections'
import { viewMenuGroups } from '../ViewsView'
import { HUES } from '../../ui'
import { commands, type PaletteContext } from './registry'

afterEach(() => { document.body.innerHTML = '' })

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User
const project = { id: 'p1', name: 'Home', color: '#000', position: 0, archived: false, parent_id: null, created_at: 0, deleted_at: null, _clock: {} } as Project
const view = { id: 'v1', name: 'Deep work', pinned: true, kind: 'list', query: 'p1', position: 0 } as View
const other = { ...view, id: 'v2', name: 'Other', position: 1 } as View
const label = { id: 'l1', name: 'errand', color: '#000', position: 0, created_at: 0, deleted_at: null, _clock: {} } as Label
const label2 = { ...label, id: 'l2', name: 'call', position: 1 } as Label
const section = { id: 's1', name: 'Backlog', project_id: 'p1', position: 0, created_at: 0, deleted_at: null, _clock: {} } as Section

const ctx: PaletteContext = {
  route: { view: 'project', id: 'p1' }, user, today: '2026-10-14', list: null, filterQuery: null, query: '', vimEnabled: false,
  showShortcuts: () => {}, focusQuickAdd: () => false,
  project: { row: project, role: 'owner', shared: false, targets: [{ id: '', name: 'Top level', path: [] }, { id: 'p2', name: 'Work', path: [] }], subCount: 0, openTasks: 2 },
  // A middle row, so neither "Move up" nor "Move down" is disabled.
  view: { row: other, peers: [view, other, { ...view, id: 'v3', position: 2 } as View], isStart: false },
  label: { row: label2, labels: [label, label2, { ...label, id: 'l3', position: 2 } as Label] },
  section: { row: section, first: false, last: false, layout: 'list', count: 1 },
}

async function menuLabels(groups: ActionGroup[], header?: React.ReactNode): Promise<string[]> {
  const r = await render(<ActionMenu label="Menu" groups={groups} header={header} open onOpenChange={() => {}} />)
  const out = [...document.querySelectorAll('[data-menu-label]')].map((e) => e.getAttribute('data-menu-label')!)
  await r.unmount()
  document.body.innerHTML = ''
  return out
}

const noop = () => {}
const menus: [string, () => Promise<string[]>][] = [
  ['project', () => menuLabels(projectMenuGroups(project, ctx.project!, { rename: noop, pin: noop }), <>{HUES.map((h) => <button key={h.name} data-menu-label={`Colour ${h.name}`} />)}</>)],
  ['view', () => menuLabels(viewMenuGroups(other, ctx.view!.peers, false, { rename: noop, move: noop, pin: noop, startView: noop, remove: noop }))],
  ['label', () => menuLabels(labelMenuGroups(label2, ctx.label!.labels, { edit: noop, rename: noop, move: noop, pin: { checked: false, toggle: noop } }))],
  ['section', () => menuLabels(sectionMenuGroups('Backlog', ctx.section!, { rename: noop, move: noop, remove: noop }))],
]

describe('registry completeness', () => {
  // Items that open a step are shown with a trailing ellipsis.
  const norm = (l: string) => l.replace(/…$/, '')
  const available = new Set(commands(ctx).map((c) => `${c.id.split(':')[0]}|${norm(c.menuLabel ?? '')}`))
  it.each(menus)('every %s menu item has a command', async (kind, labelsOf) => {
    const labels = await labelsOf()
    expect(labels.length).toBeGreaterThan(2)
    const missing = labels.filter((l) => !available.has(`${kind}|${norm(l)}`))
    expect(missing, `no palette command for the ${kind} menu item(s): ${missing.join(', ')}`).toEqual([])
  })

  it('Pin to sidebar is a command for projects and labels too (sidebar-favourites)', () => {
    expect(available.has('project|Pin to sidebar')).toBe(true)
    expect(available.has('label|Pin to sidebar')).toBe(true)
    expect(available.has('view|Pin to sidebar')).toBe(true)
  })

  it('Go to Projects opens the All projects page with g Shift+P', () => {
    const go = commands(ctx).find((c) => c.label === 'Go to Projects')
    expect(go?.shortcut).toBe('g Shift+P')
  })

  it('names a planted menu item that has no command', async () => {
    const planted = await menuLabels([{ items: [{ kind: 'action', id: 'x', label: 'Teleport', onSelect: noop }] }])
    expect(planted.filter((l) => !available.has(`project|${norm(l)}`))).toEqual(['Teleport'])
  })
})

describe('Focus commands (focus-mode D8)', () => {
  const task = { id: 't1', title: 'Write the report', completed_at: null, deleted_at: null } as unknown as Task
  const list = { readOnly: () => false, open: () => {}, toggleComplete: () => {} } as unknown as ListState
  const base: PaletteContext = { ...ctx, project: undefined, view: undefined, label: undefined, section: undefined, route: { view: 'inbox' } }
  const focusLabels = (c: PaletteContext) => commands(c).filter((x) => /focus/i.test(x.label)).map((x) => x.label)

  it('lists "Focus on <title>" for the selected task, running the same navigation as the panel menu', () => {
    const cmds = commands({ ...base, list, task })
    expect(focusLabels({ ...base, list, task })).toEqual(['Focus on “Write the report”', 'Go to Focus'])
    cmds.find((x) => x.id === 'task:focus')!.run()
    expect(location.pathname).toBe('/focus/t1')
  })

  it('without a selected task only "Go to Focus", with its shortcut', () => {
    expect(focusLabels(base)).toEqual(['Go to Focus'])
    expect(commands(base).find((x) => x.id === 'go:focus')?.shortcut).toBe('g Shift+F')
  })
})
