// Set time sector… in the command palette (OpenSpec change time-sectors, task 3.3):
// offered for a selection while the switch is on, one batch for the planned tasks
// with one Undo, repeating tasks skipped and counted in the toast. No shortcut.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from '../../lib/db'
import { createTask, resetDeviceId } from '../../lib/ops'
import { currentPeriods } from '../../lib/sectors'
import type { Task, User } from '../../lib/types'
import { undoBatch } from '../../lib/undo'
import { bulkToast } from '../bulk/toastStore'
import type { ListState } from '../listActions'
import { commands, runSector, type PaletteContext } from './registry'

let n = 0
beforeEach(() => {
  useDatabase(`sector-command-${Date.now()}-${n++}`)
  resetDeviceId()
})

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User
const base = (ticked: string[], timeSectors: boolean): PaletteContext => ({
  route: { view: 'inbox' }, user, today: '2026-10-28', filterQuery: null, query: '', vimEnabled: false, timeSectors,
  showShortcuts: () => {}, focusQuickAdd: () => false,
  list: { ticked: () => ticked, readOnly: () => false, open: () => {}, toggleComplete: () => {} } as unknown as ListState,
})

describe('Set time sector…', () => {
  it('is offered for a selection only while time sectors are on, with no shortcut', () => {
    const on = commands(base(['a', 'b'], true)).find((c) => c.id === 'sel:sector')
    expect(on?.label).toBe('Set time sector for 2 tasks…')
    expect(on?.shortcut).toBeUndefined()
    expect(commands(base(['a', 'b'], false)).some((c) => c.id === 'sel:sector')).toBe(false)
  })

  it('plans four tasks for This month, skips the repeating one, and one Undo reverts the four', async () => {
    const ids = [
      await createTask({ title: 'One', due: { date: '2026-10-29' } }),
      await createTask({ title: 'Two' }),
      await createTask({ title: 'Three', start: 'someday' }),
      await createTask({ title: 'Four', deadline: '2026-11-20' }),
      await createTask({ title: 'Gym', due: { date: '2026-10-29' }, recurrence: 'every monday' }),
    ]
    const month = currentPeriods('2026-10-28', 1)['this-month']
    await runSector(ids, month, 'This month')
    const tasks = (await db.tasks.bulkGet(ids)) as Task[]
    expect(tasks.map((t) => t.sector ?? '')).toEqual([month, month, month, month, ''])
    expect(tasks[0].due).toBeNull()
    expect(tasks[2].start).toBeNull()
    expect(tasks[3].deadline).toBe('2026-11-20')
    expect(tasks[4].due).toEqual({ date: '2026-10-29' })
    const toast = bulkToast()
    expect(toast?.label).toBe('4 tasks planned for This month. 1 repeating task skipped')
    await undoBatch(toast!.undoId!)
    const back = (await db.tasks.bulkGet(ids)) as Task[]
    expect(back.map((t) => t.sector ?? '')).toEqual(['', '', '', '', ''])
    expect(back[0].due).toEqual({ date: '2026-10-29' })
    expect(back[2].start).toBe('someday')
  })
})
