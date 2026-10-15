// OpenSpec bulk-edit 2.2: Vim's `x` and `dd` act on the ticked tasks when there are any.
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from '../../lib/db'
import { createTask, resetDeviceId } from '../../lib/ops'
import type { ListState } from '../listActions'
import { makeListActions } from './actions'

let n = 0
beforeEach(() => { useDatabase(`vim-bulk-${Date.now()}-${n++}`); resetDeviceId() })

function state(rows: string[], ticked: string[]): ListState {
  const tasks = rows.map((id) => ({ id } as never))
  return {
    rows: () => tasks, columns: () => null, selected: () => rows[0], select: () => {}, openId: () => null, open: () => {},
    readOnly: () => false, manual: () => false, focusQuickAdd: () => false, toggleComplete: async () => {}, ticked: () => ticked,
  }
}

describe('vim actions on a selection', () => {
  it('x completes every ticked task; dd trashes them', async () => {
    const ids = [await createTask({ title: 'a' }), await createTask({ title: 'b' })]
    await makeListActions(state(ids, ids)).toggleCompleteSelected()
    for (const id of ids) expect((await db.tasks.get(id))!.completed_at).not.toBeNull()
    await makeListActions(state(ids, ids)).deleteSelected()
    for (const id of ids) expect((await db.tasks.get(id))!.deleted_at).not.toBeNull()
  })
})
