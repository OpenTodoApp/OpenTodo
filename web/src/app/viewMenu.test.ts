import { describe, expect, it } from 'vitest'
import type { View } from '../lib/types'
import { viewMenuGroups } from './ViewsView'

const view = (id: string, pinned = false): View => ({ id, name: id.toUpperCase(), kind: 'list', query: 'p1', panels: [], pinned, position: 1, created_at: 0, deleted_at: null, _clock: {} } as unknown as View)
const noop = { rename: () => {}, move: () => {}, pin: () => {}, startView: () => {}, remove: () => {} }
const flat = (g: ReturnType<typeof viewMenuGroups>) => g.flatMap((x) => x.items)

describe('view menu groups (labels-and-menus 2.1)', () => {
  it('orders rename, checks, moves, then delete last', () => {
    const v = view('a')
    expect(flat(viewMenuGroups(v, [v, view('b')], false, noop)).map((i) => i.id)).toEqual(['rename', 'pin', 'start', 'up', 'down', 'delete'])
    expect(flat(viewMenuGroups(v, [v], false, noop)).at(-1)).toMatchObject({ kind: 'confirm', tone: 'danger' })
  })

  it('shows pinned and start view as checked states', () => {
    const v = view('a', true)
    const items = flat(viewMenuGroups(v, [v], true, noop))
    expect(items.find((i) => i.id === 'pin')).toMatchObject({ kind: 'check', checked: true, label: 'Pin to sidebar' })
    expect(items.find((i) => i.id === 'start')).toMatchObject({ kind: 'check', checked: true, disabled: true })
  })

  it('disables moves at the edges with a reason', () => {
    const a = view('a'), b = view('b'), c = view('c')
    const first = flat(viewMenuGroups(a, [a, b, c], false, noop))
    expect(first.find((i) => i.id === 'up')).toMatchObject({ disabled: true, reason: 'Already first' })
    expect(first.find((i) => i.id === 'down')).toMatchObject({ disabled: false })
    const last = flat(viewMenuGroups(c, [a, b, c], false, noop))
    expect(last.find((i) => i.id === 'down')).toMatchObject({ disabled: true, reason: 'Already last' })
  })

  it('confirms deletion and says tasks are not affected', () => {
    const v = view('a')
    const del = flat(viewMenuGroups(v, [v], false, noop)).find((i) => i.id === 'delete')
    expect(del?.kind).toBe('confirm')
    if (del?.kind === 'confirm') expect(String(del.confirm.body)).toContain('Your tasks are not affected')
  })
})
