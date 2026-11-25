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

// Each surface and the plain writes it must no longer call: they write without a step.
const SURFACES: Record<string, RegExp> = {
  'FilterView.tsx': /setTaskCompletedWithFeedback/,
  'SavedViewView.tsx': /setTaskCompletedWithFeedback/,
  'DashboardView.tsx': /setTaskCompletedWithFeedback/,
  'useListKeys.ts': /setTaskCompletedWithFeedback/,
  'review/ReviewView.tsx': /setTaskCompletedWithFeedback/,
  'review/DailyCheck.tsx': /setTaskCompletedWithFeedback/,
  'review/MonthlyLook.tsx': /setTaskCompletedWithFeedback/,
  'method/MethodListView.tsx': /setTaskCompletedWithFeedback/,
  'method/loop/rows.tsx': /setTaskCompletedWithFeedback/,
  'task-list/useListDrag.ts': /\bmoveTask\(/,
  'task-list/useBoardMoves.ts': /\bmoveTaskToSection\(/,
  'task-detail/Facets.tsx': /\bmoveTaskToSection\(/,
  'task-detail/subtaskOrder.ts': /\bmoveTask(By)?\(/,
  'task-list/useListShortcuts.ts': /\bmoveTaskBy\(/,
  'TaskListView.tsx': /\bmoveTaskBy\(/,
  'vim/actions.ts': /\bmoveTaskBy\(/,
  'Sections.tsx': /\bdeleteSection\(/,
  'palette/registry.ts': /\bdeleteSection\(/,
  'LabelsView.tsx': /\b(deleteLabel|mergeLabels)\(/,
  'FieldsDialog.tsx': /\bdeleteField\(/,
}

describe('every surface writes through the undoable step', () => {
  for (const [file, plain] of Object.entries(SURFACES)) {
    it(file, () => {
      expect(src(file), file).not.toBe('')
      expect(src(file)).not.toMatch(plain)
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
