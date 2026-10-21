// The task list's page furniture (OpenSpec change web-component-structure): page
// actions, the layout switch, the duration filter, empty views, the "complete the
// parent too?" prompt and the label and assignee dialogs. Each is a small
// component with props only; TaskListView decides when they show.
import { DURATION_FILTERS, type DurationFilter } from '../../lib/filters'
import { msg, t, translatedMap } from '../../lib/i18n'
import { isPlannedWithoutProject } from '../../lib/inbox'
import { useOpenTasks } from '../../lib/liveTasks'
import type { ProjectViewMode } from '../../lib/sections'
import { keysOf } from '../../lib/shortcuts'
import type { AccountRole, Label, Place, Project, Task } from '../../lib/types'
import { Button, EmptyState as EmptyStatePattern, type EmptyStateAction, type EmptyStateLink, Icon, IconButton, MenuItem, MenuSeparator, Tooltip } from '../../ui'
import { TodayAskAction } from '../assistant/AskEntry'
import { AssigneePicker } from '../AssigneePicker'
import { DEFAULT_DISPLAY_OPTIONS } from '../display/displayOptions'
import { LabelPicker } from '../LabelPicker'
import { Dialog, Menu } from '../../ui'
import { navigate } from '../router'
import { Kbd } from '../shortcuts/Kbd'
import type { ListRoute } from './useListModel'

/** The project layouts, in `v` order (month-and-timeline-views). */
const LAYOUT_LABEL = translatedMap<ProjectViewMode>({ list: msg('List'), board: msg('Board'), timeline: msg('Timeline') })

/** The project header's List / Board / Timeline switch. */
export function LayoutSwitch({ mode, onChoose }: { mode: ProjectViewMode; onChoose: (m: ProjectViewMode) => void }) {
  return (
    <span className="flex rounded-control border border-default text-meta" role="group" aria-label={t('Project layout')}>
      {(['list', 'board', 'timeline'] as const).map((m) => (
        <Tooltip key={m} label={LAYOUT_LABEL[m]} shortcut={keysOf('project.view-mode')}>
          <button type="button" aria-pressed={mode === m} onClick={() => onChoose(m)}
            className={`${m === 'list' ? 'rounded-l-control' : m === 'timeline' ? 'rounded-r-control' : ''} px-2 py-1 ${mode === m ? 'bg-sunken font-medium dark:bg-raised' : 'text-muted hover:bg-sunken dark:hover:bg-raised'}`}>
            {LAYOUT_LABEL[m]}
          </button>
        </Tooltip>
      ))}
    </span>
  )
}

/**
 * "N planned tasks without a project" next to the Inbox title (inbox-means-unplaced
 * D4): where scheduled tasks without a project went, opening Filter with `no project`.
 * Hidden at zero; it sits in the header's meta, so it adds no row of chrome.
 */
export function usePlannedWithoutProject(on: boolean): number {
  const open = useOpenTasks()
  return on ? open.filter(isPlannedWithoutProject).length : 0
}

export function PlannedWithoutProject({ count }: { count: number }) {
  return (
    <button type="button" className="text-meta text-muted underline-offset-2 hover:text-default hover:underline" data-planned-line
      onClick={() => navigate({ view: 'filter', q: 'no project' })}>
      {t('{n, plural, one {# planned task without a project} other {# planned tasks without a project}}', { n: count })}
    </button>
  )
}

/**
 * Page actions (ux-overhaul, task-list-presentation): the header row holds them, so
 * nothing sits between the quick add and the first task. Touch screens have no
 * hover: the Select button shows every checkbox (bulk-edit D3).
 */
export function ListPageActions({ route, userRole, rowCount, topLevelCount, selectMode, onSelectMode, filterKey, duration, onDuration, planned = 0 }: {
  route: ListRoute
  userRole?: AccountRole
  rowCount: number
  topLevelCount: number
  selectMode: boolean
  onSelectMode: () => void
  filterKey: string | null
  duration: DurationFilter | null
  onDuration: (kind: DurationFilter | null) => void
  /** Planned tasks without a project: shown here below 768 px, where the header's meta is not. */
  planned?: number
}) {
  return (
    <>
      {route.view === 'today' && <TodayAskAction role={userRole} />}
      {route.view === 'inbox' && planned > 0 && <span className="w-full md:hidden"><PlannedWithoutProject count={planned} /></span>}
      {route.view === 'inbox' && rowCount > 0 && (
        // Process the Inbox one task at a time (inbox-triage); g then p.
        <Tooltip label={t('Process the Inbox')} shortcut="g p">
          <Button variant="secondary" size="sm" icon="inbox" onClick={() => navigate({ view: 'triage' })} data-triage-start>
            {t.rich('Process {count}', { count: <span className="tabular-nums text-muted">{topLevelCount}</span> })}
          </Button>
        </Tooltip>
      )}
      {route.view !== 'completed' && rowCount > 0 && (
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm hidden px-2 py-1 text-body pointer-coarse:inline-flex" aria-pressed={selectMode} onClick={onSelectMode} data-select-mode>
          {selectMode ? t('Done') : t('Select')}
        </button>
      )}
      {filterKey && <DurationFilterControl active={duration} onChange={onDuration} />}
      {(route.view === 'today' || route.view === 'upcoming') && (
        // Display mode (display-mode D6): this view in large type, for a tablet or an e-ink panel.
        <IconButton size="sm" icon="monitor" label={t('Display mode')} data-display-mode
          onClick={() => navigate({ view: 'display', target: { kind: route.view as 'today' | 'upcoming' }, options: { ...DEFAULT_DISPLAY_OPTIONS } })} />
      )}
    </>
  )
}

/**
 * The duration filter as a page action (ux-overhaul, time-blocking "Duration filter"):
 * a Filter menu in the header, and one chip with a clear control while a filter is on.
 */
function DurationFilterControl({ active, onChange }: { active: DurationFilter | null; onChange: (kind: DurationFilter | null) => void }) {
  const current = DURATION_FILTERS.find((f) => f.kind === active)
  return (
    <span className="flex items-center gap-1" data-duration-filter>
      {current && (
        <span className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent-soft py-0.5 pl-2.5 pr-1 text-meta font-medium text-on-accent-soft" data-duration-active>
          {current.label}
          <button type="button" className="touch-target flex h-5 w-5 items-center justify-center rounded-full hover:bg-accent/10" aria-label={t('Clear filter')} onClick={() => onChange(null)} data-clear-duration>
            <Icon name="x" size="xs" />
          </button>
        </span>
      )}
      <Menu kind="menu" label={t('Filter')} title={t('Filter by duration')} trigger={<Icon name="filter" />} triggerClassName={`ui-btn ui-btn--ghost ui-btn--sm touch-target px-2 py-1 ${active ? 'text-accent' : ''}`} width="sm:w-56">
        {DURATION_FILTERS.map((f) => (
          <MenuItem key={f.kind} label={f.label} description={f.title} checked={active === f.kind} onSelect={() => onChange(active === f.kind ? null : f.kind)} />
        ))}
        {active && <MenuSeparator />}
        {active && <MenuItem label={t('Clear filter')} icon="x" onSelect={() => onChange(null)} />}
      </Menu>
    </span>
  )
}

export function placeholderFor(route: ListRoute, project?: Project, label?: Label, place?: Place): string {
  switch (route.view) {
    case 'today':
      return t('Add a task for today…')
    case 'upcoming':
      return t('Add a task for tomorrow…')
    case 'someday':
      return t('Add a someday task…')
    case 'anytime':
      return t('Add a task…')
    case 'project':
      return project?.name ? t('Add a task to {project}…', { project: project.name }) : t('Add a task to this project…')
    case 'label':
      return label?.name ? t('Add a task labelled {label}…', { label: label.name }) : t('Add a task with this label…')
    case 'place':
      return place?.name ? t('Add a task at {place}…', { place: place.name }) : t('Add a task at this location…')
    case 'assigned':
      return t('Add a task assigned to you…')
    default:
      return t('Add a task to your Inbox…')
  }
}

// Empty views (OpenSpec change lean-chrome D7, task-list-presentation "Empty views"):
// one sentence, one primary action, at most one secondary link, rendered through the
// EmptyState primitive; the action's key is in its tooltip on fine pointers only.
type EmptyView = ListRoute['view']
interface EmptyCopy { title: string; action: 'add' | 'inbox' | 'today' }
const EMPTY_COPY: Record<EmptyView, EmptyCopy> = {
  inbox: { get title() { return t('Inbox zero: every task has a place.') }, action: 'add' },
  today: { get title() { return t('Nothing due today.') }, action: 'add' },
  upcoming: { get title() { return t('Nothing scheduled yet.') }, action: 'add' },
  anytime: { get title() { return t('Nothing waiting for a free moment.') }, action: 'add' },
  someday: { get title() { return t('Nothing parked for later.') }, action: 'add' },
  assigned: { get title() { return t('Nothing is assigned to you.') }, action: 'inbox' },
  project: { get title() { return t('This project has no open tasks.') }, action: 'add' },
  label: { get title() { return t('No open task carries this label.') }, action: 'add' },
  place: { get title() { return t('No open task happens at this location.') }, action: 'add' },
  completed: { get title() { return t('Nothing completed yet.') }, action: 'today' },
}

/** The primary action of an empty view: add a task (the view's quick add), or open Inbox or Today. */
function emptyAction(kind: EmptyCopy['action'], onAdd: () => void): EmptyStateAction {
  if (kind === 'today') return { label: t('Open Today'), onClick: () => navigate({ view: 'today' }), shortcut: keysOf('go.today') }
  if (kind === 'inbox') return { label: t('Open Inbox'), onClick: () => navigate({ view: 'inbox' }), shortcut: keysOf('go.inbox') }
  return { label: t('Add a task'), onClick: onAdd, shortcut: keysOf('list.quick-add') }
}

export function EmptyState({ view, waiting = 0, readOnly = false, completed = 0, onShowCompleted, onAdd }: {
  view: EmptyView
  /** Today: tasks due today that all wait for other tasks (task-dependencies). */
  waiting?: number
  /** A shared project the viewer may only read: no quick add, so the action opens the Inbox. */
  readOnly?: boolean
  /** A project's completed tasks while its Completed group is off. */
  completed?: number
  onShowCompleted?: () => void
  onAdd: () => void
}) {
  const copy = EMPTY_COPY[view]
  const blocked = view === 'today' && waiting > 0
  const action = emptyAction(view === 'project' && readOnly ? 'inbox' : copy.action, onAdd)
  const secondary: EmptyStateLink | undefined = blocked
    ? { label: t('{n, plural, one {# waiting for other tasks} other {# waiting for other tasks}}', { n: waiting }), onClick: () => navigate({ view: 'waiting' }) }
    : view === 'today'
      ? { label: t('Open Upcoming'), onClick: () => navigate({ view: 'upcoming' }) }
      : view === 'project' && completed > 0 && onShowCompleted
        ? { label: t('{n, plural, one {Show # completed} other {Show # completed}}', { n: completed }), onClick: onShowCompleted }
        : undefined
  return (
    <div data-empty-state={view}>
      <EmptyStatePattern title={blocked ? t('Nothing is ready to start today.') : copy.title} action={action} secondary={secondary}
        illustration={view === 'inbox' ? 'inbox-zero' : undefined} />
    </div>
  )
}

/** No list matches when the duration filter hides every task. */
export function FilteredEmpty({ onClear }: { onClear: () => void }) {
  return (
    <div data-empty-state="duration">
      <EmptyStatePattern title={t('No task matches this duration filter.')} action={{ label: t('Clear the filter'), onClick: onClear }} />
    </div>
  )
}

/** A project or label route whose target is gone. */
export function MissingTarget({ kind }: { kind: 'project' | 'label' | 'place' }) {
  return (
    <div className="p-6 text-body text-muted">
      {kind === 'project'
        ? <>{t('This project no longer exists.')}{' '}<button className="underline" onClick={() => navigate({ view: 'inbox' })}>{t('Go to Inbox')}</button></>
        : kind === 'place'
          ? <>{t('This saved location no longer exists.')}{' '}<button className="underline" onClick={() => navigate({ view: 'places' })}>{t('All locations')}</button></>
          : <>{t('This label no longer exists.')}{' '}<button className="underline" onClick={() => navigate({ view: 'labels' })}>{t('All labels')}</button></>}
    </div>
  )
}

/** The quick add of a shared project the viewer may only read. */
export function ReadOnlyQuickAdd() {
  return (
    <>
      <input className="ui-input" disabled aria-label={t('Quick add (read-only)')} placeholder={t('You can view this project but not add tasks')} />
      <p role="note" className="mt-1 text-meta text-muted">{t('Read-only: you are a viewer of this shared project.')}</p>
    </>
  )
}

/** After the last open subtask: offer to complete the parent too (Enter) or keep it open (Esc). */
export function CompleteParentPrompt({ parent, onAccept, onDismiss }: { parent: Task; onAccept: () => void; onDismiss: () => void }) {
  return (
    <div role="status" className="fixed inset-x-0 z-40 flex justify-center px-4" style={{ bottom: 'calc(var(--vv-bottom, 0px) + max(1rem, env(safe-area-inset-bottom)))' }}>
      <div className="flex flex-wrap items-center gap-3 rounded-control border border-default bg-surface px-4 py-2 text-body shadow-2">
        <span className="user-text min-w-0">{t.rich('All subtasks done. Complete <b>{title}</b> too?', { title: parent.title || t('Untitled'), b: (chunks) => <strong>{chunks}</strong> })}</span>
        <button className="ui-btn ui-btn--primary ui-btn--sm text-meta" onClick={onAccept}>{t('Complete')} <Kbd k="Enter" only className="ml-1 border-on-accent/40 bg-accent-hover text-on-accent" /></button>
        <button className="ui-btn ui-btn--ghost ui-btn--sm text-meta" onClick={onDismiss}>{t('Keep open')} <Kbd k="Esc" only className="ml-1" /></button>
      </div>
    </div>
  )
}

/** The assignee (Shift+A) and label (`L`) dialogs of the cursor task. */
export function RowPickerDialogs({ assignFor, pickerFor, userId, onCloseAssign, onClosePicker }: {
  assignFor: string | null
  pickerFor: string | null
  userId?: string
  onCloseAssign: () => void
  onClosePicker: () => void
}) {
  return (
    <>
      {assignFor && userId && (
        <Dialog title={t('Assign')} label={t('Assign task')} onClose={onCloseAssign}>
          <AssigneePicker taskId={assignFor} userId={userId} onClose={onCloseAssign} />
          <p className="mt-2 px-1 text-hint text-faint">{t('Type to filter · Enter assigns · Esc closes')}</p>
        </Dialog>
      )}
      {pickerFor && (
        <Dialog title={t('Labels')} label={t('Labels for task')} onClose={onClosePicker}>
          <LabelPicker taskId={pickerFor} onClose={onClosePicker} />
          <p className="mt-2 px-1 text-hint text-faint">{t('Enter toggles or creates · Esc closes')}</p>
        </Dialog>
      )}
    </>
  )
}
