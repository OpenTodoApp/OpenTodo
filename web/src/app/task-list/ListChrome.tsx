// The task list's page furniture (OpenSpec change web-component-structure): page
// actions, the layout switch, the duration filter, empty states, the "complete the
// parent too?" prompt and the label and assignee dialogs. Each is a small
// component with props only; TaskListView decides when they show.
import { DURATION_FILTERS, type DurationFilter } from '../../lib/filters'
import { msg, t, translatedMap } from '../../lib/i18n'
import type { ProjectViewMode } from '../../lib/sections'
import { keysOf } from '../../lib/shortcuts'
import type { AccountRole, Label, Project, Task } from '../../lib/types'
import { Button, EmptyState as EmptyStatePattern, Icon, IconButton, type IconName, MenuItem, MenuSeparator, Tooltip } from '../../ui'
import { TodayAskAction } from '../assistant/AskEntry'
import { AssigneePicker } from '../AssigneePicker'
import { DEFAULT_DISPLAY_OPTIONS } from '../display/displayOptions'
import { LabelPicker } from '../LabelPicker'
import { Dialog, useFinePointer } from '../overlay'
import { Menu } from '../overlay/Menu'
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
 * Page actions (ux-overhaul, task-list-presentation): the header row holds them, so
 * nothing sits between the quick add and the first task. Touch screens have no
 * hover: the Select button shows every checkbox (bulk-edit D3).
 */
export function ListPageActions({ route, userRole, rowCount, topLevelCount, selectMode, onSelectMode, filterKey, duration, onDuration }: {
  route: ListRoute
  userRole?: AccountRole
  rowCount: number
  topLevelCount: number
  selectMode: boolean
  onSelectMode: () => void
  filterKey: string | null
  duration: DurationFilter | null
  onDuration: (kind: DurationFilter | null) => void
}) {
  return (
    <>
      {route.view === 'today' && <TodayAskAction role={userRole} />}
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

export function placeholderFor(route: ListRoute, project?: Project, label?: Label): string {
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
    case 'assigned':
      return t('Add a task assigned to you…')
    default:
      return t('Add a task to your Inbox…')
  }
}

// Empty states name the action first (first-run spec): an icon, one sentence, one
// button that does it, and the key hint on a second line only with a fine pointer.
const EMPTY: Record<ListRoute['view'], { icon: IconName; title: string }> = {
  inbox: { icon: 'inbox', get title() { return t('Your Inbox is empty') } },
  today: { icon: 'sun', get title() { return t('Nothing due today') } },
  upcoming: { icon: 'calendar-days', get title() { return t('Nothing scheduled yet') } },
  someday: { icon: 'coffee', get title() { return t('Nothing parked for later') } },
  anytime: { icon: 'layers', get title() { return t('Nothing to do whenever') } },
  completed: { icon: 'circle-check-big', get title() { return t('Nothing completed yet') } },
  project: { icon: 'folder', get title() { return t('This project has no open tasks') } },
  label: { icon: 'tag', get title() { return t('No open task carries this label') } },
  assigned: { icon: 'user-check', get title() { return t('Nothing is assigned to you') } },
}

export function EmptyState({ view, waiting = 0, readOnly = false, onAdd }: { view: ListRoute['view']; waiting?: number; readOnly?: boolean; onAdd: () => void }) {
  const fine = useFinePointer()
  const { icon, title } = EMPTY[view]
  // Everything due today waits for other tasks (task-dependencies): say so.
  const body = view === 'today' && waiting > 0
    ? t('{n, plural, one {One task is waiting for other tasks below.} other {# tasks are waiting for other tasks below.}}', { n: waiting })
    : undefined
  const action = view === 'completed'
    ? { label: t('Open Today'), run: () => navigate({ view: 'today' }), hint: <>{t.rich('Press {g} then {key} to open Today', { g: <kbd className="ui-kbd">g</kbd>, key: <kbd className="ui-kbd">t</kbd> })}</> }
    : readOnly
      ? { label: t('Open Inbox'), run: () => navigate({ view: 'inbox' }), hint: <>{t.rich('Press {g} then {key} to open the Inbox', { g: <kbd className="ui-kbd">g</kbd>, key: <kbd className="ui-kbd">i</kbd> })}</> }
      : { label: t('Add a task'), run: onAdd, hint: <>{t.rich('Press {key} to add a task', { key: <kbd className="ui-kbd">q</kbd> })}</> }
  return (
    <div data-empty-state={view}>
      <EmptyStatePattern icon={icon} title={body ? t('Nothing is ready to start today') : title} body={body}
        action={(
          <>
            <Button size="sm" variant="secondary" data-empty-action onClick={action.run}>{action.label}</Button>
            {fine && <p className="mt-2 text-meta text-faint" data-empty-hint>{action.hint}</p>}
          </>
        )} />
    </div>
  )
}

/** No list matches when the duration filter hides every task. */
export function FilteredEmpty({ onClear }: { onClear: () => void }) {
  return (
    <EmptyStatePattern icon="filter" title={t('No task matches this duration filter')}
      action={<Button size="sm" variant="secondary" onClick={onClear}>{t('Clear the filter')}</Button>} />
  )
}

/** A project or label route whose target is gone. */
export function MissingTarget({ kind }: { kind: 'project' | 'label' }) {
  return (
    <div className="p-6 text-body text-muted">
      {kind === 'project'
        ? <>{t('This project no longer exists.')}{' '}<button className="underline" onClick={() => navigate({ view: 'inbox' })}>{t('Go to Inbox')}</button></>
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
