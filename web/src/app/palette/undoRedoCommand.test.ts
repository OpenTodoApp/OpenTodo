// @vitest-environment happy-dom
// The command palette's Undo and Redo (multi-step undo/redo, #1488): offered only when the
// device has that direction of history, named for the step (the batch's label).
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import type { User } from '../../lib/types'
import { commands, type PaletteContext } from './registry'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User
const base: PaletteContext = {
  route: { view: 'today' }, user, today: '2026-11-20', list: null, filterQuery: null, query: '', vimEnabled: false,
  showShortcuts: () => {}, focusQuickAdd: () => false,
}
const cmd = (ctx: PaletteContext, id: string) => commands(ctx).find((c) => c.id === id)

describe('palette Undo / Redo', () => {
  it('are absent when the device has no history', () => {
    expect(cmd(base, 'app:undo')).toBeUndefined()
    expect(cmd(base, 'app:redo')).toBeUndefined()
  })

  it('appear when the direction is possible, named for the step and carrying the shortcut', () => {
    const ctx: PaletteContext = { ...base, history: { undo: { id: 'u', label: 'Complete 2 tasks', count: 2 }, redo: { id: 'r', count: 1 } } }
    const undo = cmd(ctx, 'app:undo')
    expect(undo?.label).toBe('Undo: Complete 2 tasks')
    expect(undo?.shortcut).toBeTruthy()
    // No label on the batch falls back to the generic name.
    expect(cmd(ctx, 'app:redo')?.label).toBe('Redo the change undone last')
  })

  it('offers only the direction that is possible', () => {
    const undoOnly: PaletteContext = { ...base, history: { undo: { id: 'u', count: 1 }, redo: null } }
    expect(cmd(undoOnly, 'app:undo')).toBeDefined()
    expect(cmd(undoOnly, 'app:redo')).toBeUndefined()
  })
})
