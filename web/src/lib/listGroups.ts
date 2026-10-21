// The task list's rows and groups as pure functions (OpenSpec change
// web-component-structure): which tasks a list view holds, how they group under
// headings (dates, projects, sections, Later, Blocked, the logbook's days), and the
// tree positions assistive technology announces. TaskListView only wires these to
// the live data; tests call them directly.
import { formatDateHeading, type ResolvedDateTime } from './dates'
import { inboxTasks } from './inbox'
import { groupToday, groupUpcoming, projectOpenList, todayList, upcomingList, withoutArchived } from './dayLists'
import { appendTo, groupBy } from './collections'
import { t } from './i18n'
import { logbookHeading, type LogbookGroup } from './logbook'
import { byPosition, compareByPosition, compareDueThenPriority } from './ordering'
import { effectiveSection, groupBySection } from './sections'
import { breadcrumbOf } from './subtasks'
import { flattenTree, type Tree, type TreeNode } from './tree'
import type { Project, Section, Task } from './types'
import { inAnytime, isSomeday } from './views'
import { linkedPlaceId } from './locations'

/** The list views TaskListView renders, as the router names them. */
export type ListScope =
  | { view: 'inbox' | 'today' | 'upcoming' | 'someday' | 'anytime' | 'completed' | 'assigned' }
  | { view: 'project' | 'label' | 'place'; id: string }

/** One rendered line: a task with its place in the (possibly flat) tree. */
export interface ListRow {
  task: Task
  depth: number
  /** Effective tree parent in this view; null at the top level. */
  parent: string | null
  hasChildren: boolean
  collapsed: boolean
  breadcrumb: string | null
  /** What the row's view or group heading already says, so a Calm row leaves it out (calm-rows D3). */
  implied?: RowImplied
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
  /** The Someday view: the "Someday" chip is left out. */
  someday?: true
}

/** Sets what a group's heading implies on each of its rows (a new row object only when there is something to imply). */
function withImplied(rows: ListRow[], implied: RowImplied | undefined): ListRow[] {
  return implied ? rows.map((r) => ({ ...r, implied })) : rows
}

export interface ListGroup {
  key: string
  heading: string | null
  rows: ListRow[]
  /** Project list grouped by section (board-view): the section (null = "No section"). */
  section?: Section | null
  /** Open tasks under the heading, also while it is collapsed. */
  count?: number
  sectionCollapsed?: boolean
  /** Today's Blocked group (task-dependencies): folded unless opened on this device. */
  folded?: boolean
  /** Always-visible trailing text of the header (the logbook's "3 done"). */
  note?: string
}

/** A board column: a section ('' = "No section") and its top-level cards. */
export interface ListColumn {
  key: string
  section: Section | null
  cards: Task[]
}

/** Top-level tasks of a sectioned project with their tree nodes. */
export interface SectionBucket {
  key: string
  section: Section | null
  tasks: Task[]
  roots: TreeNode<Task>[]
}

/** Set in the per-device collapse set when Today's Blocked group is open (it starts folded). */
export const BLOCKED_OPEN_KEY = 'today:blocked:open'

/** A row outside the tree (flat views, cards, Later): depth 0, no children. */
export function flatRow(task: Task, breadcrumb: string | null = null): ListRow {
  return { task, depth: 0, parent: null, hasChildren: false, collapsed: false, breadcrumb }
}

/** The tasks a list view holds, in its order (archived projects stay out of cross-project views). */
export function tasksForView(scope: ListScope, allTasks: readonly Task[], projects: readonly Project[], today: string, userId?: string): Task[] {
  // Tasks of archived projects stay out of the cross-project views (lib/dayLists, shared with the display).
  const all = withoutArchived(allTasks as Task[], projects as Project[], scope.view === 'project' ? scope.id : undefined)
  switch (scope.view) {
    case 'inbox':
      // Not placed, and no placed parent (lib/inbox, inbox-means-unplaced).
      return inboxTasks(all, allTasks)
    case 'today':
      return todayList(all, today)
    case 'upcoming':
      return upcomingList(all, today)
    // Someday and Anytime (someday-and-evening D5), grouped by project in listGroups.
    case 'someday':
      return all.filter((task) => !task.completed_at && isSomeday(task)).sort(byPosition)
    case 'anytime':
      return all.filter((task) => inAnytime(task, today)).sort(byPosition)
    case 'completed':
      // The logbook pages through every completion (completed-date-filters D4);
      // a habit's skipped occurrence record is not a completion (habits D6).
      return all.filter((task) => task.completed_at && !task.skipped).sort((a, b) => (b.completed_at ?? 0) - (a.completed_at ?? 0))
    case 'project':
      return projectOpenList(all, scope.id)
    case 'label':
      return all.filter((task) => !task.completed_at && task.labels.includes(scope.id)).sort(byPosition)
    // A place's open tasks (task-locations "Places page"): those whose location links to it.
    case 'place':
      return all.filter((task) => !task.completed_at && linkedPlaceId(task) === scope.id).sort(byPosition)
    case 'assigned':
      return all.filter((task) => !task.completed_at && !!userId && task.assignee_id === userId).sort(compareDueThenPriority)
  }
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
export function boardColumns(buckets: SectionBucket[] | null): ListColumn[] {
  return (buckets ?? []).filter((g) => g.key !== '' || g.tasks.length > 0).map((g) => ({ key: g.key, section: g.section, cards: g.tasks }))
}

export interface GroupInput {
  view: ListScope['view']
  /** The view's tasks after filters; for tree views without the Later ones. */
  tasks: Task[]
  /** Project views: deferred and parked tasks, shown in a Later group at the end (Inbox tasks are never deferred or parked). */
  laterTasks: Task[]
  tree: Tree<Task> | null
  today: string
  resolved: ResolvedDateTime
  /** Collapsed tree rows, and BLOCKED_OPEN_KEY when Today's Blocked group is open. */
  collapsed: ReadonlySet<string>
  blocked: { has(id: string): boolean }
  taskMap: Map<string, Task>
  projects: readonly Project[]
  projectMap: Map<string, Project>
  board: boolean
  columns: ListColumn[]
  buckets: SectionBucket[] | null
  /** Live sections of the project. */
  sectionCount: number
  collapsedSections: readonly string[]
  logbook: { groups: LogbookGroup[] } | null
}

/** The list's groups, in render order: one pass, linear in the number of tasks. */
export function listGroups(p: GroupInput): ListGroup[] {
  const later: ListGroup[] = p.laterTasks.length
    ? [{ key: 'later', heading: t('Later'), rows: p.laterTasks.map((task) => flatRow(task, task.parent_id ? breadcrumbOf(task, p.taskMap) : null)) }]
    : []
  const toRow = (n: TreeNode<Task>): ListRow => ({
    task: n.item,
    depth: n.depth,
    parent: n.parent,
    hasChildren: n.children.length > 0,
    collapsed: p.collapsed.has(n.id),
    // A top-level task that still points at a parent (completed, deleted, missing) names it.
    breadcrumb: n.parent === null && n.item.parent_id ? breadcrumbOf(n.item, p.taskMap) : null,
  })
  const isCollapsed = (id: string) => p.collapsed.has(id)
  // Board: cards are top-level tasks, column by column (keyboard order).
  if (p.board) return p.columns.map((c) => ({ key: c.key, heading: null, rows: c.cards.map((task) => flatRow(task)) }))
  if (p.buckets && p.sectionCount > 0) {
    // Project list with sections: "No section" first, then each section by position.
    const folded = new Set(p.collapsedSections)
    const bySection: ListGroup[] = p.buckets.filter((g) => g.section || g.roots.length > 0).map((g) => ({
      key: `section:${g.key}`,
      heading: g.section ? g.section.name : t('No section'),
      section: g.section,
      sectionCollapsed: folded.has(g.key),
      count: flattenTree(g.roots).length,
      rows: folded.has(g.key) ? [] : flattenTree(g.roots, isCollapsed).map(toRow),
    }))
    return [...bySection, ...later]
  }
  // Project and Inbox: one depth-first pass over the built tree (linear in task count).
  if (p.tree) return [{ key: 'all', heading: null, rows: flattenTree(p.tree.roots, isCollapsed).map(toRow) }, ...later]
  return flatGroups(p)
}

/** Cross-project and date views: flat, each matching task once, with its parent named. */
function flatGroups(p: GroupInput): ListGroup[] {
  const row = (task: Task) => flatRow(task, task.parent_id ? breadcrumbOf(task, p.taskMap) : null)
  if (p.view === 'today') {
    // Blocked tasks wait in their own group at the end (task-dependencies D7);
    // This Evening below the day's tasks (someday-and-evening).
    const { overdue, day, evening, blocked: waiting } = groupToday(p.tasks, p.today, p.blocked)
    const g: ListGroup[] = []
    // Overdue and Blocked imply nothing: how late a task is stays visible (calm-rows D3).
    if (overdue.length) g.push({ key: 'overdue', heading: t('Overdue'), rows: overdue.map(row) })
    g.push({ key: 'today', heading: overdue.length || evening.length ? t('Today') : null, rows: withImplied(day.map(row), { date: p.today }) })
    if (evening.length) g.push({ key: 'evening', heading: t('This Evening'), rows: withImplied(evening.map(row), { date: p.today, evening: true }) })
    if (waiting.length) {
      const folded = !p.collapsed.has(BLOCKED_OPEN_KEY)
      g.push({ key: 'blocked', heading: t('Blocked'), count: waiting.length, folded, rows: folded ? [] : waiting.map(row) })
    }
    return g
  }
  if (p.logbook) {
    // Completed as a logbook: one group per local completion day, newest first.
    return p.logbook.groups.map((g) => ({
      key: g.date, heading: logbookHeading(g.date, p.today, p.resolved), note: t('{n, plural, one {# done} other {# done}}', { n: g.tasks.length }), rows: g.tasks.map(row),
    }))
  }
  if (p.view === 'upcoming') {
    return groupUpcoming(p.tasks, p.today).map(({ date, tasks: list }) => ({ key: date, heading: formatDateHeading(date, p.today, p.resolved), rows: withImplied(list.map(row), { date }) }))
  }
  if (p.view === 'label' || p.view === 'assigned' || p.view === 'someday' || p.view === 'anytime') {
    // Grouped by project: Inbox first, then projects in sidebar order; flat rows with breadcrumbs.
    const byProject = groupBy(p.tasks, (tk) => tk.project_id ?? '')
    const order = ['', ...p.projects.slice().sort(compareByPosition).map((pr) => pr.id)]
    const implied: RowImplied | undefined = p.view === 'someday' ? { someday: true } : undefined
    return order.filter((id) => byProject.has(id)).map((id) => ({
      key: id || 'inbox', heading: id ? p.projectMap.get(id)?.name ?? t('Project') : t('Inbox'), rows: withImplied(byProject.get(id)!.map(row), implied),
    }))
  }
  return [{ key: 'all', heading: null, rows: p.tasks.map(row) }]
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
  else for (const g of groups) if (g.section !== undefined) for (const r of g.rows) if (r.parent === null) m.set(r.task.id, g.section?.id ?? '')
  return m
}

/** In the collapsed set when the project's Completed group is open on this device; closed by default (project-completed-section). */
export const completedOpenKey = (projectId: string) => `project:${projectId}:completed:open`

/** Every completed task of a project, most recently completed first, for its Completed group (project-completed-section). */
export function completedNewestFirst(bySection: Map<string, Task[]>): Task[] {
  return [...bySection.values()].flat().sort((a, b) => (b.completed_at ?? 0) - (a.completed_at ?? 0))
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
