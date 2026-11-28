// The task list's rows and groups as pure functions (OpenSpec change
// web-component-structure): which tasks a list view holds, how they group under
// headings (dates, projects, sections, Later, Blocked, the logbook's days), and the
// tree positions assistive technology announces. TaskListView only wires these to
// the live data; tests call them directly.
import { nextWaiting, waitingTimeSensitive } from './closedList'
import { formatDateHeading, formatTime, type ResolvedDateTime } from './dates'
import type { Projection } from './occurrences'
import { inboxTasks, isInboxTask, isPlaced, type InboxParentOf } from './inbox'
import { assignedToSomeoneElse, compareDueWithParts, groupToday, partRank, groupUpcoming, projectOpenList, todayList, upcomingList, upcomingWithToday, withoutArchived } from './dayLists'
import { appendTo, groupBy } from './collections'
import type { FieldPlacement } from './fieldTree'
import { t } from './i18n'
import { logbookHeading, type LogbookGroup } from './logbook'
import { compareByPosition, compareDueThenPriority } from './ordering'
import { effectiveSection, groupBySection } from './sections'
import { breadcrumbOf, buildTaskTree } from './subtasks'
import { effectiveParents, flattenTree, type Tree, type TreeNode } from './tree'
import { fieldSortId, type FieldDef, type Label, type Project, type Section, type Task } from './types'
import { compareTasks, groupTasks, inAnytime, inLater, inToday, inUpcoming, isSomeday, noProjectHeading } from './views'
import { compareManual } from './viewOrder'
import type { ListDisplay } from './listDisplay'
import type { DayPart } from './dayParts'
import { linkedPlaceId } from './locations'
import { spanOf } from './span'
import { locateById, noteChanges, patchOrdered, patchSorted, type TaskChange } from './taskDelta'

/** The list views TaskListView renders, as the router names them. */
export type ListScope =
  | { view: 'inbox' | 'today' | 'upcoming' | 'someday' | 'anytime' | 'completed' | 'assigned' }
  | { view: 'project' | 'label' | 'place'; id: string }

/** One rendered line: a task with its place in the (possibly flat) tree. */
export interface ListRow {
  task: Task
  /** A visible subtask outside Today membership. */
  contextual?: true
  depth: number
  /** Effective tree parent in this view; null at the top level. */
  parent: string | null
  hasChildren: boolean
  collapsed: boolean
  breadcrumb: string | null
  /** What the row's view or group heading already says, so a Calm row leaves it out (calm-rows D3). */
  implied?: RowImplied
  /** The parents whose visible subtree ends after this row (quick-subtask-add "Add-subtask line in lists"): their "Add a subtask" line renders here, innermost first. */
  subtaskAdds?: readonly { task: Task; depth: number }[]
}

/**
 * What a heading implies about its rows (task-list-presentation "Metadata language",
 * calm-rows D3). Presentation only: a Calm row drops the matching words, a Detailed
 * row ignores it. New facts (another chip a heading can state) are added as fields.
 */
export interface RowImplied {
  /** The local day the heading names (Today, an Upcoming date): a due on this day shows its time alone. */
  date?: string
  /** This Evening: the "evening" suffix is left out. */
  evening?: true
  /** Morning or Afternoon (day-parts D3): the part chip is left out. */
  part?: 'morning' | 'afternoon'
  /** The Someday view: the "Someday" chip is left out. */
  someday?: true
  /** Today grouped by project (builtin-view-options D3): the heading names the project, so the row leaves it out. */
  project?: true
}

/** Sets what a group's heading implies on each of its rows (a new row object only when there is something to imply). */
function withImplied(rows: ListRow[], implied: RowImplied | undefined): ListRow[] {
  return implied ? rows.map((r) => ({ ...r, implied: r.contextual ? { project: implied.project } : implied })) : rows
}

export interface ListGroup {
  key: string
  heading: string | null
  /** The project a "Group by: Project" group stands for; its header takes the project's colour (project-group-tint). */
  project?: string
  rows: ListRow[]
  /** Project list grouped by section (board-view): the section (null = "No section"). */
  section?: Section | null
  /** Open tasks under the heading, also while it is collapsed. */
  count?: number
  sectionCollapsed?: boolean
  /** A group that starts folded (Today's Blocked): folded unless opened on this device. */
  folded?: boolean
  /** The key in the per-device collapse set that marks a folded group as open. */
  openKey?: string
  /** Always-visible trailing text of the header (the logbook's "3 done"). */
  note?: string
  /** Named by the user's own content (a project): the label keeps its case (page-rhythm D2). */
  named?: true
  /** Today with day parts on (day-parts D4): the part a task dropped on the heading gets ('none' = Any time). */
  dropPart?: DayPart | 'none'
  /** Upcoming (upcoming-drag): the day a task dropped anywhere on the group moves to. */
  dropDay?: string
  /** A group of the day order (day-manual-order D2): its rows take a drop line, and a line in it writes this. */
  daySlot?: DaySlot
  /** One line under an open folded group's heading (today-closed-list: the Waiting hint). */
  hint?: string
  /**
   * Today's folded Waiting for a slot group (today-waiting-time-sensitive D2): the waiting
   * tasks with a time today, soonest first, listed under the heading while it is folded.
   */
  soon?: WaitingSoon[]
  /** Words after a folded heading's count, inside its toggle ("next: Send the form, 4:00 PM"). */
  detail?: string
  /** A section's own Later group (later-in-section): the section key ('' = "No section") it belongs to, drawn inside that section. */
  laterOf?: string
  /** Upcoming's projected occurrences of the day, after its rows and outside its count (series-occurrences D4). */
  projected?: Projection[]
  /** A sub-project's row in its parent's Sub-projects group (subproject-inline D1); its rows are its own open tasks while it is open. */
  subProject?: string
  /** The sub-project's depth below the group (subproject-inline D3). */
  depth?: number
  /** A bar a dragged task drops on to move to this project (subproject-inline D5: the Tasks bar). */
  dropProject?: string
  /** On the last day with projections: "Repeating tasks shown up to <date>". */
  projectedNote?: string
}

/**
 * What a line in a group of Today or Upcoming writes besides the place (day-manual-order D2):
 * Upcoming's day (`date`; with day parts on, `byPart`: the part of the row beside the line),
 * Today's part of the day (`part`, null for none), or nothing (Priority, Label, None).
 */
export interface DaySlot {
  date?: string
  part?: DayPart | null
  byPart?: true
}

/** The slots are shared objects, so keepGroups sees an unchanged group as the same. */
const SLOT_NONE: DaySlot = {}
const PART_SLOTS: Record<DayPart | 'none', DaySlot> = { none: { part: null }, morning: { part: 'morning' }, afternoon: { part: 'afternoon' }, evening: { part: 'evening' } }
const dateSlots = new Map<string, DaySlot>()
function dateSlot(date: string, byPart: boolean): DaySlot {
  const key = byPart ? `${date}|part` : date
  let slot = dateSlots.get(key)
  if (!slot) {
    // A day a page no longer lists is not looked up again: start over now and then.
    if (dateSlots.size > 2000) dateSlots.clear()
    slot = byPart ? { date, byPart: true } : { date }
    dateSlots.set(key, slot)
  }
  return slot
}

export const isTodayProjectGroup = (group: ListGroup) => !!group.project || group.key === 'day:inbox'

/** A row the day order moves (day-manual-order D2): a top-level, non-contextual row of a group with a day slot. */
export const dayOrderMovable = (r: ListRow) => r.depth === 0 && !r.contextual

/** The day order's rows on the page, in display order: the sequence a move is planned against. */
export function dayOrderRows(groups: readonly ListGroup[]): ListRow[] {
  return groups.filter((g) => g.daySlot).flatMap((g) => g.rows.filter(dayOrderMovable))
}

/** The tasks a keyboard step moves among (D2): the task's group; in Upcoming with day parts on, its part of that day. */
export function dayOrderSiblings(groups: readonly ListGroup[], id: string): Task[] {
  const group = groups.find((g) => g.daySlot && g.rows.some((r) => r.task.id === id && dayOrderMovable(r)))
  if (!group) return []
  const tasks = group.rows.filter((r) => dayOrderMovable(r) && !r.task.completed_at).map((r) => r.task)
  if (!group.daySlot?.byPart) return tasks
  const part = partRank(tasks.find((x) => x.id === id)!)
  return tasks.filter((x) => partRank(x) === part)
}

/** A waiting task with a time today: its due time in the user's zone, null for a deadline today without one; `passed` once that time is before now (today-waiting-time-passed). */
export interface WaitingSoon {
  task: Task
  time: string | null
  passed: boolean
}

/** A board column: a section ('' = "No section") and its top-level cards. */
export interface ListColumn {
  key: string
  section: Section | null
  cards: Task[]
  /** Folded to a strip on this device (board-polish D1): its section is collapsed; the cards stay for the count. */
  folded?: boolean
  /** The board's Completed column (board-completed-column): the project's completed tasks, newest first. */
  completed?: boolean
}

/**
 * The key of a board's Completed column (board-completed-column D2). In the project's
 * per-device section fold state it marks the column as unfolded: folded by default.
 */
export const COMPLETED_COLUMN = '@completed'

/** Top-level tasks of a sectioned project with their tree nodes. */
export interface SectionBucket {
  key: string
  section: Section | null
  tasks: Task[]
  roots: TreeNode<Task>[]
}

/** Set in the per-device collapse set when Today's Blocked group is open (it starts folded). */
export const BLOCKED_OPEN_KEY = 'today:blocked:open'
/** Set in the same store when Today's "Waiting for a slot" group is open (today-closed-list D1). */
export const WAITING_OPEN_KEY = 'today:waiting:open'
/** Set in the same store when Today's "Done today" group is open (today-closed-list D6). */
export const DONE_OPEN_KEY = 'today:done:open'

/** In the per-device group store (collapsedGroups) when Today's Earlier group was closed on this device. */
export const EARLIER_KEY = 'today:earlier'
/** In the same store when it was opened on this device. */
export const EARLIER_OPEN_KEY = 'today:earlier:open'
/** Above this many tasks Earlier starts collapsed on a device that never touched it (page-rhythm D5). */
export const EARLIER_FOLD_ABOVE = 5

/** Whether Today's Earlier group is collapsed: what this device chose, else folded above five tasks. */
export function earlierCollapsed(stored: ReadonlySet<string>, count: number): boolean {
  if (stored.has(EARLIER_KEY)) return true
  if (stored.has(EARLIER_OPEN_KEY)) return false
  return count > EARLIER_FOLD_ABOVE
}

/** A row outside the tree (flat views, cards): depth 0, no children. */
export function flatRow(task: Task, breadcrumb: string | null = null): ListRow {
  return { task, depth: 0, parent: null, hasChildren: false, collapsed: false, breadcrumb }
}

/**
 * The tasks a list view holds, in its order (archived projects stay out of cross-project views).
 * `upcomingToday`: Upcoming starts with Today's tasks (upcoming-start-with-today D2).
 * `userId` is the viewer: Today, Upcoming, Someday and Anytime leave out tasks assigned to
 * someone else (personal-views-assignee) unless `othersShown` (others-tasks-toggle D2), and
 * Assigned to me lists theirs.
 */
export function tasksForView(scope: ListScope, allTasks: readonly Task[], projects: readonly Project[], today: string, userId?: string, upcomingToday = false, othersShown = false): Task[] {
  const me = othersShown ? undefined : userId
  // Tasks of archived projects stay out of the cross-project views (lib/dayLists, shared with the display).
  const all = withoutArchived(allTasks as Task[], projects as Project[], scope.view === 'project' ? scope.id : undefined)
  switch (scope.view) {
    case 'inbox':
      // Not placed, and no placed parent (lib/inbox, inbox-means-unplaced).
      return inboxTasks(all, allTasks)
    case 'today':
      return todayList(all, today, me)
    case 'upcoming':
      return upcomingToday ? upcomingWithToday(all, today, me) : upcomingList(all, today, me)
    // Someday and Anytime (someday-and-evening D5), grouped by project in listGroups.
    case 'someday':
      return all.filter((task) => !task.completed_at && isSomeday(task) && !assignedToSomeoneElse(task, me)).sort(compareByPosition)
    case 'anytime':
      return all.filter((task) => inAnytime(task, today) && !assignedToSomeoneElse(task, me)).sort(compareByPosition)
    case 'completed':
      // The logbook pages through every completion (completed-date-filters D4);
      // a habit's skipped occurrence record is not a completion (habits D6).
      return all.filter((task) => task.completed_at && !task.skipped).sort((a, b) => (b.completed_at ?? 0) - (a.completed_at ?? 0))
    case 'project':
      return projectOpenList(all, scope.id)
    case 'label':
      return all.filter((task) => !task.completed_at && task.labels.includes(scope.id)).sort(compareByPosition)
    // A place's open tasks (task-locations "Places page"): those whose location links to it.
    case 'place':
      return all.filter((task) => !task.completed_at && linkedPlaceId(task) === scope.id).sort(compareByPosition)
    case 'assigned':
      return all.filter((task) => !task.completed_at && !!userId && task.assignee_id === userId).sort(compareDueThenPriority)
  }
}

/** What patchViewTasks needs of the whole snapshot: its parents (the Inbox walks them) and which tasks have children. */
export interface ViewPatchContext {
  parentOf: InboxParentOf
  hasChildren: (id: string) => boolean
}

/**
 * tasksForView after `changes` to `allTasks`, from the changed rows (OpenSpec change
 * incremental-list-updates D2): views whose membership is a test of the task alone take
 * the changed rows out and put the ones that pass in at their place in the view's order
 * (the order ends with the id, as a stable sort of the id-ordered snapshot does). Null
 * when the view cannot follow the change (Upcoming with Today, an Inbox task whose
 * placement or parent changed while it has subtasks): worked out in full.
 */
export function patchViewTasks(prev: Task[], changes: readonly TaskChange[], scope: ListScope, projects: readonly Project[], today: string, ctx: ViewPatchContext,
  userId?: string, upcomingToday = false, othersShown = false): Task[] | null {
  const me = othersShown ? undefined : userId
  const hidden = new Set(projects.filter((p) => p.archived).map((p) => p.id))
  const keepProject = scope.view === 'project' ? scope.id : undefined
  // withoutArchived's rule, a task at a time. inbox-rule-ok: tasks of archived projects, not the Inbox.
  const shown = (task: Task) => task.habit_graduated_at == null && (!task.project_id || !hidden.has(task.project_id) || task.project_id === keepProject) // inbox-rule-ok: as above
  const byDone = (a: Task, b: Task) => (b.completed_at ?? 0) - (a.completed_at ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  switch (scope.view) {
    case 'inbox': {
      for (const c of changes) {
        const a = c.before
        const b = c.after
        const same = a && b && isPlaced(a) === isPlaced(b) && (a.parent_id ?? null) === (b.parent_id ?? null)
        if (!same && ctx.hasChildren(c.id)) return null
      }
      return linked(prev, patchSorted(prev, changes, (task) => shown(task) && isInboxTask(task, ctx.parentOf)))
    }
    case 'today':
      return patchOrdered(prev, changes, (task) => shown(task) && inToday(task, today) && !assignedToSomeoneElse(task, me), compareDueThenPriority)
    case 'upcoming':
      return upcomingToday ? null : patchOrdered(prev, changes, (task) => shown(task) && inUpcoming(task, today) && !assignedToSomeoneElse(task, me), compareDueThenPriority)
    case 'someday':
      return patchOrdered(prev, changes, (task) => shown(task) && !task.completed_at && isSomeday(task) && !assignedToSomeoneElse(task, me), compareByPosition)
    case 'anytime':
      return patchOrdered(prev, changes, (task) => shown(task) && inAnytime(task, today) && !assignedToSomeoneElse(task, me), compareByPosition)
    case 'completed':
      return patchOrdered(prev, changes, (task) => shown(task) && !!task.completed_at && !task.skipped, byDone)
    case 'project':
      return linked(prev, patchSorted(prev, changes, (task) => shown(task) && !task.completed_at && task.project_id === scope.id))
    case 'label':
      return patchOrdered(prev, changes, (task) => shown(task) && !task.completed_at && task.labels.includes(scope.id), compareByPosition)
    case 'place':
      return patchOrdered(prev, changes, (task) => shown(task) && !task.completed_at && linkedPlaceId(task) === scope.id, compareByPosition)
    case 'assigned':
      return patchOrdered(prev, changes, (task) => shown(task) && !task.completed_at && !!userId && task.assignee_id === userId, compareDueThenPriority)
  }
}

/** A patched list in id order, noted as made from `prev` so the tree that follows it can patch too. */
function linked(prev: Task[], out: { list: Task[]; changes: TaskChange[] }): Task[] {
  noteChanges(prev, out.list, out.changes)
  return out.list
}

/** A tree list's structure: its Later split, the tree of its other tasks and their section buckets. */
export interface TreeParts {
  split: { active: Task[]; later: Task[] } | null
  tree: Tree<Task> | null
  buckets: SectionBucket[] | null
}

/** TreeParts in full (what useListModel derives for a project or the Inbox). */
export function treeParts(tasks: readonly Task[], treeView: boolean, board: boolean, today: string, projectId: string | null, sections: Section[]): TreeParts {
  const split = treeView && !board ? splitLater(tasks, today) : null
  const tree = treeView ? buildTaskTree((split?.later.length ? split.active : tasks) as Task[]) : null
  return { split, tree, buckets: sectionBuckets(projectId, tree, sections) }
}

/**
 * TreeParts after `changes` to the list's tasks (incremental-list-updates D2): a task
 * that leaves without subtasks, or changes without moving (the same parent, position,
 * section, project and start), is taken out of or swapped into the split, the tree (the
 * nodes above it are copied, every other subtree kept) and its section's bucket. Null
 * (worked out in full) for a task that comes, moves, or leaves with subtasks.
 */
export function patchTreeParts(prev: TreeParts, changes: readonly TaskChange[], hasChildren: (id: string) => boolean): TreeParts | null {
  if (!prev.tree) return prev.split ? null : prev
  const nodes = new Map(prev.tree.nodes)
  let roots = prev.tree.roots
  const swapped = new Map<TreeNode<Task>, TreeNode<Task> | null>()
  const swap = (old: TreeNode<Task>, next: TreeNode<Task> | null): boolean => {
    if (next) nodes.set(old.id, next)
    else nodes.delete(old.id)
    if (old.parent === null) {
      swapped.set(old, next)
      roots = next ? roots.map((r) => (r === old ? next : r)) : roots.filter((r) => r !== old)
      return true
    }
    // Its parent left in the same write: worked out in full.
    const parent = nodes.get(old.parent)
    if (!parent) return false
    const children = next ? parent.children.map((c) => (c === old ? next : c)) : parent.children.filter((c) => c !== old)
    return swap(parent, { ...parent, children })
  }
  let active = prev.split?.active
  let later = prev.split?.later
  const inList = (list: Task[] | undefined, c: TaskChange) => {
    if (!list) return list
    const [at, found] = locateById(list, c.id)
    if (!found) return list
    const out = list.slice()
    if (c.after) out[at] = c.after
    else out.splice(at, 1)
    return out
  }
  for (const c of changes) {
    const a = c.before
    const b = c.after
    const node = nodes.get(c.id)
    if (!a || (!b && (node ? node.children.length > 0 : hasChildren(c.id)))) return null
    if (b && ((a.parent_id ?? null) !== (b.parent_id ?? null) || a.position !== b.position || (a.section_id ?? null) !== (b.section_id ?? null)
      || a.project_id !== b.project_id || (a.start ?? null) !== (b.start ?? null))) return null
    active = inList(active, c)
    later = inList(later, c)
    if (node && !swap(node, b ? { ...node, item: b } : null)) return null
  }
  const split = prev.split && active && later ? { active, later } : null
  const buckets = prev.buckets && swapped.size
    ? prev.buckets.map((g) => {
      if (!g.roots.some((r) => swapped.has(r))) return g
      const now = (r: TreeNode<Task>): TreeNode<Task> | null => { let n: TreeNode<Task> | null = r; while (n && swapped.has(n)) n = swapped.get(n)!; return n }
      const kept = g.roots.flatMap((r) => { const n = now(r); return n ? [n] : [] })
      return { ...g, roots: kept, tasks: kept.map((n) => n.item) }
    })
    : prev.buckets
  return { split, tree: { roots, nodes }, buckets }
}

/**
 * A project list's open tasks split into the main list and its Later group
 * (subtasks-follow-later): a whole subtree goes where its top-level task goes, so
 * a deferred or parked parent takes its subtasks into Later, and a deferred
 * subtask of an active parent stays under it. Both keep the input order.
 */
export function splitLater(tasks: readonly Task[], today: string): { active: Task[]; later: Task[] } {
  const parents = effectiveParents(tasks as Task[])
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const rootOf = (id: string): Task => {
    let cur = id
    for (let up = parents.get(cur); up; up = parents.get(cur)) cur = up
    return byId.get(cur)!
  }
  const active: Task[] = []
  const later: Task[] = []
  // A task drawn as a span is placed in time, not hidden until then: it stays with its section (spans-stay-in-sections).
  const deferred = (root: Task) => inLater(root, today) && !spanOf(root)
  for (const task of tasks) (deferred(rootOf(task.id)) ? later : active).push(task)
  return { active, later }
}

/** Top-level tasks of the project bucketed by section: list headings and board columns. */
export function sectionBuckets(projectId: string | null, tree: Tree<Task> | null, sections: Section[]): SectionBucket[] | null {
  if (!projectId || !tree) return null
  const byId = new Map(tree.roots.map((n) => [n.id, n]))
  return groupBySection(projectId, tree.roots.map((n) => n.item), sections).map((g) => ({
    ...g, roots: g.tasks.map((task) => byId.get(task.id) as TreeNode<Task>),
  }))
}

/** Board columns; "No section" is a column only while it has open tasks (sections-and-boards). */
export function boardColumns(buckets: SectionBucket[] | null, collapsed: readonly string[] = [], completed?: readonly Task[] | null): ListColumn[] {
  const folded = new Set(collapsed)
  const cols: ListColumn[] = (buckets ?? []).filter((g) => g.key !== '' || g.tasks.length > 0)
    .map((g) => ({ key: g.key, section: g.section, cards: g.tasks, ...(folded.has(g.key) ? { folded: true } : {}) }))
  // With "Show completed tasks" on, the Completed column ends the board, folded unless opened (board-completed-column D2).
  if (completed) cols.push({ key: COMPLETED_COLUMN, section: null, cards: [...completed], completed: true, ...(folded.has(COMPLETED_COLUMN) ? {} : { folded: true }) })
  return cols
}

export interface GroupInput {
  view: ListScope['view']
  /** The view's tasks after filters; for tree views without the Later ones. */
  tasks: Task[]
  /**
   * Project views: deferred and parked top-level tasks with their subtasks (splitLater), shown as a tree
   * in a folded Later group inside each section of a list grouped by section (later-in-section), else
   * in one Later group at the end (Inbox tasks are never deferred or parked).
   */
  laterTasks: Task[]
  /** The project of a project list: names the per-device open state of its sections' Later groups. */
  projectId?: string | null
  /** A project's timeline: deferred tasks keep the one Later group at the end (later-in-section D4). */
  timeline?: boolean
  tree: Tree<Task> | null
  /**
   * A project view that shows its "Sub-projects" group (subprojects-above-tasks): its own tasks,
   * when no section or grouping heads them, are a "Tasks" group that folds per project on this device.
   */
  subProjects?: boolean
  today: string
  resolved: ResolvedDateTime
  /** Collapsed tree rows, and BLOCKED_OPEN_KEY when Today's Blocked group is open. */
  collapsed: ReadonlySet<string>
  blocked: { has(id: string): boolean }
  taskMap: Map<string, Task>
  projects: readonly Project[]
  projectMap: Map<string, Project>
  fields?: readonly FieldDef[]
  /** Where each project is, for ordering by a workspace field (workspace-fields). */
  fieldPlacement?: FieldPlacement
  /** The urgency order's score (urgency-sort); given only while the list is ordered by urgency. */
  score?: (task: Task) => number | null
  board: boolean
  columns: ListColumn[]
  buckets: SectionBucket[] | null
  /** Live sections of the project. */
  sectionCount: number
  collapsedSections: readonly string[]
  logbook: { groups: LogbookGroup[] } | null
  /** A project's, label's or built-in view's display options (list-display-options, builtin-view-options); absent shows the page's default. */
  display?: ListDisplay
  /** Upcoming with Start with Today: Today's own display options lay out its Today groups (builtin-view-options D4). */
  todayDisplay?: ListDisplay
  /** Labels, for grouping by label. */
  labels?: readonly Label[]
  /** A label page's own manual order (view-manual-order), or Today's and Upcoming's day order (day-manual-order): the rank of each placed task. */
  manualOrder?: ReadonlyMap<string, number>
  /** Today: the account groups it by part of the day (day-parts D3); Today and Upcoming order a day by part (day-manual-order D4). */
  dayParts?: boolean
  /**
   * Today with a limit (today-closed-list D1, D2): the limit, and the tasks waiting for
   * a slot in fill order (left out of the day's groups, listed in a folded group).
   */
  closedList?: { limit: number; waiting: readonly Task[]; now?: string }
  /** Today's Done today group (today-closed-list D6): the tasks completed today, newest first; absent when hidden. */
  doneToday?: readonly Task[]
  /** Upcoming starts with Today's own groups, then Tomorrow onwards (upcoming-start-with-today D2). */
  upcomingToday?: boolean
  todayContextFilter?: { me: string | null; matches: (task: Task) => boolean }
  /** A project's list layout with sub-projects (subproject-inline): the Sub-projects group and the tasks of the open ones. */
  subProjectList?: SubProjectList
}

/** A project's sub-projects as its list shows them (subproject-inline D1). */
export interface SubProjectList {
  /** The direct, non-archived sub-projects, as tree nodes. */
  children: readonly TreeNode<Project>[]
  /** Each project's open tasks with those of its whole subtree. */
  counts: ReadonlyMap<string, number>
  /** No grouping and no columns layout: the rows offer their arrow (D6). */
  offered: boolean
  /** The open tasks of each open sub-project, after the view's filters. */
  tasks: ReadonlyMap<string, readonly Task[]>
  /** Live sections, for an open sub-project's section order. */
  sections: readonly Section[]
}

/**
 * The comparator of a display's order, or null for manual order as stored (list-display-options D3).
 * A label page's manual order is its own (view-manual-order): `rank` of the label's placed tasks.
 */
function displayOrder(d: ListDisplay | undefined, rank?: ReadonlyMap<string, number>, projects: readonly Project[] = [], fields: readonly FieldDef[] = [], score?: (task: Task) => number | null, fieldPlacement?: FieldPlacement): ((a: Task, b: Task) => number) | null {
  const selectedId = fieldSortId(d?.sortBy)
  if (selectedId && !fields.some((field) => field.id === selectedId && !field.deleted_at && (field.type === 'number' || field.type === 'date'))) {
    return rank ? compareManual(rank) : null
  }
  if (rank && d?.sortBy === 'position') {
    const asc = compareManual(rank)
    return d.sortDir === 'desc' ? (a, b) => asc(b, a) : asc
  }
  return d && !(d.sortBy === 'position' && d.sortDir === 'asc') ? compareTasks(d.sortBy, d.sortDir, { projects, fields, score, fieldPlacement }) : null
}

/** Top-level nodes in the display's order; subtasks keep their manual order under their parent. */
function sortedRoots(roots: TreeNode<Task>[], order: ((a: Task, b: Task) => number) | null): TreeNode<Task>[] {
  return order ? [...roots].sort((a, b) => order(a.item, b.item)) : roots
}

/** A tree node's row in a list; a top-level task that still points at a parent (completed, deleted, missing, outside the group) names it. */
function nodeRow(p: GroupInput): (n: TreeNode<Task>) => ListRow {
  return (n) => ({
    task: n.item,
    depth: n.depth,
    parent: n.parent,
    hasChildren: n.children.length > 0,
    collapsed: p.collapsed.has(n.id),
    breadcrumb: n.parent === null && n.item.parent_id ? breadcrumbOf(n.item, p.taskMap) : null,
  })
}

/**
 * Today's and Upcoming's chosen order (builtin-view-options D2), or null for their own: due, then
 * priority. While day parts are on, Due date ranks a day's tasks by part (day-manual-order D4).
 * Manual order is the shared day order, the rest by Due date (D1); `rank` absent, Today's default.
 */
function dayOrder(p: GroupInput, d: ListDisplay | undefined, rank?: ReadonlyMap<string, number>): ((a: Task, b: Task) => number) | null {
  const parts = !!p.dayParts
  if (d?.sortBy === 'position' && rank) {
    const asc = compareManual(rank, parts ? compareDueWithParts() : compareDueThenPriority)
    return d.sortDir === 'desc' ? (a, b) => asc(b, a) : asc
  }
  if (d && d.sortBy !== 'due' && d.sortBy !== 'position') return displayOrder(d, undefined, p.projects, p.fields, p.score, p.fieldPlacement)
  const desc = d?.sortBy === 'due' && d.sortDir === 'desc'
  if (parts) return compareDueWithParts(desc)
  return desc ? displayOrder(d, undefined) : null
}

/**
 * A group's rows in Today or Upcoming (builtin-view-options D3, D5): in the chosen order;
 * with Nest subtasks, a subtask under its parent when both are in the group, the order
 * sorting the top-level rows and subtasks keeping their manual order.
 */
function dayRows(p: GroupInput, list: Task[], order: ((a: Task, b: Task) => number) | null, nest: boolean, row: (task: Task) => ListRow,
  context?: ReadonlyMap<string, Task[]>): ListRow[] {
  if (!nest) return (order ? [...list].sort(order) : list).map(row)
  const { roots, nodes } = buildTaskTree(list)
  const contextual = context?.size ? appendTodayContext(nodes, context) : null
  roots.sort((a, b) => (order ?? compareDueThenPriority)(a.item, b.item))
  const toRow = nodeRow(p)
  return flattenTree(roots, (id) => p.collapsed.has(id)).map((node) =>
    contextual?.has(node.id) ? { ...toRow(node), contextual: true } : toRow(node))
}

function todayContextChildren(p: GroupInput): Map<string, Task[]> {
  const children = new Map<string, Task[]>()
  for (const task of p.taskMap.values()) {
    if (!task.parent_id || task.deleted_at || task.completed_at || task.habit_graduated_at != null) continue
    if (isSomeday(task) || inToday(task, p.today)) continue
    if (task.project_id && p.projectMap.get(task.project_id)?.archived) continue
    if (assignedToSomeoneElse(task, p.todayContextFilter?.me) || p.todayContextFilter?.matches(task) === false) continue
    appendTo(children, task.parent_id, task)
  }
  return children
}

/** Add leaves after building the regular tree so a contextual task cannot adopt a Today row. */
function appendTodayContext(nodes: Map<string, TreeNode<Task>>, context: ReadonlyMap<string, Task[]>): Set<string> {
  const added = new Set<string>()
  for (const parent of nodes.values()) {
    const children = context.get(parent.id)
    if (!children?.length) continue
    for (const task of children) {
      if (nodes.has(task.id)) continue
      parent.children.push({ item: task, id: task.id, parent: parent.id, depth: parent.depth + 1, children: [] })
      added.add(task.id)
    }
    parent.children.sort((a, b) => compareByPosition(a.item, b.item))
  }
  return added
}

/**
 * Marks each row with the parents whose visible subtree it ends (quick-subtask-add
 * "Add-subtask line in lists"): an ancestor ends after a row when the next row is
 * shallower than it — or the row is the group's last — walking each row's parent
 * chain, innermost first. Flat rows have no parent and mark nothing.
 */
function markSubtaskAdds(rows: ListRow[]): void {
  if (!rows.some((r) => r.parent !== null)) return
  const byId = new Map(rows.map((r, i) => [r.task.id, i]))
  for (let i = 0; i < rows.length; i++) {
    const nextDepth = i + 1 < rows.length ? rows[i + 1].depth : -1
    let adds: { task: Task; depth: number }[] | undefined
    for (let pid = rows[i].parent; pid !== null;) {
      const pi = byId.get(pid)
      if (pi === undefined) break
      const pr = rows[pi]
      if (nextDepth > pr.depth) break
      ;(adds ??= []).push({ task: pr.task, depth: pr.depth })
      pid = pr.parent
    }
    if (adds) rows[i].subtaskAdds = adds
  }
}

/** The list's groups, in render order: one pass, linear in the number of tasks, then each row's subtree ends marked. */
export function listGroups(p: GroupInput): ListGroup[] {
  const groups = [...subProjectGroups(p), ...listGroupsInner(p)]
  for (const g of groups) markSubtaskAdds(g.rows)
  return groups
}

function listGroupsInner(p: GroupInput): ListGroup[] {
  const toRow = nodeRow(p)
  const isCollapsed = (id: string) => p.collapsed.has(id)
  // Later keeps each subtree together under its top-level task (subtasks-follow-later).
  const later = (): ListGroup[] => (p.laterTasks.length
    ? [{ key: 'later', heading: t('Later'), rows: flattenTree(buildTaskTree(p.laterTasks).roots, isCollapsed).map(toRow) }]
    : [])
  // Board: cards are top-level tasks, column by column (keyboard order); a folded column has none on screen (board-polish D1).
  if (p.board) return p.columns.map((c) => ({ key: c.key, heading: null, rows: c.folded ? [] : c.cards.map((task) => flatRow(task)) }))
  const order = displayOrder(p.display, p.manualOrder, p.projects, p.fields, p.score, p.fieldPlacement)
  const groupByKey = p.display?.groupBy
  if (p.tree && (p.view === 'project' || p.view === 'inbox') && groupByKey && groupByKey !== 'section' && groupByKey !== 'none' && groupByKey !== 'project' && groupByKey !== 'day') {
    // Grouped by a property of the top-level tasks (list-display-options D3); each brings its subtasks.
    const roots = sortedRoots(p.tree.roots, order)
    const byId = new Map(roots.map((n) => [n.id, n]))
    const groups = groupTasks(roots.map((n) => n.item), groupByKey, { today: p.today, labels: p.labels ?? [], projects: p.projects }, true)
    return [...groups.map((g): ListGroup => ({
      key: g.key, heading: g.heading, rows: flattenTree(g.tasks.map((task) => byId.get(task.id)!), isCollapsed).map(toRow),
      ...(groupByKey === 'label' && g.key !== 'none' ? { named: true as const } : {}),
    })), ...later()]
  }
  if (p.buckets && p.sectionCount > 0 && groupByKey !== 'none') {
    // Project list with sections: "No section" first, then each section by position.
    // Deferred and parked tasks stay in their own section, under its folded Later (later-in-section D1);
    // the timeline keeps them in one Later group at the end (D4).
    const folded = new Set(p.collapsedSections)
    const laterOf = p.timeline ? null : laterBySection(p.laterTasks, p.buckets)
    const out: ListGroup[] = []
    for (const g of p.buckets) {
      const laterRoots = laterOf?.get(g.key)
      if (!g.section && !g.roots.length && !laterRoots) continue
      out.push({
        key: `section:${g.key}`,
        heading: g.section ? g.section.name : t('No section'),
        section: g.section,
        sectionCollapsed: folded.has(g.key),
        count: flattenTree(g.roots).length,
        rows: folded.has(g.key) ? [] : flattenTree(sortedRoots(g.roots, order), isCollapsed).map(toRow),
      })
      // A collapsed section hides its Later too; open, the Later starts folded until opened on this device (D2).
      if (!laterRoots || folded.has(g.key)) continue
      const openKey = laterOpenKey(p.projectId ?? '', g.key)
      const closed = !p.collapsed.has(openKey)
      out.push({
        key: `later:${g.key}`, heading: t('Later'), laterOf: g.key, count: flattenTree(laterRoots).length, folded: closed, openKey,
        rows: closed ? [] : flattenTree(sortedRoots(laterRoots, order), isCollapsed).map(toRow),
      })
    }
    return laterOf ? out : [...out, ...later()]
  }
  // Project and Inbox: one depth-first pass over the built tree (linear in task count).
  // With a sub-project open the bar stays, also over no tasks: a task dropped on it comes back to the project (subproject-inline D5).
  if (p.tree && p.subProjects && p.view === 'project' && p.projectId && (p.tree.roots.length || p.subProjectList?.tasks.size)) {
    // Folded, its rows leave the list, so the cursor and the keys never reach a hidden task.
    const openKey = tasksFoldedKey(p.projectId)
    const folded = p.collapsed.has(openKey)
    return [{
      key: 'all', heading: t('Tasks'), count: flattenTree(p.tree.roots).length, folded, openKey, dropProject: p.projectId,
      rows: folded ? [] : flattenTree(sortedRoots(p.tree.roots, order), isCollapsed).map(toRow),
    }, ...later()]
  }
  if (p.tree) return [{ key: 'all', heading: null, rows: flattenTree(sortedRoots(p.tree.roots, order), isCollapsed).map(toRow) }, ...later()]
  return flatGroups(p)
}

/** In the per-device collapse set while a project's Tasks group is folded (subprojects-above-tasks). */
export const tasksFoldedKey = (projectId: string) => `project:${projectId}:tasks:folded`

/** The key of a project's Sub-projects bar group (subproject-inline D1). */
export const SUB_PROJECTS = 'sub-projects'
/** In the per-device collapse set while a project's Sub-projects group is folded. */
export const subProjectsFoldedKey = (projectId: string) => `project:${projectId}:sub-projects:folded`
/** In the same set while a sub-project is open in its parent's list; folded by default (subproject-inline D2). */
export const inlineOpenKey = (projectId: string) => `project:${projectId}:inline:open`

/** A sub-project row offers its arrow when the list offers it and the sub-project has something to show (D2). */
const offersArrow = (s: Pick<SubProjectList, 'offered' | 'counts'>, n: TreeNode<Project>): boolean => s.offered && ((s.counts.get(n.id) ?? 0) > 0 || n.children.length > 0)

/** Whether a sub-project is open in its parent's list on this device. */
export const isInlineOpen = (s: Pick<SubProjectList, 'offered' | 'counts'>, n: TreeNode<Project>, collapsed: ReadonlySet<string>): boolean => offersArrow(s, n) && collapsed.has(inlineOpenKey(n.id))

/**
 * The Sub-projects bar, then a group per shown sub-project (subproject-inline D1, D3): an
 * open one holds its own open tasks, in its section order (the view's sort when one is
 * chosen), and is followed by its own sub-projects one depth further in.
 */
function subProjectGroups(p: GroupInput): ListGroup[] {
  const s = p.subProjectList
  if (!s?.children.length || !p.projectId) return []
  const foldKey = subProjectsFoldedKey(p.projectId)
  const folded = p.collapsed.has(foldKey)
  const out: ListGroup[] = [{ key: SUB_PROJECTS, heading: t('Sub-projects'), count: s.children.length, folded, openKey: foldKey, rows: [] }]
  if (folded) return out
  const order = displayOrder(p.display, undefined, p.projects, p.fields, p.score, p.fieldPlacement)
  const walk = (nodes: readonly TreeNode<Project>[], depth: number) => {
    for (const n of nodes) {
      const open = isInlineOpen(s, n, p.collapsed)
      out.push({
        key: `sub-project:${n.id}`, heading: n.item.name, named: true, subProject: n.id, depth, count: s.counts.get(n.id) ?? 0, folded: !open,
        ...(offersArrow(s, n) ? { openKey: inlineOpenKey(n.id) } : {}),
        rows: open ? blockRows(p, n.id, s.tasks.get(n.id) ?? [], s.sections, order) : [],
      })
      if (open) walk(n.children, depth + 1)
    }
  }
  walk(s.children, 0)
  return out
}

/** Each open sub-project's rows by its task list, with what else they were made from. */
const blockRowsOf = new WeakMap<readonly Task[], { from: readonly unknown[]; rows: ListRow[] }>()

/**
 * An open sub-project's rows, kept while its task list, the sections, the view's order and
 * the folds are the same objects (D7): a write to another project costs a lookup per block.
 */
function blockRows(p: GroupInput, id: string, tasks: readonly Task[], sections: readonly Section[], order: ((a: Task, b: Task) => number) | null): ListRow[] {
  const from = [id, sections, p.display, p.score, p.fields, p.fieldPlacement, p.projects, p.collapsed]
  const hit = blockRowsOf.get(tasks)
  if (hit && hit.from.every((x, i) => x === from[i])) return hit.rows
  const rows = flattenTree(blockRoots(id, tasks, sections, order), (x) => p.collapsed.has(x)).map(nodeRow(p))
  blockRowsOf.set(tasks, { from, rows })
  return rows
}

/** An open sub-project's top-level tasks: in the view's sort, else section by section (No section first) without their bars. */
function blockRoots(projectId: string, tasks: readonly Task[], sections: readonly Section[], order: ((a: Task, b: Task) => number) | null): TreeNode<Task>[] {
  const { roots } = buildTaskTree(tasks as Task[])
  if (order) return sortedRoots(roots, order)
  const byId = new Map(roots.map((n) => [n.id, n]))
  return groupBySection(projectId, roots.map((n) => n.item), sections as Section[]).flatMap((g) => g.tasks.map((task) => byId.get(task.id)!))
}

/** In the per-device collapse set when a section's Later group is open; folded by default (later-in-section D2). */
export const laterOpenKey = (projectId: string, sectionKey: string) => `project:${projectId}:later:${sectionKey}:open`

/**
 * The Later tasks' top-level nodes by the section of their top-level task ('' = "No section"),
 * each with its subtasks (subtasks-follow-later), in position order; one pass over the
 * Later tree. A section that is not one of the list's buckets (deleted, another project's) is "No section".
 */
export function laterBySection(laterTasks: readonly Task[], buckets: readonly SectionBucket[]): Map<string, TreeNode<Task>[]> | null {
  if (!laterTasks.length) return null
  const keys = new Set(buckets.map((b) => b.key))
  const out = new Map<string, TreeNode<Task>[]>()
  for (const root of buildTaskTree(laterTasks as Task[]).roots) {
    const id = root.item.section_id ?? ''
    appendTo(out, keys.has(id) ? id : '', root)
  }
  return out
}

/** Cross-project and date views: flat, each matching task once, with its parent named. */
function flatGroups(p: GroupInput): ListGroup[] {
  const row = (task: Task) => flatRow(task, task.parent_id ? breadcrumbOf(task, p.taskMap) : null)
  if (p.view === 'today') return todayGroups(p, row)
  if (p.logbook) {
    // Completed as a logbook: one group per local completion day, newest first.
    // Grouped by project (completed-view-review D2): the project's name, "No project" for none (inbox-drop-unplaces D3).
    return p.logbook.groups.map((g): ListGroup => {
      const note = t('{n, plural, one {# done} other {# done}}', { n: g.tasks.length })
      if (g.project === undefined) return { key: g.date, heading: logbookHeading(g.date, p.today, p.resolved), note, rows: g.tasks.map(row) }
      const id = g.project
      return {
        key: id || 'inbox', heading: id ? p.projectMap.get(id)?.name ?? t('Project') : noProjectHeading(g.tasks), note, named: true,
        rows: withImplied(g.tasks.map(row), { project: true }), ...(id && p.projectMap.has(id) ? { project: id } : {}),
      }
    })
  }
  if (p.view === 'upcoming') {
    // Start with Today (upcoming-start-with-today D2): Today's own groups, then Tomorrow onwards.
    const lead = p.upcomingToday ? p.tasks.filter((x) => inToday(x, p.today)) : []
    const ahead = lead.length ? p.tasks.filter((x) => !inToday(x, p.today)) : p.tasks
    // Upcoming's own order and nesting apply from Tomorrow on (builtin-view-options D4);
    // with day parts on, Manual order keeps a day in part order too (day-manual-order D4).
    const chosen = dayOrder(p, p.display, p.manualOrder ?? new Map())
    const order = chosen && p.dayParts && p.display?.sortBy === 'position' ? (a: Task, b: Task) => partRank(a) - partRank(b) || chosen(a, b) : chosen
    const days = groupUpcoming(ahead, p.today).map(({ date, tasks: list }): ListGroup => ({ key: date, heading: formatDateHeading(date, p.today, p.resolved), rows: withImplied(dayRows(p, list, order, !!p.display?.subtasks, row), { date }), dropDay: date, daySlot: dateSlot(date, !!p.dayParts) }))
    // Today's day groups take a drop for today (upcoming-drag); Earlier, Blocked and Waiting do not.
    const onToday = new Set(['today', 'morning', 'afternoon', 'evening'])
    const leadGroups = p.upcomingToday ? todayGroups({ ...p, tasks: lead, doneToday: undefined }, row, true).map((g) => (onToday.has(g.key) ? { ...g, dropDay: p.today } : g)) : []
    return [...leadGroups, ...days]
  }
  if (p.view === 'label' && p.display && p.display.groupBy !== 'project') {
    // A label page with its own grouping (list-display-options D3): in its order, each task once.
    const order = displayOrder(p.display, p.manualOrder, p.projects, p.fields, p.score, p.fieldPlacement)
    const tasks = order ? [...p.tasks].sort(order) : p.tasks
    if (p.display.groupBy === 'none' || p.display.groupBy === 'section' || p.display.groupBy === 'day') return [{ key: 'all', heading: null, rows: tasks.map(row) }]
    return groupTasks(tasks, p.display.groupBy, { today: p.today, labels: p.labels ?? [], projects: p.projects }, true)
      .map((g) => ({ key: g.key, heading: g.heading, rows: g.tasks.map(row) }))
  }
  if (p.view === 'label' || p.view === 'assigned' || p.view === 'someday' || p.view === 'anytime') {
    // Grouped by project: tasks without a project first, then projects in sidebar order; flat rows with breadcrumbs.
    const sort = p.view === 'label' ? displayOrder(p.display, p.manualOrder, p.projects, p.fields, p.score, p.fieldPlacement) : null
    const byProject = groupBy(sort ? [...p.tasks].sort(sort) : p.tasks, (tk) => tk.project_id ?? '')
    const order = ['', ...p.projects.slice().sort(compareByPosition).map((pr) => pr.id)]
    const implied: RowImplied | undefined = p.view === 'someday' ? { someday: true } : undefined
    return order.filter((id) => byProject.has(id)).map((id) => ({
      key: id || 'inbox', heading: id ? p.projectMap.get(id)?.name ?? t('Project') : noProjectHeading(byProject.get(id)!, (pid) => p.taskMap.get(pid)), rows: withImplied(byProject.get(id)!.map(row), implied), named: true as const,
      ...(id && p.projectMap.has(id) ? { project: id } : {}),
    }))
  }
  return [{ key: 'all', heading: null, rows: p.tasks.map(row) }]
}

/**
 * Today's groups in order: Earlier, Today, the parts of the day, This Evening, Blocked,
 * then the closed list's Waiting for a slot and Done today. Upcoming's Start with Today
 * (upcoming-start-with-today D2) calls it with Today's tasks, so both lists agree.
 */
function todayGroups(p: GroupInput, row: (task: Task) => ListRow, inUpcoming = false): ListGroup[] {
  // Blocked tasks wait in their own group at the end (task-dependencies D7);
  // This Evening below the day's tasks (someday-and-evening).
  // With day parts on, Morning and Afternoon between them (day-parts D3); their headings take drops (D4).
  const parts = !!p.dayParts
  // Tasks waiting for a slot leave the day's groups (today-closed-list D1); the slots keep Today's order and groups.
  const slotWaiting = p.closedList?.waiting ?? []
  const out = slotWaiting.length ? new Set(slotWaiting.map((x) => x.id)) : null
  const listed = out ? p.tasks.filter((x) => !out.has(x.id)) : p.tasks
  const { overdue: earlier, day, morning, afternoon, evening, blocked: waiting } = groupToday(listed, p.today, p.blocked, parts)
  // Today's display options (builtin-view-options D3), also for Upcoming's Today groups (D4):
  // the order applies within Earlier, the day's groups and Blocked.
  const d = inUpcoming ? p.todayDisplay : p.display
  // Manual order is the day order (day-manual-order D1) in the day's own groups; Earlier and Blocked keep Today's default.
  const order = dayOrder(p, d, p.manualOrder ?? new Map())
  const outer = d?.sortBy === 'position' ? dayOrder(p, undefined) : order
  const rows = (list: Task[]) => dayRows(p, list, outer, !!d?.subtasks, row)
  const context = !inUpcoming && d?.subtasks ? todayContextChildren(p) : undefined
  const dayTree = (list: Task[]) => dayRows(p, list, order, !!d?.subtasks, row, context)
  const g: ListGroup[] = []
  // In Upcoming the part headings take no drops: a drop there would change the part and leave the date (D3).
  // In Today a line in a part writes that part (day-manual-order D2).
  const drop = (part: DayPart | 'none') => (inUpcoming ? {} : {
    ...(parts ? { dropPart: part } : {}), daySlot: PART_SLOTS[part],
  })
  // Earlier and Blocked imply nothing: how late a task is stays visible on its row (calm-rows D3, page-rhythm D5).
  if (earlier.length) g.push({ key: 'earlier', heading: t('Earlier'), rows: rows(earlier) })
  const groupBy = d?.groupBy ?? 'day'
  if (groupBy !== 'day') {
    // Another grouping lays out only the day's own tasks (D3); Earlier, Blocked, Waiting and Done keep their place.
    const own = new Set([...day, ...morning, ...afternoon, ...evening])
    g.push(...chosenTodayGroups(p, listed.filter((x) => own.has(x)), groupBy, earlier.length > 0, inUpcoming, dayTree))
  } else {
    const others = earlier.length || morning.length || afternoon.length || evening.length
    // With day parts on an empty Today group is left out, unless the list would be empty without it.
    // In Upcoming the group is named, since Tomorrow follows, and left out when empty (D2).
    if (inUpcoming ? day.length : !parts || day.length || !others) g.push({ key: 'today', heading: others || inUpcoming ? t('Today') : null, rows: withImplied(dayTree(day), { date: p.today }), ...drop('none') })
    if (morning.length) g.push({ key: 'morning', heading: t('Morning'), rows: withImplied(dayTree(morning), { date: p.today, part: 'morning' }), ...drop('morning') })
    if (afternoon.length) g.push({ key: 'afternoon', heading: t('Afternoon'), rows: withImplied(dayTree(afternoon), { date: p.today, part: 'afternoon' }), ...drop('afternoon') })
    if (evening.length) g.push({ key: 'evening', heading: t('This Evening'), rows: withImplied(dayTree(evening), { date: p.today, evening: true }), ...drop('evening') })
  }
  if (waiting.length) {
    const folded = !p.collapsed.has(BLOCKED_OPEN_KEY)
    g.push({ key: 'blocked', heading: t('Blocked'), count: waiting.length, folded, openKey: BLOCKED_OPEN_KEY, rows: folded ? [] : rows(waiting) })
  }
  return [...g, ...closedListGroups(p, row)]
}

/**
 * The day's own tasks under a grouping chosen for Today (builtin-view-options D3): the
 * headings and order of a saved view's grouping, each task once; None is one group, named
 * Today when Earlier is above it. The headings take no drops, and a row shows its part of the day.
 * Under Project the order host's project drops apply (today-project-drops); the others order within their group.
 */
function chosenTodayGroups(p: GroupInput, tasks: Task[], groupBy: ListDisplay['groupBy'], afterEarlier: boolean, inUpcoming: boolean, rows: (list: Task[]) => ListRow[]): ListGroup[] {
  const implied: RowImplied = { date: p.today }
  if (groupBy === 'project' || groupBy === 'priority' || groupBy === 'label') {
    const named = (key: string) => (groupBy === 'project' ? key !== 'inbox' && key !== 'unknown' : groupBy === 'label' && key !== 'none')
    return groupTasks(tasks, groupBy, { today: p.today, labels: p.labels ?? [], projects: p.projects }, true).map((x) => ({
      key: `day:${x.key}`, heading: x.heading, rows: withImplied(rows(x.tasks), groupBy === 'project' ? { ...implied, project: true } : implied),
      ...(named(x.key) ? { named: true as const } : {}),
      ...(groupBy === 'project' && named(x.key) ? { project: x.key } : {}),
      // A line stays within a priority or label group (day-manual-order D2); projects take project drops.
      ...(groupBy !== 'project' && !inUpcoming ? { daySlot: SLOT_NONE } : {}),
    }))
  }
  if (inUpcoming ? !tasks.length : !tasks.length && afterEarlier) return []
  return [{ key: 'day:all', heading: afterEarlier || inUpcoming ? t('Today') : null, rows: withImplied(rows(tasks), implied), ...(inUpcoming ? {} : { daySlot: SLOT_NONE }) }]
}

/** Today's Waiting for a slot and Done today groups (today-closed-list D1, D6): folded unless opened on this device. */
function closedListGroups(p: GroupInput, row: (task: Task) => ListRow): ListGroup[] {
  const g: ListGroup[] = []
  const waiting = p.closedList?.waiting ?? []
  if (p.closedList && waiting.length) {
    const folded = !p.collapsed.has(WAITING_OPEN_KEY)
    // Folded, the waiting tasks with a time today stay in sight (today-waiting-time-sensitive D2); opened, the group is as before.
    const soon = folded ? waitingTimeSensitive(waiting, p.today, p.closedList.now) : []
    g.push({
      key: 'waiting', heading: t('Waiting for a slot'), count: waiting.length, folded, openKey: WAITING_OPEN_KEY, rows: folded ? [] : waiting.map(row),
      hint: t('Today holds {n}. The next one comes in when you finish one.', { n: p.closedList.limit }),
      ...(soon.length ? { soon, detail: nextDetail(soon, p.resolved) } : {}),
    })
  }
  if (p.doneToday) {
    const folded = !p.collapsed.has(DONE_OPEN_KEY)
    g.push({ key: 'done', heading: t('Done today'), count: p.doneToday.length, folded, openKey: DONE_OPEN_KEY, rows: folded ? [] : p.doneToday.map(row) })
  }
  return g
}

/**
 * The folded Waiting heading's words (today-waiting-time-sensitive D2, today-waiting-time-passed D2):
 * "next: Send the form, 4:00 PM" for the first whose time has not passed (a deadline today
 * without a time: "next: File the taxes, deadline today"); when every time has passed,
 * "time passed: Call the school, 9:00 AM" for one and "2 past their time" for more.
 */
export function nextDetail(soon: readonly WaitingSoon[], resolved?: ResolvedDateTime): string {
  const title = (s: WaitingSoon) => (s.task._e2ee?.raw?.title || !s.task.title ? t('Untitled') : s.task.title)
  const next = nextWaiting(soon)
  if (next) return next.time ? t('next: {title}, {time}', { title: title(next), time: formatTime(next.time, resolved) }) : t('next: {title}, deadline today', { title: title(next) })
  if (soon.length === 1) return t('time passed: {title}, {time}', { title: title(soon[0]), time: formatTime(soon[0].time ?? '', resolved) })
  return t('{n, plural, one {# past its time} other {# past their time}}', { n: soon.length })
}

const sameImplied = (a: RowImplied | undefined, b: RowImplied | undefined): boolean =>
  a === b || (!!a && !!b && a.date === b.date && a.evening === b.evening && a.part === b.part && a.someday === b.someday && a.project === b.project)

const sameAdds = (a: ListRow['subtaskAdds'], b: ListRow['subtaskAdds']): boolean =>
  a === b || (!!a && !!b && a.length === b.length && a.every((x, i) => x.task === b[i].task && x.depth === b[i].depth))

/** Two rows show the same thing: the same task object in the same place. */
export const sameRow = (a: ListRow, b: ListRow): boolean =>
  a.task === b.task && a.depth === b.depth && a.parent === b.parent && a.hasChildren === b.hasChildren
  && a.collapsed === b.collapsed && a.breadcrumb === b.breadcrumb && sameImplied(a.implied, b.implied)
  && a.contextual === b.contextual && sameAdds(a.subtaskAdds, b.subtaskAdds)

const sameValue = (a: unknown, b: unknown): boolean =>
  Object.is(a, b) || (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => Object.is(v, b[i])))

/**
 * The groups of a new derivation with everything that did not change kept from the
 * previous one (OpenSpec change list-rendering-at-scale, D6): a row equal to its
 * previous row is that object, a group whose rows and heading did not change is
 * that object, and when no group changed the previous list itself. One completion
 * in a 2,000-row list then gives new objects to its own row's group only, so the
 * list draws again only the rows that changed, and whatever is derived from the
 * groups (rows, sibling positions, the time column) is kept when nothing moved.
 */
export function keepGroups(prev: readonly ListGroup[] | null, next: ListGroup[]): ListGroup[] {
  if (!prev?.length) return next
  const before = new Map(prev.map((g) => [g.key, g]))
  let changed = prev.length !== next.length
  const out = next.map((g, i) => {
    const old = before.get(g.key)
    if (!old) { changed = true; return g }
    const oldRows = new Map(old.rows.map((r) => [r.task.id, r]))
    let rowsChanged = old.rows.length !== g.rows.length
    const rows = g.rows.map((r, j) => {
      const was = oldRows.get(r.task.id)
      const kept = was && sameRow(was, r) ? was : r
      if (kept !== old.rows[j]) rowsChanged = true
      return kept
    })
    const fieldsSame = (Object.keys(g) as (keyof ListGroup)[]).every((k) => k === 'rows' || sameValue(g[k], old[k])) && Object.keys(old).length === Object.keys(g).length
    if (!rowsChanged && fieldsSame) {
      if (prev[i] !== old) changed = true
      return old
    }
    changed = true
    return { ...g, rows: rowsChanged ? rows : old.rows }
  })
  return changed ? out : (prev as ListGroup[])
}

/**
 * Each row's place among its visible siblings (assistive-tech-semantics): the tree's
 * aria-posinset and aria-setsize, so a subtask is announced as one.
 */
export function siblingPositions(groups: readonly ListGroup[]): Map<string, { pos: number; size: number }> {
  const out = new Map<string, { pos: number; size: number }>()
  for (const g of groups) {
    const sets = new Map<string | null, string[]>()
    for (const r of g.rows) appendTo(sets, r.parent, r.task.id)
    for (const ids of sets.values()) ids.forEach((id, i) => out.set(id, { pos: i + 1, size: ids.length }))
  }
  return out
}

/** Section key ('' = "No section") of each top-level row or card in a sectioned project. */
export function sectionOfRows(board: boolean, columns: readonly ListColumn[], groups: readonly ListGroup[]): Map<string, string> {
  const m = new Map<string, string>()
  if (board) for (const c of columns) for (const task of c.cards) m.set(task.id, c.key)
  else for (const g of groups) {
    const key = g.section !== undefined ? g.section?.id ?? '' : g.laterOf
    // An open sub-project's rows keep their own section (subproject-inline D5).
    for (const r of g.rows) if (r.parent === null && (g.subProject || key !== undefined)) m.set(r.task.id, g.subProject ? r.task.section_id ?? '' : key!)
  }
  return m
}

/** In the collapsed set when the project's Completed group is open on this device; closed by default (project-completed-section). */
export const completedOpenKey = (projectId: string) => `project:${projectId}:completed:open`

/** Every completed task of a project, most recently completed first, for its Completed group (project-completed-section). */
export function completedNewestFirst(bySection: Map<string, Task[]>): Task[] {
  return [...bySection.values()].flat().sort((a, b) => (b.completed_at ?? 0) - (a.completed_at ?? 0))
}

/**
 * completedBySection after `changes` (incremental-list-updates D2): the same map when no
 * changed row is a completed task of the project; otherwise the section lists that held
 * or now hold a changed row, each in the snapshot's order (by id).
 */
export function patchCompletedBySection(prev: Map<string, Task[]>, changes: readonly TaskChange[], _tasks: readonly Task[], projectId: string | null, sectionMap: Map<string, Section>): Map<string, Task[]> | null {
  if (!projectId) return prev
  const counts = (task: Task | undefined): task is Task => !!task && task.project_id === projectId && !!task.completed_at && !task.skipped
  let next: Map<string, Task[]> | null = null
  for (const c of changes) {
    const was = counts(c.before) ? effectiveSection(c.before, sectionMap) ?? '' : null
    const is = counts(c.after) ? effectiveSection(c.after, sectionMap) ?? '' : null
    if (was === null && is === null) continue
    next ??= new Map(prev)
    for (const key of new Set([was, is])) {
      if (key === null) continue
      const list = patchSorted(next.get(key) ?? [], [{ id: c.id, after: key === is ? c.after : undefined }], () => true).list
      if (list.length) next.set(key, list)
      else next.delete(key)
    }
  }
  return next ?? prev
}

/** Completed tasks of the project by section key, for "n completed" and Show (task-list-presentation "Empty groups"). */
export function completedBySection(allTasks: readonly Task[], projectId: string | null, sectionMap: Map<string, Section>): Map<string, Task[]> {
  const m = new Map<string, Task[]>()
  if (!projectId) return m
  for (const task of allTasks) {
    if (task.project_id !== projectId || !task.completed_at || task.skipped) continue
    appendTo(m, effectiveSection(task, sectionMap) ?? '', task)
  }
  return m
}
