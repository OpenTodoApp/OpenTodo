// A project board's column moves and folds (board-view, board-polish), with its
// Completed column (board-completed-column): a move there completes the task as its
// checkbox does, a completed card moved to a section reopens there in one batch.
import { useCallback, type RefObject } from 'react'
import { COMPLETED_COLUMN } from '../../lib/listGroups'
import { effectiveSection, moveTaskToSection, setSectionCollapsed } from '../../lib/sections'
import { reopenInto } from './boardReopen'
import type { Section, Task } from '../../lib/types'
import { act } from '../actionError'
import { withListTransition } from '../motion'

export function useBoardMoves(projectId: string | null, collapsedSections: readonly string[], sectionMap: Map<string, Section>,
  complete: RefObject<(id: string, completed: boolean) => Promise<void>>) {
  const toggleSection = useCallback((key: string, force?: boolean) => {
    if (!projectId) return
    // The Completed column is folded by default: its key in the fold state means unfolded (D2).
    if (key === COMPLETED_COLUMN) act(setSectionCollapsed(projectId, key, !(force ?? collapsedSections.includes(key))))
    else act(setSectionCollapsed(projectId, key, force ?? !collapsedSections.includes(key)))
  }, [projectId, collapsedSections])
  /** Move a top-level task to a section ('' = none); a no-op when it is already there. */
  const moveToSection = useCallback((task: Task, key: string) => {
    if (key === COMPLETED_COLUMN) {
      if (!task.completed_at) act(complete.current(task.id, true))
      return
    }
    if (task.completed_at) return act(reopenInto(task, key || null))
    if ((effectiveSection(task, sectionMap) ?? '') === key) return
    act(withListTransition(1, () => moveTaskToSection(task.id, key || null)))
  }, [sectionMap, complete])
  return { toggleSection, moveToSection }
}
