// The selection's Actions menu and bar (OpenSpec change bulk-edit, design D3): one
// menu for the ticked tasks (or the cursor task when nothing is ticked), built on
// the shared ActionMenu so its items, pickers, shortcuts and disabled reasons work
// like every other object menu. Moves and assignments go through the review (D6).
import { keysOf } from '../../lib/shortcuts'
import { Kbd } from '../shortcuts/Kbd'
import { createContext, lazy, Suspense, useContext, useEffect, useLayoutEffect, useMemo, useState, type RefObject } from 'react'
import type { Step } from '../../lib/move'
import { allCompleted, applyBulk, commonSharedProject, readTicked, reviewAssign, reviewMove, type BulkAction, type ReviewPlan, useTickedTasks } from '../../lib/bulk'
import { useAllLabels, useLabelsLoaded, useLiveSections, useProjects, useMembershipMapOrLoading, useReviewRow, useUserPrefsRow } from '../../lib/localData'
import { DAY_PARTS, dayPartName, dayPartOf, dayPartsOn, type DayPart } from '../../lib/dayParts'
import { dayPartUndoable, energyUndoable } from '../../lib/undoActions'
import { ENERGY_LEVELS, energyLevelsOn, energyName, energyOf, type Energy } from '../../lib/energy'
import { itemKeywords, projectSource, sectionSource, type PickerItem } from '../../lib/pickerSources'
import { roleOf } from '../../lib/sharing'
import { toggleTracking, useRunningEntry } from '../../lib/timeEntries'
import { act } from '../actionError'
import type { Label, Membership, Priority, Project, Section, Task } from '../../lib/types'
import { DESKTOP_HEADER_QUERY, Icon, Dialog, useFinePointer, useMediaQuery } from '../../ui'
import { Tooltip } from '../../ui'
import { DateField } from '../datetime/DateField'
import { ActionMenu, type ActionGroup, type ActionItem, type ConfirmSpec } from '../menus/ActionMenu'
import { openRowSchedule } from '../task-list/RowSwipe'
import { BulkReview } from './BulkReview'
import { showBulkToast, showUndoToast } from './toastStore'
import { navigate } from '../router'
import { createStore } from '../../lib/store'
import { startFocusOn } from '../focus/startFocus'
import { t } from '../../lib/i18n'
import { priorityName } from '../../lib/priority'
import { withListTransition } from '../motion'
import { slotAction, slotLabel, useSlotState, type SlotState } from '../task-list/slotActions'
import { focusMenuLabel, focusMenuState, runFocusPress, type FocusMenuState } from '../focus/focusRequest'
import { useToday } from '../useViews'
import { UrgencyContext } from '../useUrgency'
import type { Urgency } from '../../lib/urgency'

/** Confirm the trash of more than this many ticked tasks (the keyboard's big selection; a menu click stays immediate). */
export const BULK_TRASH_CONFIRM_ABOVE = 20

/**
 * The keyboard's Delete on the ticked set: a big one asks first (the same way a
 * project delete does), a small one runs at once.
 */
export async function trashTicked(ids: readonly string[]): Promise<void> {
  if (ids.length > BULK_TRASH_CONFIRM_ABOVE) {
    askBulkConfirm({
      title: t('Move {tasks} to the Trash?', { tasks: tasksWord(ids.length) }),
      body: t('They go to the Trash with their subtasks. You can restore them from the Trash.'),
      confirmLabel: t('Move to Trash'),
      onConfirm: () => runBulk(ids, { kind: 'trash' }),
    })
    return
  }
  await runBulk(ids, { kind: 'trash' })
}

// The confirmation asked from code with no menu of its own (below).
const bulkConfirm = createStore<ConfirmSpec | null>('bulkConfirm', null)

/** Apply a bulk action and offer its undo. */
export async function runBulk(ids: readonly string[], action: BulkAction): Promise<void> {
  if (ids.length === 0) return
  // The rows that stay slide into place; more than the cap update at once (motion-v2 D4).
  const r = await withListTransition(ids.length, () => applyBulk(ids, action))
  // Trash keeps its offer longer and offers the way back: a new offer replaces the
  // previous one, so the shorter window must be enough to undo a big delete.
  if (action.kind === 'trash') showBulkToast(r.label, r.undoId, { ttl: TRASH_TOAST_MS, action: { label: t('Show Trash'), run: () => navigate({ view: 'trash' }) } })
  else showBulkToast(r.label, r.undoId)
}

/** How long the bulk Trash offer stays: three times one task's own action window, long enough to undo a big delete. */
export const TRASH_TOAST_MS = 15_000

/**
 * Confirm a large trash from code with no menu of its own (the keyboard's Delete on
 * a big selection): the host in the Shell renders the spec when set, like a menu's
 * confirm step does. The count is checked by the caller, so small deletes stay
 * immediate.
 */
export function askBulkConfirm(spec: ConfirmSpec): void {
  bulkConfirm.set(spec)
}

/** The confirmation now asked, if any. */
export const bulkConfirmSpec = bulkConfirm.get
export const useBulkConfirm = bulkConfirm.use
export function clearBulkConfirm(): void {
  bulkConfirm.set(null)
}

const NO_MEMBER_MAP = new Map<string, Membership>()
const tasksWord = (n: number) => t('{n, plural, one {# task} other {# tasks}}', { n })
const itemKey = (i: PickerItem) => i.key
const itemLabel = (i: PickerItem) => i.label
const itemPath = (i: PickerItem) => i.path

interface Data { tasks: Task[]; labels: Label[]; projects: Project[]; sections: Section[]; memberships: Map<string, Membership>; runningTask?: string | null; dayParts?: boolean
  /** Energy levels on (task-energy D3): the Energy submenu. */
  energy?: boolean
  /** Today with a limit (today-closed-list D3): the one task's slot command. */
  slot?: SlotState
  /** Today's focus (phone-touch-focus D3): the one task's focus command. */
  focus?: FocusMenuState
  /** Every read the items depend on has landed: until then the menu stays closed, so it opens complete (issue 840). */
  ready?: boolean
  /** One task's place in a manually ordered list (accessibility-aa D3): the Reorder items. */
  edges?: { first: boolean; last: boolean } | null }

/**
 * Start or Stop tracking for one task (time-tracking D5): Stop while its entry runs,
 * Start for an open task the user may edit; nothing for a completed or deleted one.
 */
export function trackingItem(task: Task | undefined, runningTask: string | null | undefined, memberships: Map<string, Membership>): ActionGroup['items'] {
  if (!task || task.deleted_at || roleOf(task.project_id, memberships) === 'viewer') return []
  const stop = runningTask === task.id
  if (!stop && task.completed_at) return []
  return [{ kind: 'action', id: 'track', label: stop ? t('Stop tracking') : t('Start tracking'), icon: 'timer', shortcut: keysOf('list.track'),
    onSelect: () => act(toggleTracking(task.id)) }]
}

/**
 * Start focus for one open task the user may edit (focus-everywhere D2): opens
 * the Focus screen on it with a session running (Countdown asks for the length).
 */
export function focusItem(task: Task | undefined, memberships: Map<string, Membership>): ActionGroup['items'] {
  if (!task || task.deleted_at || task.completed_at || roleOf(task.project_id, memberships) === 'viewer') return []
  return [{ kind: 'action', id: 'focus', label: t('Start focus'), icon: 'clock', onSelect: () => act(startFocusOn(task.id)) }]
}

/**
 * Take a slot / Give back the slot (today-closed-list D3): on Today with a limit, for a
 * waiting task or one let in. The list is personal, so a viewer of a shared project may too.
 */
export function slotItem(task: Task | undefined, slot: SlotState | undefined): ActionItem[] {
  const run = task && slot ? slotAction(task.id, slot) : null
  if (!task || !slot || !run) return []
  return [{ kind: 'action', id: 'slot', label: slotLabel(slot), icon: slot === 'waiting' ? 'arrow-up' : 'undo-2', onSelect: run }]
}

/**
 * Add to focus / Put in a slot / Remove from focus (phone-touch-focus D3): today's focus
 * is personal, so a viewer of a shared project may too.
 */
export function todayFocusItem(task: Task | undefined, state: FocusMenuState | undefined): ActionItem[] {
  if (!task || !state) return []
  return [{ kind: 'action', id: 'today-focus', label: focusMenuLabel(state), icon: state === 'remove' ? 'x' : 'sun', onSelect: () => runFocusPress(task.id) }]
}

/**
 * "Day part…" (day-parts D4): while the account uses day parts, a submenu of the
 * four parts, the tasks' common part checked; nothing for a viewer's task.
 */
export function dayPartItem(ids: readonly string[], d: Pick<Data, 'tasks' | 'memberships' | 'dayParts'>): ActionItem[] {
  if (!d.dayParts || d.tasks.length === 0 || d.tasks.some((task) => roleOf(task.project_id, d.memberships) === 'viewer')) return []
  const parts = new Set(d.tasks.map((task) => dayPartOf(task)))
  const common = parts.size === 1 ? [...parts][0] : undefined
  const set = (part: DayPart | null) => async () => {
    const r = await dayPartUndoable(ids, part)
    if (r.entry) showUndoToast(r.label, r.entry.id)
  }
  return [{ kind: 'submenu', id: 'day-part', label: t('Day part'), icon: 'sun', items: ([null, ...DAY_PARTS] as (DayPart | null)[]).map((part) => ({
    kind: 'check' as const, id: `part-${part ?? 'none'}`, label: dayPartName(part), checked: common === part, onSelect: set(part),
  })) }]
}

/**
 * "Energy" (task-energy D6): while the account has Energy levels on, a submenu of
 * Deep, Medium, Low and None, the tasks' common energy checked; nothing for a viewer's task.
 */
export function energyItem(ids: readonly string[], d: Pick<Data, 'tasks' | 'memberships' | 'energy'>): ActionItem[] {
  if (!d.energy || d.tasks.length === 0 || d.tasks.some((task) => roleOf(task.project_id, d.memberships) === 'viewer')) return []
  const levels = new Set(d.tasks.map((task) => energyOf(task)))
  const common = levels.size === 1 ? [...levels][0] : undefined
  const set = (e: Energy | null) => async () => {
    const r = await energyUndoable(ids, e)
    if (r.entry) showUndoToast(r.label, r.entry.id)
  }
  return [{ kind: 'submenu', id: 'energy', label: t('Energy'), icon: 'zap', items: ([...ENERGY_LEVELS, null] as (Energy | null)[]).map((e) => ({
    kind: 'check' as const, id: `energy-${e ?? 'none'}`, label: e ? energyName(e) : t('No energy'), checked: common === e, onSelect: set(e),
  })) }]
}

/**
 * How the list the menu opened on reorders a task (accessibility-aa D3): set by a manually
 * ordered list (a project, the Inbox, a label page's own order), absent everywhere else.
 */
export interface ListReorder {
  /** The same write as the keyboard move (Alt+↑ and Alt+↓) and the drag: works offline. */
  move: (id: string, step: Step) => void
  /** First or last in its list (the items at that edge are disabled); null when the task cannot move. */
  edges: (id: string) => Promise<{ first: boolean; last: boolean } | null>
  /** A tree list (a project, the Inbox): open an inline add line after the task or under it (add-below). */
  add?: { below: (id: string) => void; under: (id: string) => void }
}
export const ListReorderContext = createContext<ListReorder | null>(null)

/**
 * "Reorder" for one task in a manually ordered list (accessibility-aa D3, WCAG 2.2 2.5.7):
 * Move up, Move down, Move to top and Move to bottom, the single-pointer alternative to
 * dragging a row; nothing where the list has no manual order, the task cannot move or is alone.
 */
export function reorderItem(id: string | undefined, r: ListReorder | null | undefined, edges: { first: boolean; last: boolean } | null | undefined): ActionItem[] {
  // Alone in its list, there is nowhere to move it.
  if (!id || !r || !edges || (edges.first && edges.last)) return []
  const first = { disabled: edges.first, reason: t('Already first') }
  const last = { disabled: edges.last, reason: t('Already last') }
  return [{ kind: 'submenu', id: 'reorder', label: t('Reorder'), icon: 'chevrons-up-down', items: [
    { kind: 'action', id: 'move-up', label: t('Move up'), icon: 'arrow-up', shortcut: keysOf('list.move-up'), ...first, onSelect: () => r.move(id, -1) },
    { kind: 'action', id: 'move-down', label: t('Move down'), icon: 'arrow-down', shortcut: keysOf('list.move-down'), ...last, onSelect: () => r.move(id, 1) },
    { kind: 'action', id: 'move-top', label: t('Move to top'), icon: 'arrow-up', shortcut: keysOf('list.move-top'), ...first, onSelect: () => r.move(id, 'top') },
    { kind: 'action', id: 'move-bottom', label: t('Move to bottom'), icon: 'arrow-down', shortcut: keysOf('list.move-bottom'), ...last, onSelect: () => r.move(id, 'bottom') },
  ] }]
}

/**
 * "Add task below" and "Add subtask" for one task of a tree list (OpenSpec change add-below,
 * GitHub issue 1036): an inline line where the new tasks will appear; nothing for a task
 * that cannot move (a viewer's, a completed one) or outside a tree list.
 */
export function addItems(id: string | undefined, r: ListReorder | null | undefined, edges: { first: boolean; last: boolean } | null | undefined): ActionItem[] {
  const add = r?.add
  if (!id || !add || !edges) return []
  return [
    { kind: 'action', id: 'add-below', label: t('Add task below'), icon: 'plus', onSelect: () => add.below(id) },
    { kind: 'action', id: 'add-subtask', label: t('Add subtask'), icon: 'corner-down-right', shortcut: keysOf('list.add-subtask'), onSelect: () => add.under(id) },
  ]
}

/** The menu's groups for the given tasks (exported for the palette and tests). */
const Breakdown = lazy(() => import('../UrgencyChip').then((m) => ({ default: m.UrgencyBreakdown })))

/** "Why here?" under the urgency order (urgency-sort D4): the task's score, component by component. */
function whyItem(why: Urgency | null | undefined): ActionItem[] {
  return why ? [{ kind: 'step', id: 'why', label: t('Why here?'), icon: 'trending-up', step: {
    title: t('Why here?'), render: () => <Suspense fallback={null}><div className="p-3"><Breakdown urgency={why} /></div></Suspense>,
  } }] : []
}

export function bulkMenuGroups(ids: readonly string[], d: Data, a: { review: (title: string, plan: Promise<ReviewPlan>) => void; pickDate: () => void; schedule?: () => void; reorder?: ListReorder | null; why?: Urgency | null }, besideRow = false): ActionGroup[] {
  const n = d.tasks.length
  const reopen = allCompleted(d.tasks)
  const live = d.labels.filter((l) => !l.deleted_at)
  const common = live.filter((l) => d.tasks.length > 0 && d.tasks.every((task) => task.labels.includes(l.id))).map((l) => l.id)
  const projectId = d.tasks[0]?.project_id ?? null
  const oneProject = n > 0 && d.tasks.every((tk) => (tk.project_id ?? null) === projectId)
  const shared = commonSharedProject(d.tasks, d.memberships)
  const members = shared ? d.memberships.get(shared)?.members ?? [] : []
  const run = (action: BulkAction) => () => runBulk(ids, action)
  const complete: ActionItem = { kind: 'action', id: 'complete', label: reopen ? t('Reopen') : t('Complete'), icon: 'check', shortcut: keysOf('list.complete'), onSelect: run({ kind: 'complete' }) }
  // On touch, one task's menu starts with the two swipe actions (phone-v2 D3, WCAG 2.2 2.5.7).
  const swipeTwins = n === 1 && a.schedule
  return [
    ...(swipeTwins ? [{ items: [complete, { kind: 'action', id: 'schedule', label: t('Schedule…'), icon: 'calendar-days', onSelect: a.schedule } as ActionItem] }] : []),
    ...(n === 1 ? [{ items: [...whyItem(a.why), ...slotItem(d.tasks[0], d.slot), ...todayFocusItem(d.tasks[0], d.focus), ...trackingItem(d.tasks[0], d.runningTask, d.memberships), ...focusItem(d.tasks[0], d.memberships)] }] : []),
    ...(swipeTwins ? [] : [{ items: [complete] }]),
    // Beside a row its own Priority and Schedule buttons already offer these.
    // Priority and Date are one row each (a submenu), so the menu fits on the screen;
    // beside a row its own Priority and Schedule buttons already offer them.
    { items: [
      ...(besideRow ? [] : [
        { kind: 'submenu', id: 'priority', label: t('Priority'), icon: 'flag', items: ([1, 2, 3, 4] as Priority[]).map((p) => ({ kind: 'action' as const, id: `p${p}`, label: priorityName(p), icon: 'flag' as const, shortcut: String(p), onSelect: run({ kind: 'priority', priority: p }) })) },
        { kind: 'submenu', id: 'date', label: t('Date'), icon: 'calendar-days', items: [
          { kind: 'action', id: 'today', label: t('Today'), icon: 'calendar-check', onSelect: run({ kind: 'due', pick: 'today' }) },
          { kind: 'action', id: 'tomorrow', label: t('Tomorrow'), icon: 'calendar-days', onSelect: run({ kind: 'due', pick: 'tomorrow' }) },
          { kind: 'action', id: 'next-week', label: t('Next week'), icon: 'calendar-range', onSelect: run({ kind: 'due', pick: 'next-week' }) },
          { kind: 'action', id: 'no-date', label: t('No date'), icon: 'x', onSelect: run({ kind: 'due', pick: null }) },
          { kind: 'action', id: 'pick-date', label: t('Pick a date…'), icon: 'calendar-days', onSelect: a.pickDate },
        ] },
      ] as ActionItem[]),
      ...energyItem(ids, d),
      ...dayPartItem(ids, d),
      { kind: 'picker', id: 'labels', label: t('Labels'), icon: 'tag', shortcut: keysOf('list.labels'), disabled: live.length === 0, reason: t('There are no labels yet'), picker: {
        title: t('Labels'), placeholder: t('Add to all, or remove from all…'), source: live, multiple: true, selected: common, rankContext: 'label',
        getKey: (l: Label) => l.id, getLabel: (l: Label) => l.name,
        // Add or remove is decided from the ticked tasks as stored at the click, not from the
        // menu's read, which can still be loading on a quick pick; the open picker follows the
        // read, so its marks appear when it lands and change after each pick.
        onPick: (l: Label) => { void labelToggle(ids, l.id) },
      } },
    ] },
    { items: [
      ...(n === 1 ? [...addItems(ids[0], a.reorder, d.edges), ...reorderItem(ids[0], a.reorder, d.edges)] : []),
      { kind: 'picker', id: 'move', label: t('Move to project'), icon: 'folder-input', picker: {
        title: t('Move to project'), placeholder: t('Find a project…'), source: projectSource(d.projects, { memberships: d.memberships }),
        getKey: itemKey, getLabel: itemLabel, getPath: itemPath, getKeywords: itemKeywords, rankContext: 'project',
        onPick: (i: PickerItem) => { a.review(i.value ? t('Move {tasks} to {target}', { tasks: tasksWord(n), target: i.label }) : t('Move {tasks} to the Inbox', { tasks: tasksWord(n) }), reviewMove(ids, { projectId: i.value })) },
      } },
      { kind: 'picker', id: 'section', label: t('Move to section'), icon: 'kanban', disabled: !oneProject || !projectId, reason: t('The tasks must be in one project'), picker: {
        title: t('Move to section'), placeholder: t('Find a section…'), source: sectionSource(d.sections, projectId),
        getKey: itemKey, getLabel: itemLabel,
        onPick: (i: PickerItem) => { a.review(i.value ? t('Move {tasks} to {target}', { tasks: tasksWord(n), target: i.label }) : t('Move {tasks} to “No section”', { tasks: tasksWord(n) }), reviewMove(ids, { projectId, sectionId: i.value })) },
      } },
      { kind: 'picker', id: 'assign', label: t('Assign'), icon: 'user-check', shortcut: keysOf('list.assign'), disabled: !shared, reason: t('Tasks must be in one shared project'), picker: {
        title: t('Assign'), placeholder: t('Find a member…'), source: [{ userId: '', name: t('Unassigned'), email: '' }, ...members] as { userId: string; name: string; email: string }[],
        getKey: (m: { userId: string }) => m.userId || 'none', getLabel: (m: { name: string; email: string }) => m.name || m.email, rankContext: `assignee:${shared ?? ''}`,
        onPick: (m: { userId: string; name: string; email: string }) => { a.review(m.userId ? t('Assign {tasks} to {name}', { tasks: tasksWord(n), name: m.name || m.email }) : t('Unassign {tasks}', { tasks: tasksWord(n) }), reviewAssign(ids, m.userId || null)) },
      } },
    ] },
    { items: [{ kind: 'action', id: 'trash', label: t('Move to Trash'), icon: 'trash-2', shortcut: keysOf('list.delete'), tone: 'danger', onSelect: run({ kind: 'trash' }) }] },
  ]
}

/** Removes the label when every ticked task has it, otherwise adds it to the ones lacking it. */
async function labelToggle(ids: readonly string[], labelId: string) {
  const { tasks } = await readTicked(ids)
  const all = tasks.length > 0 && tasks.every((task) => task.labels.includes(labelId))
  await runBulk(ids, { kind: 'label', labelId, add: !all })
}

/** A task's edges in its list while the menu is open, for the Reorder items; null outside a manual order. */
function useReorderEdges(id: string, reorder: ListReorder | null) {
  const [edges, setEdges] = useState<{ id: string; at: { first: boolean; last: boolean } | null } | null>(null)
  useEffect(() => {
    if (!id || !reorder) return
    let live = true
    void reorder.edges(id).then((at) => { if (live) setEdges({ id, at }) })
    return () => { live = false }
  }, [id, reorder])
  return edges?.id === id && reorder ? edges.at : null
}

/** Live data the menu needs, read while it is mounted. */
function useBulkData(ids: readonly string[]): Data {
  const key = ids.join(',')
  // Tagged with the selection it was read for: until the read for this selection lands,
  // the menu has no tasks (and marks no common label) rather than an earlier selection's.
  const read = useTickedTasks(ids, key)
  const tasks = useMemo(() => (read?.key === key ? read.tasks : []), [read, key])
  const labels = useAllLabels()
  const labelsLoaded = useLabelsLoaded()
  const projects = useProjects()
  const sections = useLiveSections()
  const memberMap = useMembershipMapOrLoading()
  const memberships = memberMap ?? NO_MEMBER_MAP
  const runningTask = useRunningEntry()?.task_id ?? null
  const prefs = useUserPrefsRow()
  const dayParts = dayPartsOn(prefs)
  const energy = energyLevelsOn(prefs)
  const slot = useSlotState(ids.length === 1 ? ids[0] : '')
  const review = useReviewRow()
  const today = useToday()
  const focus = tasks.length === 1 ? focusMenuState(tasks[0], review, prefs, today) : null
  // The one task's items (focus, tracking, slot, Energy, Day part) and the Labels item's
  // reason come from these reads: a menu shown before them grows under the pointer.
  const ready = read?.key === key && labelsLoaded && memberMap !== undefined && prefs !== undefined && review !== undefined
  return { tasks, labels, projects, sections, memberships, runningTask, dayParts, energy, slot, focus, ready }
}

/**
 * The Actions menu for `ids`. `startPicker` opens it straight into a picker
 * ("labels" for `L`, "assign" for Shift+A on a selection).
 */
export function BulkActionsMenu({ ids, open, onOpenChange, trigger, triggerClassName, triggerProps, startPicker = null, anchor }: {
  ids: readonly string[]
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: React.ReactNode
  triggerClassName?: string
  /** Extra attributes on the trigger button (the pointer position of a right-click menu). */
  triggerProps?: React.ComponentProps<typeof ActionMenu>['triggerProps']
  startPicker?: string | null
  /** Opened from a row's More button: placed there, without the groups the row's own buttons offer. */
  anchor?: RefObject<HTMLElement | null>
}) {
  const reorder = useContext(ListReorderContext)
  const edges = useReorderEdges(ids.length === 1 ? ids[0] : '', reorder)
  const bulk = useBulkData(ids)
  const data = useMemo(() => ({ ...bulk, edges }), [bulk, edges])
  // Held back only until the first full read: a later selection's read must not close an open menu.
  const [settled, setSettled] = useState(false)
  if (data.ready && !settled) setSettled(true)
  const besideRow = !!anchor?.current
  const touch = !useFinePointer()
  const n = data.tasks.length || ids.length
  // Under the urgency order one task's menu explains its place (urgency-sort D4).
  const urgencyOf = useContext(UrgencyContext)
  const why = urgencyOf && ids.length === 1 && data.tasks.length === 1 ? urgencyOf(data.tasks[0]) : null
  const groups = useMemo(() => bulkMenuGroups(ids, data, {
    review: (title, plan) => { void plan.then((p) => bulkDialog.set({ kind: 'review', title, plan: p })) },
    pickDate: () => bulkDialog.set({ kind: 'date', ids, n }),
    schedule: touch && ids.length === 1 ? () => openRowSchedule(ids[0]) : undefined,
    reorder,
    why,
  }, besideRow), [ids, data, besideRow, touch, n, reorder, why])
  return (
    <ActionMenu label={t('Actions for {tasks}', { tasks: tasksWord(n) })} title={tasksWord(n)} groups={groups} open={open} pending={!settled && !data.ready} onOpenChange={onOpenChange}
      trigger={trigger} triggerClassName={triggerClassName} triggerProps={triggerProps} startPicker={startPicker} width="sm:w-72" anchor={anchor} />
  )
}

/**
 * The step a menu item leads to once the menu has closed: the move or assign review,
 * or the date for "Pick a date…". Held here and rendered by the Shell's host, not
 * by the menu, because a row's menu unmounts as it closes (issue 839).
 */
type BulkDialog = { kind: 'review'; title: string; plan: ReviewPlan } | { kind: 'date'; ids: readonly string[]; n: number }
const bulkDialog = createStore<BulkDialog | null>('bulkDialog', null)

/** Renders the menu's follow-up dialog when one is asked. Mounted once by the Shell. */
export function BulkDialogHost() {
  const d = bulkDialog.use()
  const close = () => bulkDialog.set(null)
  if (!d) return null
  if (d.kind === 'review') return <BulkReview title={d.title} plan={d.plan} onClose={close} />
  return (
    <Dialog title={t('Date for {tasks}', { tasks: tasksWord(d.n) })} onClose={close}>
      <DateField label={t('Date')} autoFocus value={null} onChange={(iso) => { close(); if (iso) void runBulk(d.ids, { kind: 'due', pick: iso }) }} />
    </Dialog>
  )
}


/** The root's mark while a selection bar floats over the content (no-layout-jump; index.css). */
const SELECTION_DOCK_ATTR = 'data-selection-docked'

/** The app frame's left edge and width, followed as the window or the sidebar resizes; null outside the shell. */
function useFrameBox(active: boolean): { left: number; width: number } | null {
  const [box, setBox] = useState<{ left: number; width: number } | null>(null)
  useLayoutEffect(() => {
    if (!active) return
    const frame = document.querySelector<HTMLElement>('[data-app-frame]')
    if (!frame) return
    const measure = () => {
      const r = frame.getBoundingClientRect()
      setBox((b) => (b && b.left === r.left && b.width === r.width ? b : { left: r.left, width: r.width }))
    }
    measure()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    ro?.observe(frame)
    window.addEventListener('resize', measure)
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure) }
  }, [active])
  return box
}

/**
 * "3 selected · Actions · Clear" while tasks are ticked (no-layout-jump, issue 1143): it
 * floats over the bottom of the content, on a phone above the tab bar where the add
 * button stands (the button steps aside while it shows), so it appearing or leaving
 * never moves a row, and it stays in sight while the list scrolls.
 */
export function SelectionBar({ ids, onClear, menuOpen, onMenuOpenChange, startPicker, onDone }: {
  ids: readonly string[]
  onClear: () => void
  menuOpen: boolean
  onMenuOpenChange: (open: boolean) => void
  startPicker?: string | null
  /** Select mode on touch (phone-v2 D8): Done hides the checkboxes and keeps the ticks; the bar shows with nothing ticked. */
  onDone?: () => void
}) {
  const shown = ids.length > 0 || !!onDone
  const desktop = useMediaQuery(DESKTOP_HEADER_QUERY)
  // From 768 px a toast in the bottom corner rises above the bar (its lift is 0 there); on a
  // phone its lift above the add button's place already clears the bar. The add button steps
  // aside and the content keeps room under the bar by CSS (index.css).
  useEffect(() => {
    if (!shown || !desktop) return
    const root = document.documentElement.style
    root.setProperty('--selection-lift', '3.75rem')
    return () => { root.removeProperty('--selection-lift') }
  }, [shown, desktop])
  // The room under the content and the add button stepping aside (index.css) read this mark on
  // the root, set before paint: a `:has()` rule over the list restyled it on every change (issue 1179).
  useLayoutEffect(() => {
    if (!shown) return
    const root = document.documentElement
    root.setAttribute(SELECTION_DOCK_ATTR, '')
    return () => root.removeAttribute(SELECTION_DOCK_ATTR)
  }, [shown])
  const box = useFrameBox(shown)
  if (!shown) return null
  return (
    <div data-selection-dock style={box ? { left: box.left, width: box.width } : undefined}
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--toast-lift,4.25rem)-3.5rem+var(--safe-bottom))] z-30 flex justify-center px-4 md:bottom-[calc(1.25rem+var(--safe-bottom))] md:px-8">
      <div className="pointer-events-auto flex w-full max-w-[40rem] items-center gap-2 rounded-control border border-default bg-selected px-3 py-1.5 text-body shadow-2" data-selection-bar>
        <span role="status" className="min-w-0 flex-1 font-medium text-strong">{t('{count} selected', { count: ids.length })}</span>
        {ids.length > 0 && <BulkActionsMenu ids={ids} open={menuOpen} onOpenChange={onMenuOpenChange} startPicker={startPicker}
          trigger={<>{t('Actions')} <Kbd k={keysOf('list.actions')} only className="ml-1" /></>} triggerClassName="ui-btn ui-btn--ghost ui-btn--sm px-2 py-1 text-body" />}
        {ids.length > 0 && (
          <Tooltip label={t('Clear the selection')} shortcut="Esc">
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm px-2 py-1 text-body" onClick={onClear}><Icon name="x" />{t('Clear')}</button>
          </Tooltip>
        )}
        {onDone && <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm touch-target px-2 py-1 text-body font-medium" onClick={onDone} data-select-done>{t('Close')}</button>}
      </div>
    </div>
  )
}
