// The list body (OpenSpec change web-component-structure): rows, the grouped list
// with its headers and section groups, and the logbook's "Show more". The board and
// the timeline have their own bodies (BoardView, TimelineView).
import { type CSSProperties, Fragment, isValidElement, lazy, Suspense, type ReactElement, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { t, useLanguageVersion } from '../../lib/i18n'
import { BLOCKED_OPEN_KEY, earlierCollapsed, flatRow, type ListGroup, type ListRow as Row } from '../../lib/listGroups'
import type { DropAt } from '../listDrop'
import { memberName } from '../../lib/sharing'
import type { Progress } from '../../lib/subtasks'
import type { HabitStats } from '../../lib/habits'
import type { RowLayout } from '../../lib/rowLayout'
import type { FieldDef, Label, Membership, Project, Task } from '../../lib/types'
import { Button, ListGroupHeader, type HueName } from '../../ui'

// Upcoming's projected rows load with their switch (series-occurrences D4).
const ProjectedGroupRows = lazy(() => import('./ProjectedGroupRows'))
import { logWinRequest } from '../signals'
import { sectionTarget, type BoardColumn } from '../BoardView'
import { groupKey, setGroupCollapsed } from '../collapsedGroups'
import { FieldColumnsRow, FieldColumnsTable } from '../FieldColumns'
import { SectionHeader, SectionQuickAdd } from '../Sections'
import { departures$, ghostMemory, isGhost, listCommitted, markGhost, registerList, withGhosts } from '../motion'
import type { FlowView } from '../../lib/useFlow'
import { TaskListRow, SubtaskInput, type RowActions } from './TaskListRow'
import { WaitingSoonList } from './WaitingSoon'
import type { ListRoute } from './useListModel'
import { useFullTitles } from '../../lib/fullTitles'
import { BLOCK_ROWS, BLOCKS_FROM, blockOf, rowBlocks, type RowBlock } from './rowBlocks'
import { RowBlockContext } from './rowBlockContext'
import { keysBetween } from '../../lib/taskDelta'

export interface RowContext {
  /** Touch rows follow a swipe (phone-v2 D3): coarse pointer, nothing ticked, not select mode. */
  swipe?: boolean
  view: ListRoute['view']
  /** The open label's id in a label's view: its own chip is left out of Calm rows (calm-rows D3). */
  labelId?: string
  userId?: string
  projectMap: Map<string, Project>
  labelMap: Map<string, Label>
  memberMap: Map<string, Membership>
  selectedId: string | null
  progress: Map<string, Progress>
  blocked: Map<string, number>
  /** Steps waiting in sequence (project-flow-modes). */
  flow?: FlowView
  habits: Map<string, HabitStats>
  isReadOnly: (task: Task) => boolean
  board: boolean
  manual: boolean
  /** The list has its own order (a label page, view-manual-order): every row can be picked up to place it. */
  ownOrder?: boolean
  treeView: boolean
  dropAt: DropAt | null
  draggingId: string | null
  ticked: ReadonlySet<string>
  showCheckbox: boolean
  /** Touch Select mode is on: a plain tap on a row ticks it. */
  selectMode?: boolean
  fieldColumns: boolean
  projectFieldDefs: FieldDef[]
  siblingPos: Map<string, { pos: number; size: number }>
  /** The list shows the time column (rows-v2 D2). */
  timeColumn: boolean
  /** A project's or label's own row layout (row-layouts); absent follows the account's. */
  rowLayout?: RowLayout
  actions: RowActions
  addingUnder: string | null
  onCloseSubtask: () => void
  /** The row being edited in place, and its editor (inline-task-editing). */
  inlineId?: string | null
  renderInline?: (task: Task) => ReactNode
  /** The one row whose details are shown under it (row-expand D4). */
  expandedId?: string | null
  /** A board card's leading edge under Colour by (calendar-clarity); absent with Colour by Project. */
  edgeOf?: (task: Task) => HueName
  /** A project board's notes preview is on (board-polish): cards show two lines of their notes. */
  cardNotes?: boolean
}

/**
 * A group's rows with its departing rows kept in place (motion-v2 D2); counts skip them.
 * Read here, not subscribed: a departure that starts draws only its own row (useDeparture),
 * the list draws again when its data changes (the task left), and a ghost whose departure
 * ended draws nothing (TaskListRow) until the list next draws and forgets it.
 */
export function useGhostGroups(groups: ListGroup[]): ListGroup[] {
  const memory = useRef(ghostMemory<Row>())
  return useMemo(() => {
    const departures = departures$()
    const m = memory.current
    if (departures.size === 0 && m.ghosts.size === 0) {
      m.last = new Map(groups.map((g) => [g.key, g.rows]))
      return groups
    }
    const shown = withGhosts(groups.map((g) => ({ key: g.key, items: g.rows })), (r) => r.task.id, (r) => ({ ...r, task: markGhost({ ...r.task }) }), departures, m)
    return groups.map((g) => (shown.get(g.key)!.length === g.rows.length ? g : { ...g, rows: shown.get(g.key)! }))
  }, [groups])
}

/** A board's cards with their departing cards kept in place (as useGhostGroups). */
export function useGhostColumns(columns: BoardColumn[]): BoardColumn[] {
  const memory = useRef(ghostMemory<Task>())
  return useMemo(() => {
    const departures = departures$()
    const m = memory.current
    if (departures.size === 0 && m.ghosts.size === 0) {
      m.last = new Map(columns.map((c) => [c.key, c.cards]))
      return columns
    }
    const shown = withGhosts(columns.map((c) => ({ key: c.key, items: c.cards })), (task) => task.id, (task) => ({ ...task }), departures, m)
    return columns.map((c) => (shown.get(c.key)!.length === c.cards.length ? c : { ...c, cards: shown.get(c.key)! }))
  }, [columns])
}

/**
 * The list's motion (motion-v2): its groups and board columns with departing rows kept
 * in place (D2), and the hooks a list transition needs: the list is on screen, and it
 * says when it committed, so the new snapshot shows the write (D4). A departure that
 * starts does not draw the list: the clicked row draws its own sequence (useDeparture,
 * list-rendering-at-scale D7).
 */
export function useListMotion(groups: ListGroup[], columns: BoardColumn[]) {
  const shownGroups = useGhostGroups(groups)
  const shownColumns = useGhostColumns(columns)
  useLayoutEffect(() => listCommitted())
  useLayoutEffect(() => registerList(), [])
  return { groups: shownGroups, columns: shownColumns }
}

/** Rows that count: everything but the departing ones. */
export const liveRows = (rows: Row[]): number => rows.reduce((n, r) => n + (isGhost(r.task) ? 0 : 1), 0)

/** One task line (or a board card), inside the columns table when that layout is on (custom-fields). */
export function rowRenderer(c: RowContext): (r: Row) => ReactNode {
  const tree = c.treeView && !c.board
  const line = (r: Row) => {
    // The row being edited in place is not dragged: a press in its field selects text.
    const editing = !c.board && c.inlineId === r.task.id
    // A departing row (motion-v2 D2) is a picture: no cursor, tick, drag or drop. The row
    // follows its own task's sequence (TaskListRow), so a completion draws only that row.
    const ghost = isGhost(r.task)
    return (
      <Fragment key={r.task.id}>
        <TaskListRow
          task={r.task}
          depth={r.depth}
          breadcrumb={r.breadcrumb}
          hasChildren={r.hasChildren}
          collapsed={r.collapsed}
          project={r.task.project_id ? c.projectMap.get(r.task.project_id) : undefined}
          labelMap={c.labelMap}
          assignee={r.task.assignee_id && r.task.project_id && c.memberMap.has(r.task.project_id)
            ? (r.task.assignee_id === c.userId ? t('You') : memberName(r.task.assignee_id, c.memberMap) ?? t('Former member')) : null}
          assignedToMe={!!c.userId && r.task.assignee_id === c.userId}
          showProject={c.view !== 'project' && c.view !== 'label' && c.view !== 'inbox'}
          source={c.view === 'inbox' && r.depth === 0 && !c.board}
          implied={r.implied}
          omitLabel={c.view === 'label' ? c.labelId : undefined}
          selected={!ghost && r.task.id === c.selectedId}
          progress={c.progress.get(r.task.id)}
          blockedBy={c.blocked.get(r.task.id)}
          waitsFor={c.flow?.waitsFor(r.task.id)}
          habit={c.habits.get(r.task.id)}
          readOnly={ghost || c.isReadOnly(r.task)}
          shape={c.board ? 'card' : 'row'}
          timeColumn={c.timeColumn}
          layout={c.rowLayout}
          draggable={!ghost && !editing && (!!c.ownOrder || !c.isReadOnly(r.task))}
          reorderable={!ghost && c.manual}
          collapsible={tree}
          expandable={!c.board && !ghost}
          // No row shows its details while a drag runs, so drop zones are one-line rows (row-expand D4).
          expanded={!ghost && !c.draggingId && c.expandedId === r.task.id}
          dropIndicator={!ghost && c.dropAt?.id === r.task.id ? c.dropAt.zone : null}
          dragging={!ghost && c.draggingId === r.task.id}
          ticked={!ghost && c.ticked.has(r.task.id)}
          showCheckbox={c.showCheckbox}
          selectMode={c.selectMode}
          hideFieldBadges={c.fieldColumns}
          treeItem={tree}
          handlers={c.actions}
          swipe={!!c.swipe && !ghost && !editing && !c.board}
          inline={editing ? c.renderInline?.(r.task) : undefined}
          edge={c.board ? c.edgeOf?.(r.task) : undefined}
          notes={c.board && !!c.cardNotes}
        />
        {c.addingUnder === r.task.id && !c.board && (
          <li>
            <SubtaskInput parent={r.task} depth={r.depth + 1} onClose={c.onCloseSubtask} />
          </li>
        )}
      </Fragment>
    )
  }
  return (r) => (c.fieldColumns ? <FieldColumnsRow key={r.task.id} task={r.task} defs={c.projectFieldDefs} row={line(r)} /> : line(r))
}

/**
 * The context fields that a row reads only for itself (its cursor, its tick, its
 * progress, its project…); each row compares its own answers instead. A write gives
 * new maps of progress, blockers, flow and habits, and comparing them as a whole made
 * every row of a 2,000-row list again after each completion (list-rendering-at-scale
 * D6). `siblingPos` is written on the rows by SiblingAria, not drawn.
 */
const ROW_FIELDS = new Set<keyof RowContext>(['selectedId', 'inlineId', 'expandedId', 'dropAt', 'draggingId', 'ticked', 'addingUnder', 'onCloseSubtask',
  'progress', 'blocked', 'flow', 'habits', 'isReadOnly', 'projectMap', 'memberMap', 'siblingPos', 'renderInline'])

const sameProgress = (a: Progress | undefined, b: Progress | undefined): boolean => a === b || (!!a && !!b && a.done === b.done && a.total === b.total)
const sameHabit = (a: HabitStats | undefined, b: HabitStats | undefined): boolean =>
  a === b || (!!a && !!b && a.current === b.current && a.best === b.best && a.pending === b.pending && a.atRisk === b.atRisk)

/**
 * The rows that may read differently from `b` than from `a` (incremental-list-updates D3),
 * worked out once per pair of contexts: the rows the cursor, editing, expanded, adding and
 * drop fields name in either, and the keys the patched maps noted. Null when it cannot
 * say (a map worked out in full, a new tick set, a drag that starts or ends, new
 * projects or memberships): every row is compared.
 */
function mayChange(a: RowContext, b: RowContext): ReadonlySet<string> | null {
  if (a.ticked !== b.ticked || !a.draggingId !== !b.draggingId || a.isReadOnly !== b.isReadOnly || a.projectMap !== b.projectMap || a.memberMap !== b.memberMap) return null
  const ids = new Set<string>()
  for (const x of [a.selectedId, b.selectedId, a.inlineId, b.inlineId, a.expandedId, b.expandedId, a.draggingId, b.draggingId, a.addingUnder, b.addingUnder, a.dropAt?.id, b.dropAt?.id]) if (x) ids.add(x)
  const maps: [object | undefined, object | undefined][] = [[a.progress, b.progress], [a.blocked, b.blocked], [a.flow, b.flow], [a.habits, b.habits]]
  for (const [x, y] of maps) {
    if (x === y) continue
    const keys = x && y ? keysBetween(x, y) : null
    if (!keys) return null
    for (const k of keys) ids.add(k)
  }
  return ids
}

/**
 * Whether row `r` reads the same from the ROW_FIELDS of `a` (the context its element
 * was made with) as of `b`. A field that is the same object is not looked into, so a
 * cursor move compares two ids per row and a write looks up only the maps it renewed.
 */
function sameForRow(a: RowContext, b: RowContext, r: Row): boolean {
  if (a === b) return true
  const task = r.task
  const id = task.id
  const is = (x: unknown) => x === id
  if (is(a.selectedId) !== is(b.selectedId) || is(a.inlineId) !== is(b.inlineId) || is(a.expandedId) !== is(b.expandedId)) return false
  if (is(a.draggingId) !== is(b.draggingId) || !a.draggingId !== !b.draggingId || is(a.addingUnder) !== is(b.addingUnder)) return false
  if ((is(a.dropAt?.id) ? a.dropAt!.zone : null) !== (is(b.dropAt?.id) ? b.dropAt!.zone : null)) return false
  if (a.ticked !== b.ticked && a.ticked.has(id) !== b.ticked.has(id)) return false
  if (a.progress !== b.progress && !sameProgress(a.progress.get(id), b.progress.get(id))) return false
  if (a.blocked !== b.blocked && a.blocked.get(id) !== b.blocked.get(id)) return false
  if (a.flow !== b.flow && (a.flow?.waitsFor(id) ?? null) !== (b.flow?.waitsFor(id) ?? null)) return false
  if (a.habits !== b.habits && !sameHabit(a.habits.get(id), b.habits.get(id))) return false
  if (a.isReadOnly !== b.isReadOnly && a.isReadOnly(task) !== b.isReadOnly(task)) return false
  const pid = task.project_id
  if (pid && a.projectMap !== b.projectMap && a.projectMap.get(pid) !== b.projectMap.get(pid)) return false
  if (pid && task.assignee_id && a.memberMap !== b.memberMap && a.memberMap.get(pid) !== b.memberMap.get(pid)) return false
  return !(is(b.inlineId) && a.renderInline !== b.renderInline)
}

const EMPTY_IDS: ReadonlySet<string> = new Set()

const sameContext = (a: RowContext, b: RowContext): boolean => {
  for (const k of Object.keys(b) as (keyof RowContext)[]) if (!ROW_FIELDS.has(k) && a[k] !== b[k]) return false
  return Object.keys(a).length === Object.keys(b).length
}

/**
 * rowRenderer with each row's element kept while nothing it shows changed
 * (list-rendering-at-scale): a cursor move, a tick or an expanded row gives the
 * same element to every other row, which React passes over without comparing
 * its props. A list draws up to 2,000 rows, and making their elements again took
 * most of a cursor move. Rows are new objects whenever their task or place
 * changes; anything else that changes clears the cache.
 */
export function useRowRenderer(c: RowContext): (r: Row) => ReactNode {
  // A row's words ("You", "Former member") follow the language.
  const language = useLanguageVersion()
  const cache = useRef<{ c: RowContext | null; language: number; rows: WeakMap<Row, { c: RowContext; el: ReactNode }> }>({ c: null, language, rows: new WeakMap() })
  const held = cache.current
  if (!held.c || held.language !== language || !sameContext(held.c, c)) held.rows = new WeakMap()
  held.c = c
  held.language = language
  const rows = held.rows
  const render = rowRenderer(c)
  // The rows that may read differently, worked out once per earlier context: a kept row
  // moves its context forward, so nearly every row shares the last one, and a row outside
  // them is kept without a look at its answers (incremental-list-updates D3).
  const changed = new Map<RowContext, ReadonlySet<string> | null>()
  return (r) => {
    const hit = rows.get(r)
    if (hit) {
      let ids = changed.get(hit.c)
      if (ids === undefined) changed.set(hit.c, (ids = hit.c === c ? EMPTY_IDS : mayChange(hit.c, c)))
      if ((ids && !ids.has(r.task.id)) || sameForRow(hit.c, c, r)) {
        hit.c = c
        return hit.el
      }
    }
    const el = render(r)
    rows.set(r, { c, el })
    return el
  }
}

export interface GroupedListProps {
  groups: ListGroup[]
  view: ListRoute['view']
  project?: Project
  fieldColumns: boolean
  projectFieldDefs: FieldDef[]
  editable: boolean
  renderRow: (r: Row) => ReactNode
  addingTo: string | null
  setAddingTo: (key: string | null) => void
  onToggleSection: (key: string) => void
  doneBySection: Map<string, Task[]>
  revealed: ReadonlySet<string>
  onReveal: (groupKey: string) => void
  toggleCollapsed: (id: string) => void
  collapsedGroups: ReadonlySet<string>
  projects: Project[]
  labels: Label[]
  /** The project's Completed group at the end of the list (project-completed-section). */
  completed?: { tasks: Task[]; open: boolean; onToggle: () => void; gotIt?: boolean }
  /** The always-visible actions of Today's Earlier group, for its task ids (page-rhythm D6). */
  earlierActions?: (ids: readonly string[]) => ReactNode
  /** Upcoming's calendar events for a day, drawn above its tasks and outside the count. */
  eventsFor?: (key: string) => ReactNode
  /** The row the cursor is on: drawn even before the rows above it (useRowLimit). */
  reveal?: string | null
  /** A tree list's positions among siblings, written as ARIA on its rows (SiblingAria). */
  siblingPos?: ReadonlyMap<string, { pos: number; size: number }>
}

/** Rows drawn in the first frame of a list, and added in each later idle moment. */
export const ROWS_PER_STEP = 150

const idle = (fn: () => void): (() => void) => {
  if (typeof requestIdleCallback === 'function') {
    const h = requestIdleCallback(fn, { timeout: 100 })
    return () => cancelIdleCallback(h)
  }
  const h = setTimeout(fn, 0)
  return () => clearTimeout(h)
}

/**
 * How many rows a list draws now (list-rendering-at-scale D1): a long list draws
 * its first rows in the first frame and the rest a step at a time in idle
 * moments, so opening a 2,000-task project shows its top at once; within a few
 * frames every row is in the document (focus, find in page, drag and drop and
 * screen readers reach all of them). A new list (`key`) starts again.
 */
function useRowLimit(key: string, total: number): number {
  const [state, setState] = useState({ key, limit: ROWS_PER_STEP })
  const limit = state.key === key ? state.limit : ROWS_PER_STEP
  useEffect(() => {
    if (state.key !== key) { setState({ key, limit: ROWS_PER_STEP }); return }
    if (limit >= total) return
    return idle(() => setState((s) => (s.key === key ? { key, limit: s.limit + ROWS_PER_STEP } : s)))
  }, [key, limit, total, state.key])
  return limit
}

const countRows = (groups: readonly ListGroup[]) => groups.reduce((n, g) => n + g.rows.length, 0)

/** The list's groups: section groups of a project (headings are drop targets), or headed groups. */
export function GroupedList(p: GroupedListProps) {
  const total = countRows(p.groups)
  const limit = useRowLimit(`${p.view}:${p.project?.id ?? ''}`, total)
  if (limit < total) {
    // Rows past the limit wait for a later step; the row the cursor is on is drawn at once.
    let drawn = 0
    const render = p.renderRow
    p = { ...p, renderRow: (r) => (drawn++ < limit || r.task.id === p.reveal ? render(r) : null) }
  }
  /** The rows of a group: a list, or a row group of the columns table (custom-fields). */
  const rowList = (children: ReactNode[], extra?: Record<string, string>) => (p.fieldColumns
    ? <div role="rowgroup" {...extra}>{children}</div>
    : <RowList extra={extra}>{children}</RowList>)
  // First and last among the real sections: "No section" is not always there (a project
  // whose every task has a section, as after an import), so its slot is not assumed (GitHub issue 359).
  const sectionKeys = p.groups.filter((g) => g.section).map((g) => g.key)
  const body = [...p.groups.map((g) => (g.section !== undefined && p.project
    ? <SectionGroup key={g.key} g={g} first={!g.section || g.key === sectionKeys[0]} last={!g.section || g.key === sectionKeys[sectionKeys.length - 1]} rowList={rowList} {...p} project={p.project} />
    : <HeadedGroup key={g.key} g={g} rowList={rowList} {...p} />)),
  p.completed && p.completed.tasks.length > 0 && <CompletedGroup key="completed" c={p.completed} rowList={rowList} renderRow={p.renderRow} fieldColumns={p.fieldColumns} />]
  const aria = p.siblingPos ? <SiblingAria key="aria" positions={p.siblingPos} drawn={Math.min(limit, total)} /> : null
  const estimate = total > ROWS_PER_STEP ? <RowEstimate key="estimate" list={`${p.view}:${p.project?.id ?? ''}`} /> : null
  return p.fieldColumns ? <FieldColumnsTable defs={p.projectFieldDefs}>{body}{aria}{estimate}</FieldColumnsTable> : <>{body}{aria}{estimate}</>
}

/** Rows read to estimate the height of the rows not drawn yet. */
const ESTIMATE_ROWS = 40

/**
 * The height a long list's rows not drawn yet stand at (list-rendering-at-scale D6):
 * the average of the rows drawn first, set on the list as `--row-estimate` for
 * `.row-offscreen`'s intrinsic size, so the scroll height (and where End or the
 * scroll bar lands) is close before every row has been drawn once. Read after the
 * first paint, from rows already laid out.
 */
function RowEstimate({ list }: { list: string }) {
  const marker = useRef<HTMLSpanElement>(null)
  // Full titles (full-task-titles D3) change how tall rows are: measured again when the
  // setting changes, a frame later, once <html> carries it (the provider above this list
  // sets the attribute in its own effect, after this one).
  const full = useFullTitles()
  const measured = useRef<boolean | null>(null)
  useEffect(() => {
    const measure = () => {
      const root = marker.current?.parentElement
      if (!root) return
      const heights: number[] = []
      for (const li of root.querySelectorAll<HTMLElement>('li[data-task-id]')) {
        if (heights.length >= ESTIMATE_ROWS) break
        if (typeof li.checkVisibility === 'function' && !li.checkVisibility({ contentVisibilityAuto: true })) continue
        const h = li.offsetHeight
        if (h > 0) heights.push(h)
      }
      if (heights.length) root.style.setProperty('--row-estimate', `${Math.round(heights.reduce((a, b) => a + b, 0) / heights.length)}px`)
    }
    const toggled = measured.current !== null && measured.current !== full
    measured.current = full
    if (!toggled || typeof requestAnimationFrame !== 'function') return measure()
    const raf = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(raf)
  }, [list, full])
  return <span ref={marker} hidden />
}

/**
 * The tree list's aria-posinset and aria-setsize (assistive-tech-semantics), written
 * on the rows when the positions change or more rows are drawn: when a row leaves, every sibling's
 * position changes, and as React props that drew all 2,000 rows of a long list
 * again (list-rendering-at-scale). Screen readers read the same attributes.
 *
 * They are written after the change is on screen, a few milliseconds of rows at a
 * time in idle moments (performance-10k). Written in the commit, they took about
 * 40 ms of the phone profile after each completion in the 2,000-row project (the
 * query over every row and a new position on each sibling below it), in the same
 * block as the list's redraw, and a tap that came then waited for all of it.
 */
function SiblingAria({ positions, drawn }: { positions: ReadonlyMap<string, { pos: number; size: number }>; drawn: number }) {
  const marker = useRef<HTMLSpanElement>(null)
  // What each row element carries, so a change writes only the rows whose position
  // changed: reading both attributes of every row after each completion cost about
  // 10 ms in the phone profile (list-rendering-at-scale D6).
  const written = useRef(new WeakMap<HTMLElement, string>())
  useEffect(() => {
    const root = marker.current?.parentElement
    if (!root) return
    const seen = written.current
    // The list's items as the browser keeps them (a live collection): a query over every
    // row took about 15 ms of the phone profile in one piece (incremental-list-updates).
    const rows = root.getElementsByTagName('li')
    let i = 0
    const write = (li: HTMLElement) => {
      const at = li.hasAttribute('aria-level') ? positions.get(li.dataset.taskId!) : undefined
      const want = at ? `${at.pos}/${at.size}` : ''
      if (seen.get(li) === want) return
      seen.set(li, want)
      if (at) {
        if (li.getAttribute('aria-posinset') !== String(at.pos)) li.setAttribute('aria-posinset', String(at.pos))
        if (li.getAttribute('aria-setsize') !== String(at.size)) li.setAttribute('aria-setsize', String(at.size))
      } else {
        li.removeAttribute('aria-posinset')
        li.removeAttribute('aria-setsize')
      }
    }
    return inIdleSlices(() => {
      const li = rows[i++]
      if (li?.dataset.taskId) write(li)
      return i < rows.length
    })
    // Again when the positions change or more rows are drawn; a cursor move changes neither.
  }, [positions, drawn])
  return <span ref={marker} hidden />
}

/** Work in one idle moment, in ms: a tap that comes meanwhile waits about this long at most. */
const IDLE_SLICE_MS = 4

/** Runs `step` in idle moments (tasks where the browser has no idle callback) until it returns false; returns the cancel. */
function inIdleSlices(step: () => boolean): () => void {
  let stopped = false
  let cancel = () => {}
  const later = () => {
    if (typeof requestIdleCallback === 'function') {
      const h = requestIdleCallback(run, { timeout: 2000 })
      cancel = () => cancelIdleCallback(h)
    } else {
      const h = setTimeout(run, 0)
      cancel = () => clearTimeout(h)
    }
  }
  function run() {
    const end = performance.now() + IDLE_SLICE_MS
    let more = true
    while (more && !stopped && performance.now() < end) more = step()
    if (more && !stopped) later()
  }
  later()
  return () => { stopped = true; cancel() }
}

type RowList = (children: ReactNode[], extra?: Record<string, string>) => ReactNode

/**
 * A list of rows, in blocks once it is long (incremental-list-updates D5): the browser
 * skips the blocks far from the viewport instead of each row. A row keeps its block
 * from one drawing to the next (rowBlocks), so a row that comes or goes draws no other
 * row again. The blocks are presentational: the rows stay the items of this one list.
 */
function RowList({ children, extra }: { children: ReactNode[]; extra?: Record<string, string> }) {
  const memory = useRef<{ of: Map<string, string>; on: boolean; next: number; ids: string[]; blocks: RowBlock[] }>({ of: new Map(), on: false, next: 0, ids: [], blocks: [] })
  const m = memory.current
  const shown = children.filter(isValidElement) as ReactElement[]
  m.on = shown.length >= BLOCKS_FROM || (m.on && shown.length >= BLOCK_ROWS)
  if (!m.on) {
    m.of = new Map()
    m.ids = []
    return <ul {...extra}>{children}</ul>
  }
  // The same rows in the same order (a write that changed none of this list's rows, or only their content): the same blocks.
  const ids = shown.map((el) => String(el.key))
  if (ids.length !== m.ids.length || ids.some((id, i) => id !== m.ids[i])) {
    m.blocks = rowBlocks(ids, m.of, () => `block-${m.next++}`)
    m.of = blockOf(m.blocks)
    m.ids = ids
  }
  // Blocks hold consecutive rows, so each is a slice of the rows in order.
  let at = 0
  return (
    <ul {...extra}>
      <RowBlockContext value>
        {m.blocks.map((b) => (
          <li key={b.key} role="none" className="row-block" style={{ '--block-rows': b.ids.length } as CSSProperties}>
            <ul role="none">{shown.slice(at, (at += b.ids.length))}</ul>
          </li>
        ))}
      </RowBlockContext>
    </ul>
  )
}

/** Project list grouped by section (board-view). */
function SectionGroup({ g, first, last, rowList, project, ...p }: GroupedListProps & { g: ListGroup; first: boolean; last: boolean; rowList: RowList; project: Project }) {
  const key = g.section?.id ?? ''
  return (
    <section role={p.fieldColumns ? 'rowgroup' : undefined} className="mb-3 rounded-control data-drop-active:ring-2 data-drop-active:ring-accent" data-drop-target={sectionTarget(key)}>
      <SectionHeader
        section={g.section ?? null}
        count={g.count ?? 0}
        layout="list"
        editable={p.editable}
        first={first}
        last={last}
        collapsed={g.sectionCollapsed}
        onToggleCollapse={() => p.onToggleSection(key)}
        onAdd={() => p.setAddingTo(key)}
        completed={p.doneBySection.get(key)?.length ?? 0}
        revealed={p.revealed.has(g.key)}
        onReveal={() => p.onReveal(g.key)}
      />
      {p.addingTo === key && p.editable && (
        <SectionQuickAdd project={project} sectionId={g.section?.id ?? null} sectionName={g.heading ?? t('No section')} projects={p.projects} labels={p.labels} onClose={() => p.setAddingTo(null)} />
      )}
      {/* Named by its section, so a screen reader says which list of how many tasks it entered (accessibility-aa). */}
      {rowList(g.rows.map((r) => p.renderRow(r)), { 'aria-label': g.heading ?? t('No section') })}
      {g.count === 0 && p.revealed.has(g.key) && rowList(
        (p.doneBySection.get(key) ?? []).map((task) => p.renderRow(flatRow(task))),
        { 'data-revealed-completed': '' },
      )}
    </section>
  )
}

/** A date, project, Later or Blocked group; collapsible per device. */
function HeadedGroup({ g, rowList, view, collapsedGroups, toggleCollapsed, renderRow, earlierActions, projects, eventsFor }: GroupedListProps & { g: ListGroup; rowList: RowList }) {
  const events = view === 'upcoming' ? eventsFor?.(g.key) ?? null : null
  if (g.rows.length === 0 && g.folded === undefined && !g.projected?.length && !events) return null
  // Today's Earlier group (page-rhythm D5): folded above five tasks until this device chooses;
  // Upcoming's Start with Today shares the choice (upcoming-start-with-today D2).
  const earlier = (view === 'today' || view === 'upcoming') && g.key === 'earlier'
  const collapsed = earlier ? earlierCollapsed(collapsedGroups, g.rows.length) : collapsedGroups.has(groupKey(view, g.key))
  const toggle = () => {
    if (!earlier) return setGroupCollapsed(view, g.key, !collapsed)
    setGroupCollapsed('today', 'earlier', !collapsed)
    setGroupCollapsed('today', 'earlier:open', collapsed)
  }
  return (
    <section className="mb-4" data-group={g.key}>
      {g.folded !== undefined ? (
        <ListGroupHeader title={g.heading ?? ''} count={g.count} detail={g.folded ? g.detail : undefined} collapsed={g.folded} onToggle={() => toggleCollapsed(g.openKey ?? BLOCKED_OPEN_KEY)}
          actions={view === 'today' && g.key === 'done' ? <LogWinAction /> : undefined}
          actionsAlwaysVisible={g.key === 'done'} />
      ) : g.heading && partDrop(g.dropPart, (
        <ListGroupHeader title={g.heading} count={g.note || (events && liveRows(g.rows) === 0) ? undefined : liveRows(g.rows)} note={g.note} kind={g.named ? 'named' : 'generated'}
          collapsed={collapsed} onToggle={toggle}
          actions={earlier ? earlierActions?.(g.rows.filter((r) => !isGhost(r.task)).map((r) => r.task.id)) : undefined} actionsAlwaysVisible={earlier} />
      ))}
      {g.hint && g.folded === false && <p className="mb-1 px-1 text-meta text-muted" data-group-hint>{g.hint}</p>}
      {g.folded && g.soon?.length ? <WaitingSoonList soon={g.soon} onOpenGroup={() => toggleCollapsed(g.openKey ?? BLOCKED_OPEN_KEY)} /> : null}
      {!(g.heading && g.folded === undefined && collapsed) && events}
      {!(g.heading && g.folded === undefined && collapsed) && rowList(g.rows.map((r) => renderRow(r)), g.heading ? { 'aria-label': g.heading } : undefined)}
      {/* Upcoming's projected occurrences after the day's tasks, outside its count (series-occurrences D4). */}
      {!(g.heading && collapsed) && (g.projected?.length || g.projectedNote) ? <Suspense fallback={null}><ProjectedGroupRows g={g} projects={projects} /></Suspense> : null}
    </section>
  )
}

/** Today's part headings take a dragged task (day-parts D4), resolved by the drag as `drop:part:<part>`. */
function partDrop(part: ListGroup['dropPart'], header: ReactNode): ReactNode {
  if (!part) return header
  return <div className="rounded-control data-drop-active:ring-2 data-drop-active:ring-accent" data-task-drop={`part:${part}`} data-part-heading={part}>{header}</div>
}

/** Today's Done today header action (today-closed-list D6): quick add with "Log as done" on. */
function LogWinAction() {
  return (
    <Button variant="ghost" size="sm" icon="plus" className="text-meta" onClick={() => logWinRequest.request('today')} data-log-win>
      {t('Log a win')}
    </Button>
  )
}

/**
 * The project's completed tasks at the end of its list (project-completed-section):
 * closed by default, newest first; unchecking one puts it back among the open tasks.
 */
function CompletedGroup({ c, rowList, renderRow, fieldColumns }: { c: NonNullable<GroupedListProps['completed']>; rowList: RowList; renderRow: (r: Row) => ReactNode; fieldColumns: boolean }) {
  return (
    <section role={fieldColumns ? 'rowgroup' : undefined} className="mb-4" data-completed-group>
      {/* In a reusable list the ticked items are "Got it" (reusable-lists D7). */}
      {c.gotIt
        ? <ListGroupHeader title={t('Got it', { context: 'list' })} count={c.tasks.length} countLabel={(n) => t('{n, plural, one {# item ticked off} other {# items ticked off}}', { n })} collapsed={!c.open} onToggle={c.onToggle} />
        : <ListGroupHeader title={t('Completed')} count={c.tasks.length} countLabel={(n) => t('{n, plural, one {# completed task} other {# completed tasks}}', { n })} collapsed={!c.open} onToggle={c.onToggle} />}
      {c.open && rowList(c.tasks.map((task) => renderRow(flatRow(task))))}
    </section>
  )
}

/** The logbook pages through completions (completed-date-filters D4). */
export function LogbookMore({ total, limit, onMore }: { total: number; limit: number; onMore: () => void }) {
  if (total <= limit) return null
  return (
    <div className="mb-4 flex justify-center">
      <Button variant="secondary" size="sm" onClick={onMore} data-logbook-more>
        {t.rich('Show more {older}', { older: <span className="tabular-nums text-muted">{t('{n} older', { n: total - limit })}</span> })}
      </Button>
    </div>
  )
}
