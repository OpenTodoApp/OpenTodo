// The focus picker (OpenSpec change phone-touch-focus, design D3, D4), loaded when
// first asked for: a task for an empty Bento slot or for the Three tasks focus (the
// Combobox over the open tasks not in the focus, today's and overdue first, those
// whose estimate fits the slot first), or a slot for one task (the Daily check's slot
// menu). Every choice goes through the rules `f` follows and ends in a toast with Undo.
import { useMemo } from 'react'
import { bentoSize, type BentoSlot } from '../../lib/bento'
import { freeSlots, SLOT_HINTS, SLOT_NAMES, withRemoved } from '../../lib/bentoSlots'
import { todayList } from '../../lib/dayLists'
import { formatMinutes } from '../../lib/duration'
import { bentoOf, estimateAndPlace, placeFocus, pressFocus, type FocusContext, type FocusOutcome } from '../../lib/focusEdit'
import { t } from '../../lib/i18n'
import { useLiveTasks } from '../../lib/liveTasks'
import { useAllProjects, useMembershipMap, useReviewRow, useUserPrefsRow } from '../../lib/localData'
import { storedFocus } from '../../lib/review'
import { canEditTask } from '../../lib/sharing'
import type { Task } from '../../lib/types'
import { ComboboxPanel, Dialog } from '../../ui'
import { act } from '../actionError'
import { SlotChooser } from '../review/BentoSlots'
import { useToday } from '../useViews'
import { showFocusOutcome } from './focusActions'
import type { FocusPickRequest } from './focusRequest'

/** At most this many tasks without a query; typing searches them all. */
const LIMIT = 60

/**
 * The picker's tasks (D4): open, live, outside archived projects and not in today's
 * focus; today's and overdue first, then the rest, and for a slot the tasks whose
 * estimate suggests it first in each group, then those without an estimate.
 */
export function focusCandidates(tasks: readonly Task[], archived: ReadonlySet<string>, focus: readonly string[], today: string, slot: BentoSlot | null): { task: Task; today: boolean }[] {
  const taken = new Set(focus)
  const open = tasks.filter((x) => !x.completed_at && !x.deleted_at && !taken.has(x.id) && !(x.project_id && archived.has(x.project_id)))
  const todays = todayList(open, today)
  const inToday = new Set(todays.map((x) => x.id))
  const fit = (x: Task) => {
    if (!slot) return 0
    const size = bentoSize(x.estimate_minutes)
    return size === slot ? 0 : size === null ? 1 : 2
  }
  const order = (list: Task[]) => list.map((x, i) => ({ x, i })).sort((a, b) => fit(a.x) - fit(b.x) || a.i - b.i).map((e) => e.x)
  return [
    ...order(todays).map((task) => ({ task, today: true })),
    ...order(open.filter((x) => !inToday.has(x.id))).map((task) => ({ task, today: false })),
  ]
}

export default function FocusPicker({ request, onClose }: { request: FocusPickRequest; onClose: () => void }) {
  const tasks = useLiveTasks()
  const projects = useAllProjects()
  const memberships = useMembershipMap()
  const review = useReviewRow()
  const prefs = useUserPrefsRow()
  const today = useToday()
  const ctx: FocusContext | null = tasks ? { review, prefs, today, tasks } : null
  const slot = request.mode === 'task' ? request.slot : null
  const archived = useMemo(() => new Set(projects.filter((p) => p.archived || p.deleted_at).map((p) => p.id)), [projects])
  const items = useMemo(() => (tasks ? focusCandidates(tasks, archived, storedFocus(review, today), today, slot) : []), [tasks, archived, review, today, slot])
  // The picker closes on a choice; the outcome is a toast with Undo, or (Bento without an
  // estimate) the slot menu, which the outcome asks the host for.
  const run = (p: Promise<FocusOutcome>) => { onClose(); act(p.then(showFocusOutcome)) }

  if (request.mode === 'slot') {
    const chosen = tasks?.find((x) => x.id === request.taskId)
    if (!ctx || !chosen) return null
    return (
      <SlotChooser task={chosen} free={freeSlots(withRemoved(bentoOf(ctx), chosen.id))} editable={canEditTask(chosen, memberships)}
        onPick={(s) => run(placeFocus(ctx, chosen, s))}
        onEstimate={(minutes) => run(estimateAndPlace(ctx, chosen, minutes))}
        onClose={onClose} />
    )
  }
  const title = slot ? t('Choose a task for the {slot} slot', { slot: SLOT_NAMES[slot] }) : t('Add to focus')
  return (
    <Dialog title={title} size="sm" placement="sheet" onClose={onClose} testId="focus-picker">
      {slot && <p className="mb-2 text-meta text-muted" data-focus-picker-hint>{SLOT_HINTS[slot]}</p>}
      <ComboboxPanel<{ task: Task; today: boolean }> label={title} placeholder={t('Find a task…')} emptyText={t('No open task matches.')} source={items} limit={LIMIT}
        getKey={(x) => x.task.id} getLabel={(x) => x.task.title || t('Untitled')}
        getSecondary={(x) => (x.task.estimate_minutes ? formatMinutes(x.task.estimate_minutes) : undefined)}
        getGroup={(x) => (x.today ? t('Today') : t('Other tasks'))}
        onPick={(x) => { if (ctx) run(slot ? placeFocus(ctx, x.task, slot) : pressFocus(ctx, x.task)) }}
        onClose={onClose} />
    </Dialog>
  )
}
