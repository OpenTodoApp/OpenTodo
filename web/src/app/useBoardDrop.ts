// Drops on a board of filters (OpenSpec change rule-boards, design D5–D6): the
// destination panel's on-drop rule applied through dropOnPanel, the undo toast,
// and the held card, a device-only marker that keeps a dropped task shown in the
// column it was dropped on while it does not match that column's filter. A held
// card is never written or synced; it ends when the board unmounts, when the task
// changes again (its clocks differ) or when it starts matching.
import { useCallback, useMemo, useRef, useState } from 'react'
import type { RuleNames } from '../lib/rules'
import type { Section, Task, View } from '../lib/types'
import { dropOnPanel } from '../lib/undoActions'
import type { PanelState, ViewContext } from '../lib/views'
import { showUndoToast } from './bulk/toastStore'

interface Held { taskId: string; clock: string }

const clockOf = (task: Pick<Task, '_clock'> | undefined) => JSON.stringify(task?._clock ?? null)

export interface BoardDrop {
  /** Per panel (view id), the held task to show first, marked "Not matching". */
  held: Map<string, Task>
  /** Apply the panel view's rule to a task; resolves with the task's id afterwards. */
  drop: (taskId: string, view: View) => Promise<string | null>
}

export function useBoardDrop(panels: PanelState[], ctx: ViewContext, sections: readonly Section[]): BoardDrop {
  const [heldRaw, setHeldRaw] = useState<Map<string, Held>>(() => new Map())
  const latest = useRef({ ctx, sections })
  latest.current = { ctx, sections }

  const held = useMemo(() => {
    const out = new Map<string, Task>()
    const byId = new Map(ctx.tasks.map((tk) => [tk.id, tk]))
    for (const p of panels) {
      if (p.kind !== 'view') continue
      const h = heldRaw.get(p.id)
      const task = h ? byId.get(h.taskId) : undefined
      if (!h || !task || task.deleted_at || clockOf(task) !== h.clock) continue
      if (p.summary.ok && p.summary.tasks.some((tk) => tk.id === task.id)) continue
      out.set(p.id, task)
    }
    return out
  }, [panels, heldRaw, ctx.tasks])

  const drop = useCallback(async (taskId: string, view: View): Promise<string | null> => {
    const { ctx: c, sections: secs } = latest.current
    const names: RuleNames = { labels: c.labels, projects: c.projects, sections: secs }
    const r = await dropOnPanel(taskId, view, { filter: c, names, today: c.today })
    showUndoToast(r.label, r.entry?.id ?? null)
    if (!r.changed) return r.taskId
    const after = r.row
    setHeldRaw((prev) => {
      const next = new Map(prev)
      for (const [k, v] of next) if (v.taskId === taskId || v.taskId === r.taskId) next.delete(k)
      if (!r.matches && after) next.set(view.id, { taskId: r.taskId, clock: clockOf(after) })
      return next
    })
    return r.taskId
  }, [])

  return { held, drop }
}
