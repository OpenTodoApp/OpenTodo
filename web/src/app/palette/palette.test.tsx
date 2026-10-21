// @vitest-environment happy-dom
// The command palette (OpenSpec change search-and-command-palette, tasks 1.1, 2.1–2.3,
// 3.1, 4.1, 4.2 and 5.2).
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { prepare, prepareQuery, matchPrepared } from '../../ui'
import { createProject, createTask, resetDeviceId } from '../../lib/ops'
import { recordPick } from '../../lib/pickRank'
import type { Task, User } from '../../lib/types'
import { flush, key, render, type } from '../../ui/test-utils'
import { registerListState, type ListState } from '../listActions'
import { navigate, parseRoute, routePath } from '../router'
import { Shell } from '../Shell'
import CommandPalette from './CommandPalette'
import { filterEntries, hasFilterTerm } from './filterEntries'
import { buildEntries, makeTaskEntry } from './index'
import { commands, type PaletteContext } from './registry'
import { parse } from '../../lib/filter'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals() })

async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
const palette = () => document.querySelector('[data-testid="command-palette"]')
const field = () => document.querySelector('input[aria-label="Search tasks, projects and commands"]') as HTMLInputElement
const options = () => [...document.querySelectorAll('[data-palette] [role="option"]')].map((o) => o.textContent ?? '')

const task = (over: Partial<Task>): Task => ({
  id: 't', title: 'Task', description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [], position: 0,
  created_at: 0, completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null, assignee_id: null, _clock: {}, ...over,
} as Task)

describe('opening (1.1)', () => {
  it('Ctrl+K from the Inbox and from a text field, ⌘+K, not in the notes editor; Escape closes', async () => {
    navigate({ view: 'inbox' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await flush(50)
    const ev = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true })
    await act(async () => { document.body.dispatchEvent(ev) })
    await waitFor(() => !!palette())
    expect(ev.defaultPrevented).toBe(true)
    await key(field(), 'Escape')
    await waitFor(() => !palette())

    const quick = document.querySelector('input[aria-label="Add a task"]') as HTMLInputElement
    quick.focus()
    await key(quick, 'k', { metaKey: true })
    await waitFor(() => !!palette())
    await key(field(), 'Escape')
    await waitFor(() => !palette())

    const editor = document.createElement('div')
    editor.className = 'ProseMirror'
    editor.contentEditable = 'true'
    document.body.append(editor)
    const inEditor = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true })
    await act(async () => { editor.dispatchEvent(inEditor) })
    await flush(60)
    expect(palette()).toBeNull()
    expect(inEditor.defaultPrevented).toBe(false)

    await act(async () => { (document.querySelector('[data-palette-button]') as HTMLButtonElement).click() })
    await waitFor(() => !!palette())
    await r.unmount()
  })
})

describe('index (2.1)', () => {
  const entries = (tasks: Task[]) => buildEntries({ tasks, projects: [], labels: [], views: [], user: null })
  const finds = (q: string, label: string, secondary = '') => matchPrepared(prepareQuery(q), prepare(label, secondary), label.length).tier > 0
  it('finds a task by its notes, "cafe" finds "Café", completed after open, deleted never', () => {
    const list = entries([
      task({ id: 'a', title: 'Call the dentist', description: 'Book an appointment for March' }),
      task({ id: 'b', title: 'Café with Ana', completed_at: 1 }),
      task({ id: 'c', title: 'Old', deleted_at: 1 }),
      task({ id: 'd', title: 'Open café' }),
    ])
    const dentist = list.find((e) => e.key === 'task:a')!
    expect(finds('appoint', dentist.label, dentist.secondary)).toBe(true)
    expect(finds('cafe', 'Café with Ana')).toBe(true)
    expect(list.map((e) => e.key)).toEqual(['task:a', 'task:d', 'task:b'])
    expect(list.find((e) => e.key === 'task:b')!.marker).toBe('completed')
  })
  it('finds a task by its origin id and title, from local data (task-origin 3.4)', () => {
    const [e] = entries([task({ id: 'o', title: 'Fix the login timeout', origin: { kind: 'issue', provider: 'linear', id: 'ENG-123', title: 'Login times out' } })])
    expect(finds('eng-123', e.label, e.secondary)).toBe(true)
    expect(finds('times out', e.label, e.secondary)).toBe(true)
    const [plain] = entries([task({ id: 'p', title: 'Fix the login timeout' })])
    expect(finds('eng-123', plain.label, plain.secondary)).toBe(false)
  })
  it('undecryptable rows are indexed by the shown text, never ciphertext', () => {
    const [e] = entries([task({ id: 'x', title: 'eyJjaXBoZXJ0ZXh0', description: 'eyJub3Rlcw', _e2ee: { raw: { title: 'eyJjaXBoZXJ0ZXh0' } } } as unknown as Partial<Task>)])
    expect(e.label).toBe('[Cannot decrypt]')
    expect(e.secondary).not.toContain('eyJ')
  })
  it('folds 5 000 tasks quickly', () => {
    const many = Array.from({ length: 5000 }, (_, i) => task({ id: `t${i}`, title: `Task number ${i} with a longer title`, description: 'some notes here' }))
    // The best of three runs: a busy machine (parallel test workers) only slows some.
    let best = Infinity
    for (let run = 0; run < 3 && best >= 500; run++) {
      const t0 = performance.now()
      const list = entries(many)
      list.forEach((e) => prepare(e.label, e.secondary))
      best = Math.min(best, performance.now() - t0)
    }
    expect(best).toBeLessThan(500)
  })
})

describe('filter entries (3.1)', () => {
  const tasks = [task({ id: 'm', title: 'Milk', labels: ['l1'], priority: 1 }), task({ id: 'n', title: 'Nails', labels: ['l1'], priority: 3 })]
  const ctx = { today: '2026-10-14', labels: [{ id: 'l1', name: 'errand', color: '#000', position: 0, created_at: 0, deleted_at: null, _clock: {} }], projects: [] }
  const te = makeTaskEntry([])
  it('@errand & p1 lists the matching task after "Open in Filter view"', () => {
    const out = filterEntries('@errand & p1', tasks, ctx as never, te)
    expect(out.map((e) => e.key)).toEqual(['filter:@errand & p1', 'task:m'])
  })
  it('a half-typed query and a plain search: nothing extra, no error', () => {
    expect(filterEntries('@errand &', tasks, ctx as never, te)).toEqual([])
    expect(filterEntries('search: milk', tasks, ctx as never, te)).toEqual([])
    expect(filterEntries('ren', tasks, ctx as never, te)).toEqual([])
    expect(hasFilterTerm(parse('search: x')!)).toBe(false)
  })
  it('the Filter view route carries the query', () => {
    expect(parseRoute('/filter?q=%40errand%20%26%20p1')).toEqual({ view: 'filter', q: '@errand & p1' })
    expect(routePath({ view: 'filter', q: 'p1' })).toBe('/filter?q=p1')
  })
})

function ctxFor(over: Partial<PaletteContext> = {}): PaletteContext {
  return { route: { view: 'inbox' }, user, today: '2026-10-14', list: null, filterQuery: null, query: '', vimEnabled: false, showShortcuts: () => {}, focusQuickAdd: () => false, ...over }
}
function listFor(t: Task, readOnly = false): ListState {
  return { rows: () => [t], columns: () => null, selected: () => t.id, select: () => {}, openId: () => null, open: () => {}, readOnly: () => readOnly, manual: () => false, focusQuickAdd: () => false, toggleComplete: async () => {} }
}

describe('registry (4.1, 4.2)', () => {
  it('Save filter as view only on the Filter view; Go to Upcoming navigates', () => {
    expect(commands(ctxFor()).some((c) => c.id === 'filter:save')).toBe(false)
    expect(commands(ctxFor({ route: { view: 'filter' }, filterQuery: 'p1' })).some((c) => c.id === 'filter:save')).toBe(true)
    navigate({ view: 'inbox' })
    commands(ctxFor()).find((c) => c.id === 'go:upcoming')!.run()
    expect(location.pathname).toBe('/upcoming')
  })
  it('Find in the sidebar asks the sidebar to open its field (sidebar-groups 3.3)', async () => {
    const { sidebarFind } = await import('../signals')
    const cmd = commands(ctxFor()).find((c) => c.id === 'app:sidebar-find')!
    expect(cmd.shortcut).toBe('g /')
    cmd.run()
    expect(sidebarFind.take('open')).toBe('open')
  })
  it('New project from a template opens the template dialog (template-library 4.4)', async () => {
    const before = (await import('../TemplateDialogs')).templateRequests()
    commands(ctxFor()).find((c) => c.id === 'new:from-template')!.run()
    expect((await import('../TemplateDialogs')).templateRequests()).toBe(before + 1)
  })
  it('Vim keybindings toggles the preference', async () => {
    const { isVimEnabled } = await import('../vim/prefs')
    commands(ctxFor({ vimEnabled: false })).find((c) => c.id === 'app:vim')!.run()
    expect(isVimEnabled()).toBe(true)
    commands(ctxFor({ vimEnabled: true })).find((c) => c.id === 'app:vim')!.run()
    expect(isVimEnabled()).toBe(false)
  })
  it('task commands: none without a selection, no writes for a read-only task, priority writes an op', async () => {
    expect(commands(ctxFor()).some((c) => c.id.startsWith('task:'))).toBe(false)
    const id = await createTask({ title: 'Report' })
    const t = (await db.tasks.get(id))!
    const ro = commands(ctxFor({ task: t, list: listFor(t, true) })).filter((c) => c.id.startsWith('task:')).map((c) => c.id)
    expect(ro).toEqual(['task:open'])
    await db.outbox.clear()
    await commands(ctxFor({ task: t, list: listFor(t) })).find((c) => c.id === 'task:p1')!.run()
    expect((await db.outbox.toArray()).map((o) => [o.field, o.value])).toEqual([['priority', 1]])
  })
})

describe('the box (2.2, 2.3, 5.2)', () => {
  it('ranks word prefix before fuzzy, lists context commands first when empty, and passes axe', async () => {
    const t = task({ id: 'sel', title: 'Selected one' })
    await db.tasks.put(t)
    const off = registerListState(listFor(t))
    await createTask({ title: 'Pre-sales call' })
    await createTask({ title: 'Renew passport' })
    navigate({ view: 'inbox' })
    const r = await render(<CommandPalette user={user} onClose={() => {}} showShortcuts={() => {}} />)
    await waitFor(() => options().some((o) => o.includes('Open “Selected one”')))
    expect(options()[0]).toContain('Open “Selected one”')
    await type(field(), 'pas')
    await waitFor(() => options().some((o) => o.includes('Renew passport')))
    const labels = options()
    expect(labels.findIndex((o) => o.includes('Renew passport'))).toBeLessThan(labels.findIndex((o) => o.includes('Pre-sales')))
    const axe = (await import('axe-core')).default
    const res = await axe.run(document.querySelector('[data-testid="command-palette"]')!, { rules: { 'color-contrast': { enabled: false } } })
    expect(res.violations.map((v) => v.id)).toEqual([])
    off()
    await r.unmount()
  })

  it('a project picked before ranks first on a tie', async () => {
    const a = await createProject({ name: 'Garden A' })
    const b = await createProject({ name: 'Garden B' })
    await recordPick('palette', `project:${b}`)
    const r = await render(<CommandPalette user={user} onClose={() => {}} showShortcuts={() => {}} />)
    await flush(50)
    await type(field(), 'garden')
    await waitFor(() => options().some((o) => o.includes('Garden A')))
    const labels = options()
    expect(labels.findIndex((o) => o.includes('Garden B'))).toBeLessThan(labels.findIndex((o) => o.includes('Garden A')))
    expect(a).toBeTruthy()
    await r.unmount()
  })

  it('picking a task navigates to its project with the panel open and records the pick; clearLocalData removes it', async () => {
    const home = await createProject({ name: 'Home' })
    await createTask({ title: 'Fix the sink', project_id: home, })
    navigate({ view: 'inbox' })
    let closed = false
    const r = await render(<CommandPalette user={user} onClose={() => { closed = true }} showShortcuts={() => {}} />)
    await flush(50)
    await type(field(), 'fix the sink')
    await waitFor(() => options()[0]?.includes('Fix the sink'))
    await key(field(), 'Enter')
    await waitFor(() => closed)
    expect(location.pathname).toBe(`/project/${home}`)
    await flush(50)
    expect((await db.pickHistory.where('context').equals('palette').toArray()).length).toBe(1)
    const { clearLocalData } = await import('../../lib/db')
    await clearLocalData()
    expect(await db.pickHistory.count()).toBe(0)
    await r.unmount()
  })
})

describe('empty box order (2.2)', () => {
  it('context commands come before recent picks', async () => {
    const id = await createTask({ title: 'Picked before' })
    await recordPick('palette', `task:${id}`)
    const t = task({ id: 'sel2', title: 'Selected two' })
    await db.tasks.put(t)
    const off = registerListState(listFor(t))
    const r = await render(<CommandPalette user={user} onClose={() => {}} showShortcuts={() => {}} />)
    await waitFor(() => options().some((o) => o.includes('Picked before')) && options().some((o) => o.includes('Selected two')))
    const o = options()
    expect(o.findIndex((x) => x.includes('Open “Selected two”'))).toBeLessThan(o.findIndex((x) => x.includes('Picked before')))
    off()
    await r.unmount()
  })
})

describe('commands on ticked tasks (bulk-edit 6.3)', () => {
  it('with three ticked, "Complete 3 tasks" acts on all of them and single-task commands are hidden', async () => {
    const ids = [await createTask({ title: 'a' }), await createTask({ title: 'b' }), await createTask({ title: 'c' })]
    const t = (await db.tasks.get(ids[0]))!
    const list = { ...listFor(t), ticked: () => ids }
    const cmds = commands(ctxFor({ task: t, list }))
    expect(cmds.some((c) => c.id.startsWith('task:'))).toBe(false)
    await cmds.find((c) => c.id === 'sel:complete')!.run()
    for (const id of ids) expect((await db.tasks.get(id))!.completed_at).not.toBeNull()
    expect(cmds.find((c) => c.id === 'sel:complete')!.label).toBe('Complete 3 tasks')
  })
})

describe('sections and shortcuts from the registry (ux-overhaul 6.4, 6.5)', () => {
  const headings = () => [...document.querySelectorAll('[data-palette] [role="presentation"]')].map((h) => h.textContent ?? '')

  it('shows q beside "Quick add a task", from the registry', async () => {
    const { keysOf } = await import('../../lib/shortcuts')
    const r = await render(<CommandPalette user={user} onClose={() => {}} showShortcuts={() => {}} />)
    await flush(50)
    await type(field(), 'quick add')
    await waitFor(() => options().some((o) => o.includes('Quick add a task')))
    const row = options().find((o) => o.includes('Quick add a task'))!
    expect(row).toContain(keysOf('list.quick-add'))
    expect(keysOf('list.quick-add')).toBe('q')
    await r.unmount()
  })

  it('groups results under Tasks, Projects, Labels, Filters, Commands and Settings', async () => {
    await createProject({ name: 'Garden' })
    await createTask({ title: 'Garden hose' })
    const r = await render(<CommandPalette user={user} onClose={() => {}} showShortcuts={() => {}} />)
    await flush(50)
    await type(field(), 'garden')
    await waitFor(() => options().some((o) => o.includes('Garden hose')) && options().some((o) => o === 'Garden' || o.startsWith('Garden')))
    const h = headings()
    expect(h).toContain('Tasks')
    expect(h).toContain('Projects')
    await type(field(), 'settings')
    await waitFor(() => headings().includes('Settings') && headings().includes('Commands'))
    await r.unmount()
  })

  it('an empty box lists recent picks under "Recent", from the pick history', async () => {
    const id = await createTask({ title: 'Picked again' })
    await recordPick('palette', `task:${id}`)
    const r = await render(<CommandPalette user={user} onClose={() => {}} showShortcuts={() => {}} />)
    await waitFor(() => options().some((o) => o.includes('Picked again')))
    expect(headings()[0]).toBe('Recent')
    await r.unmount()
  })
})
