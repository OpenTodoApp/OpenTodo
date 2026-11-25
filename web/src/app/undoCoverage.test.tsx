// OpenSpec change undo-coverage: every surface that ticks a task, moves one row or
// deletes a section, a label or a field writes one undoable step and offers the same
// Undo toast as the main list.
// @vitest-environment happy-dom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, waitFor } from '../ui/test-utils'
import { db, useDatabase } from '../lib/db'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import { createSection } from '../lib/sections'
import type { Section, Task } from '../lib/types'
import { bulkToast, hideBulkToast } from './bulk/toastStore'
import { undoToast } from './bulk/UndoToast'
import { installShortcutDispatcher, resetShortcutScopes } from './shortcuts/dispatch'
import { useListKeys } from './useListKeys'
import { useBoardMoves } from './task-list/useBoardMoves'

const sources = import.meta.glob('./**/*.{ts,tsx}', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>
const src = (file: string) => sources[`./${file}`] ?? ''

// Each surface, the undoable call it must make, and the plain writes it must not
// use: a direct op write, or the completion without a step.
const PLAIN = /\b(mutate|mutateMany|setTaskCompletedWithFeedback|setTaskCompleted|completeTask|planTask(Move|Step|ToSection)|planDelete(Section|Label)|planMergeLabels)\(/
const SURFACES: Record<string, RegExp> = {
  'FilterView.tsx': /\bcompleteWithUndo\(tk\.id/,
  'SavedViewView.tsx': /\bcompleteWithUndo\(tk\.id/,
  'DashboardView.tsx': /\bcompleteWithUndo\(f\.tasks\[f\.cur\]\.id/,
  'useListKeys.ts': /toggleComplete: \(id, completed\) => completeWithUndo\(id, completed\)/,
  'review/ReviewView.tsx': /\bcompleteWithUndo\(item\.id/,
  'review/DailyCheck.tsx': /\bcompleteWithUndo\(task\.id/,
  'review/MonthlyLook.tsx': /\bcompleteWithUndo\(task\.id/,
  'method/MethodListView.tsx': /\bcompleteWithUndo\(task\.id/,
  'method/loop/rows.tsx': /\bcompleteWithUndo\(task\.id/,
  'task-list/useListDrag.ts': /\bmoveRowWithUndo\(task\.id, \{ \.\.\.entry/,
  'task-list/useBoardMoves.ts': /\bsectionMoveWithUndo\(task\.id/,
  'task-detail/Facets.tsx': /\bsectionMoveWithUndo\(task\.id/,
  'task-detail/subtaskOrder.ts': /\bstepRowWithUndo\(c\.id[\s\S]*\bmoveRowWithUndo\(d\.id/,
  'task-list/useListShortcuts.ts': /\bstepRowWithUndo\(selectedId/,
  // The list's wiring is the hook both list screens draw from (phone-lists D1).
  'task-list/useListScreen.tsx': /\bstepRowWithUndo\(id, step\)/,
  'vim/actions.ts': /\bstepRowWithUndo\(task\.id/,
  'Sections.tsx': /withUndoToast\(deleteSectionUndoable\(section\.id\)\)/,
  'palette/registry.ts': /withUndoToast\(deleteSectionUndoable\(s\.row\.id\)\)/,
  'LabelsView.tsx': /withUndoToast\(mergeLabelsUndoable\([\s\S]*withUndoToast\(deleteLabelUndoable\(/,
  'FieldsDialog.tsx': /withUndoToast\(deleteFieldUndoable\(removing\.id\)\)/,
}

describe('every surface writes through the undoable step', () => {
  for (const [file, undoable] of Object.entries(SURFACES)) {
    it(file, () => {
      expect(src(file), file).toMatch(undoable)
      expect(src(file)).not.toMatch(PLAIN)
    })
  }
})

let n = 0
let release = () => {}
beforeEach(() => {
  useDatabase(`undo-coverage-app-${Date.now()}-${n++}`)
  resetDeviceId()
  release = installShortcutDispatcher()
})
afterEach(() => { release(); resetShortcutScopes(); act(() => hideBulkToast()) })

const press = (key: string) => act(async () => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })) })

function ListKeys({ task }: { task: Task }) {
  useListKeys({ rows: [{ key: task.id, task }], selected: task.id, setSelected: () => {}, openId: null, setOpenId: () => {}, pickerFor: null, setPickerFor: () => {}, onIdleEscape: () => {} })
  return null
}

describe('ticking a task in a Filter view, a saved view, the reviews and the method lists', () => {
  it('offers Undo, which reopens the task', async () => {
    const id = await createTask({ title: 'Pay rent' })
    const r = await render(<ListKeys task={(await db.tasks.get(id))!} />)
    await press('c')
    await waitFor(() => bulkToast()?.undoId != null, 'the undo toast')
    expect(bulkToast()?.label).toBe('Task completed')
    expect((await db.tasks.get(id))?.completed_at).toBeTruthy()
    await act(() => undoToast(bulkToast()!.undoId!))
    expect((await db.tasks.get(id))?.completed_at).toBeNull()
    await r.unmount()
  })
  it('a repeating task rolls forward, and Undo puts it back on its day', async () => {
    const id = await createTask({ title: 'Water the plants', recurrence: 'every day', due: { date: '2026-10-20' } })
    const r = await render(<ListKeys task={(await db.tasks.get(id))!} />)
    await press('c')
    await waitFor(() => bulkToast()?.undoId != null, 'the undo toast')
    expect((await db.tasks.get(id))?.due?.date).not.toBe('2026-10-20')
    await act(() => undoToast(bulkToast()!.undoId!))
    expect((await db.tasks.get(id))?.due?.date).toBe('2026-10-20')
    expect((await db.tasks.get(id))?.completed_at).toBeNull()
    await r.unmount()
  })
})

describe('a board column move', () => {
  it('names the column and offers Undo, which puts the card back', async () => {
    const pid = await createProject({ name: 'Work' })
    const todo = await createSection(pid, 'To do')
    const doing = await createSection(pid, 'Doing')
    const id = await createTask({ title: 'Report', project_id: pid, section_id: todo })
    const sections = new Map((await db.sections.toArray()).map((s) => [s.id, s] as [string, Section]))
    let move: (task: Task, key: string) => void = () => {}
    function Board() {
      move = useBoardMoves(pid, [], sections, { current: async () => {} }).moveToSection
      return null
    }
    const r = await render(<Board />)
    move((await db.tasks.get(id))!, doing)
    await waitFor(() => bulkToast()?.undoId != null, 'the undo toast')
    expect(bulkToast()?.label).toBe('Moved to Doing')
    expect((await db.tasks.get(id))?.section_id).toBe(doing)
    await act(() => undoToast(bulkToast()!.undoId!))
    expect((await db.tasks.get(id))?.section_id).toBe(todo)
    await r.unmount()
  })
})
