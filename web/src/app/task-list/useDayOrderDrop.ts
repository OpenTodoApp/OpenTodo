// The drag of Today's and Upcoming's day order (OpenSpec change day-manual-order, D2):
// the page's side of useListDrag's `today` source. The resolver and the writer load
// with the page that uses them (bundle budget).
import { useEffect, useMemo, useState, type RefObject } from 'react'
import type { ListGroup, ListRow } from '../../lib/listGroups'
import { canEditTasks, roleOf } from '../../lib/sharing'
import type { Membership, Task } from '../../lib/types'
import type { OrderHost } from '../../lib/viewOrderMove'
import type * as DayOrderDrop from './dayOrderDrop'
import type { TodayListDrop } from './useListDrag'
import type { DragDepth } from './projectGroupPlacement'

export function useDayOrderDrop(host: OrderHost | null, parts: boolean, ticked: ReadonlySet<string>,
  latest: RefObject<{ rows: ListRow[]; groups: readonly ListGroup[] }>, memberships: Map<string, Membership>) {
  const [mod, setMod] = useState<Pick<typeof DayOrderDrop, 'dayOrderDrop' | 'applyDayOrderDrop'>>()
  useEffect(() => {
    if (host && !mod) void import('./dayOrderDrop').then(({ dayOrderDrop, applyDayOrderDrop }) => setMod({ dayOrderDrop, applyDayOrderDrop }))
  }, [host, mod])
  return useMemo(() => {
    if (!host) return undefined
    const canEdit = (task: Task) => canEditTasks(roleOf(task.project_id, memberships))
    return {
      // A ticked task dragged with others moves them all onto the day, without a line (manual-ordering "Drag a task to another day in Upcoming").
      resolve: (task: Task, target: string | null, y: number, _gesture: DragDepth, x: number) => (!mod || (ticked.has(task.id) && ticked.size > 1) ? null
        : mod.dayOrderDrop({ groups: latest.current.groups, parts, canEdit }, task, target, x, y)),
      move: async (id: string, drop: TodayListDrop) => (mod && 'kind' in drop ? mod.applyDayOrderDrop(host, latest.current.rows.map((r) => r.task), id, drop) : undefined),
      contextActions: () => [],
      canEdit: () => false,
    }
  }, [host, mod, parts, ticked, latest, memberships])
}
