// The list body (OpenSpec change web-component-structure): rows, the grouped list
// with its headers and section groups, and the logbook's "Show more". The board and
// the timeline have their own bodies (BoardView, TimelineView).
import { Fragment, type ReactNode } from 'react'
import { t } from '../../lib/i18n'
import { BLOCKED_OPEN_KEY, flatRow, type ListGroup, type ListRow as Row } from '../../lib/listGroups'
import type { DropAt } from '../listDrop'
import { memberName } from '../../lib/sharing'
import type { Progress } from '../../lib/subtasks'
import type { HabitStats } from '../../lib/habits'
import type { FieldDef, Label, Membership, Project, Task } from '../../lib/types'
import { Button, ListGroupHeader } from '../../ui'
import { sectionTarget } from '../BoardView'
import { groupKey, setGroupCollapsed } from '../collapsedGroups'
import { FieldColumnsRow, FieldColumnsTable } from '../FieldColumns'
import { SectionHeader, SectionQuickAdd } from '../Sections'
import { ListRow, SubtaskInput, type RowActions } from './ListRow'
import type { ListRoute } from './useListModel'

export interface RowContext {
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
  habits: Map<string, HabitStats>
  isReadOnly: (task: Task) => boolean
  board: boolean
  manual: boolean
  treeView: boolean
  dropAt: DropAt | null
  draggingId: string | null
  ticked: ReadonlySet<string>
  showCheckbox: boolean
  fieldColumns: boolean
  projectFieldDefs: FieldDef[]
  siblingPos: Map<string, { pos: number; size: number }>
  actions: RowActions
  addingUnder: string | null
  onCloseSubtask: () => void
  /** The row being edited in place, and its editor (inline-task-editing). */
  inlineId?: string | null
  renderInline?: (task: Task) => ReactNode
}

/** One task line (or a board card), inside the columns table when that layout is on (custom-fields). */
export function rowRenderer(c: RowContext): (r: Row) => ReactNode {
  const tree = c.treeView && !c.board
  const line = (r: Row) => {
    // The row being edited in place is not dragged: a press in its field selects text.
    const editing = !c.board && c.inlineId === r.task.id
    return (
      <Fragment key={r.task.id}>
        <ListRow
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
          implied={r.implied}
          omitLabel={c.view === 'label' ? c.labelId : undefined}
          selected={r.task.id === c.selectedId}
          progress={c.progress.get(r.task.id)}
          blockedBy={c.blocked.get(r.task.id)}
          habit={c.habits.get(r.task.id)}
          readOnly={c.isReadOnly(r.task)}
          card={c.board}
          draggable={!editing && !c.isReadOnly(r.task)}
          reorderable={c.manual}
          collapsible={tree}
          dropIndicator={c.dropAt?.id === r.task.id ? c.dropAt.zone : null}
          dragging={c.draggingId === r.task.id}
          ticked={c.ticked.has(r.task.id)}
          showCheckbox={c.showCheckbox}
          hideFieldBadges={c.fieldColumns}
          posInSet={tree ? c.siblingPos.get(r.task.id)?.pos : undefined}
          setSize={tree ? c.siblingPos.get(r.task.id)?.size : undefined}
          actions={c.actions}
          inline={editing ? c.renderInline?.(r.task) : undefined}
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
  completed?: { tasks: Task[]; open: boolean; onToggle: () => void }
}

/** The list's groups: section groups of a project (headings are drop targets), or headed groups. */
export function GroupedList(p: GroupedListProps) {
  /** The rows of a group: a list, or a row group of the columns table (custom-fields). */
  const rowList = (children: ReactNode, extra?: Record<string, string>) => (p.fieldColumns
    ? <div role="rowgroup" {...extra}>{children}</div>
    : <ul {...extra}>{children}</ul>)
  const body = [...p.groups.map((g, gi) => (g.section !== undefined && p.project
    ? <SectionGroup key={g.key} g={g} first={gi <= 1} last={gi === p.groups.length - 1} rowList={rowList} {...p} project={p.project} />
    : <HeadedGroup key={g.key} g={g} rowList={rowList} {...p} />)),
  p.completed && p.completed.tasks.length > 0 && <CompletedGroup key="completed" c={p.completed} rowList={rowList} renderRow={p.renderRow} fieldColumns={p.fieldColumns} />]
  return p.fieldColumns ? <FieldColumnsTable defs={p.projectFieldDefs}>{body}</FieldColumnsTable> : <>{body}</>
}

type RowList = (children: ReactNode, extra?: Record<string, string>) => ReactNode

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
      {rowList(g.rows.map((r) => p.renderRow(r)))}
      {g.count === 0 && p.revealed.has(g.key) && rowList(
        (p.doneBySection.get(key) ?? []).map((task) => p.renderRow(flatRow(task))),
        { 'data-revealed-completed': '' },
      )}
    </section>
  )
}

/** A date, project, Later or Blocked group; collapsible per device. */
function HeadedGroup({ g, rowList, view, collapsedGroups, toggleCollapsed, renderRow }: GroupedListProps & { g: ListGroup; rowList: RowList }) {
  if (g.rows.length === 0 && g.folded === undefined) return null
  const collapsed = collapsedGroups.has(groupKey(view, g.key))
  return (
    <section className="mb-4" data-group={g.key}>
      {g.folded !== undefined ? (
        <ListGroupHeader title={g.heading ?? ''} count={g.count} collapsed={g.folded} onToggle={() => toggleCollapsed(BLOCKED_OPEN_KEY)} tone="muted" />
      ) : g.heading && (
        <ListGroupHeader title={g.heading} count={g.note ? undefined : g.rows.length} note={g.note} tone={g.key === 'overdue' ? 'danger' : 'default'}
          collapsed={collapsed} onToggle={() => setGroupCollapsed(view, g.key, !collapsed)} />
      )}
      {!(g.heading && g.folded === undefined && collapsed) && rowList(g.rows.map((r) => renderRow(r)))}
    </section>
  )
}

/**
 * The project's completed tasks at the end of its list (project-completed-section):
 * closed by default, newest first; unchecking one puts it back among the open tasks.
 */
function CompletedGroup({ c, rowList, renderRow, fieldColumns }: { c: NonNullable<GroupedListProps['completed']>; rowList: RowList; renderRow: (r: Row) => ReactNode; fieldColumns: boolean }) {
  return (
    <section role={fieldColumns ? 'rowgroup' : undefined} className="mb-4" data-completed-group>
      <ListGroupHeader title={t('Completed')} count={c.tasks.length} collapsed={!c.open} onToggle={c.onToggle} tone="muted" />
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
