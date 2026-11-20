// The undo/redo history model (OpenSpec change undo-redo-history, #1488): the batch log read
// as two stacks. Undo takes the most recent batch not yet undone; redo the one undone most
// recently. (Reversal itself is covered by undo.test / undoRedo.test; the keyboard surface by
// bulk.test.)
import { describe, expect, it } from 'vitest'
import type { AssistantUndo } from './db'
import { topRedo, topUndo } from './undo'

const entry = (over: Partial<AssistantUndo>): AssistantUndo =>
  ({ id: 'x', created_at: 0, count: 1, inverse: [], clocks: [], source: 'action', ...over })

describe('the stack tops', () => {
  it('topUndo is the most recent batch not yet undone', () => {
    const entries = [
      entry({ id: 'a', created_at: 10 }),
      entry({ id: 'b', created_at: 30, label: 'B' }),
      entry({ id: 'c', created_at: 20, undone_at: 99 }), // already undone: not an undo candidate
    ]
    expect(topUndo(entries)).toEqual({ id: 'b', label: 'B', count: 1 })
  })

  const redo = { inverse: [], clocks: [] }

  it('topRedo is the batch undone most recently; null when none is undone', () => {
    expect(topRedo([entry({ id: 'a', created_at: 10 })])).toBeNull()
    const entries = [
      entry({ id: 'a', created_at: 10, undone_at: 50, redo }),
      entry({ id: 'b', created_at: 20, undone_at: 70, redo }),
    ]
    expect(topRedo(entries)).toEqual({ id: 'b', count: 1 })
  })

  it('skips an undone batch with no redo payload (undone before the feature shipped)', () => {
    const entries = [
      entry({ id: 'old', created_at: 10, undone_at: 70 }), // no redo: cannot be redone
      entry({ id: 'new', created_at: 20, undone_at: 50, redo }),
    ]
    expect(topRedo(entries)).toEqual({ id: 'new', count: 1 })
    expect(topRedo([entry({ id: 'old', created_at: 10, undone_at: 70 })])).toBeNull()
  })

  it('both are null on an empty history', () => {
    expect(topUndo([])).toBeNull()
    expect(topRedo([])).toBeNull()
  })

  it('carries the label only when the batch had one', () => {
    expect(topUndo([entry({ id: 'a', created_at: 1 })])).toEqual({ id: 'a', count: 1 })
    expect(topUndo([entry({ id: 'a', created_at: 1, label: 'Complete 2 tasks', count: 2 })])).toEqual({ id: 'a', label: 'Complete 2 tasks', count: 2 })
  })
})
