// The properties of the task panel (OpenSpec change ux-overhaul, web-app "Task panel
// layout", design D4): the project breadcrumb, then a wrapping row of chips for the
// properties that have a value (Do on and Priority always), and an Add menu for the
// rest. Every chip writes the same ops as the rows it replaces, locally first. The
// data and actions live in usePropertiesModel and the editing state in
// usePropertyEditing (web-component-structure); this file renders the chip groups.
import { keysOf } from '../../lib/shortcuts'
import { describeDeadline, daysBetweenISO, todayISO } from '../../lib/dates'
import { formatMinutes } from '../../lib/duration'
import { removeLabel } from '../../lib/labels'
import { createProject, unparkTask, updateTask } from '../../lib/ops'
import { INBOX_KEY, NONE_KEY, sectionSource, type PickerItem } from '../../lib/pickerSources'
import { moveTaskToSection } from '../../lib/sections'
import type { Label, Priority, Project, Task } from '../../lib/types'
import { Avatar, ComboboxPanel, Icon, type IconName, MenuItem, MenuSeparator, Switch } from '../../ui'
import { AssigneePicker } from '../AssigneePicker'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import { EstimateField } from '../EstimateField'
import { LabelChip, LabelPicker } from '../LabelPicker'
import { Menu } from '../overlay/Menu'
import { ProjectMark } from '../Sidebar'
import { PropertyChip } from './PropertyChip'
import { usePropertiesModel, type PropertiesModel } from './usePropertiesModel'
import type { Optional } from './usePropertyEditing'
import { WhenControl } from './WhenControl'
import { ZoneControl } from './ZoneControl'
import { t } from '../../lib/i18n'
import { act, reportActionError } from '../actionError'


/** Chips whose editor is the When control (it has its own zone control). */
const WHEN_CHIPS = new Set(['due', 'deadline', 'when', 'evening', 'reminders', 'repeat'])

export const PRIORITIES: { p: Priority; label: string; cls: string }[] = [
  // Priority colours come from the p1–p4 tokens (borders, 3:1); the labels use the
  // matching palette hue's text step so they stay readable (4.5:1) in both themes.
  { p: 1, label: 'P1', cls: 'text-(--ot-hue-red-text) border-p1' },
  { p: 2, label: 'P2', cls: 'text-(--ot-hue-orange-text) border-p2' },
  { p: 3, label: 'P3', cls: 'text-(--ot-hue-blue-text) border-p3' },
  { p: 4, label: 'P4', cls: 'text-muted border-p4' },
]

const itemKey = (i: PickerItem) => i.key
const itemLabel = (i: PickerItem) => i.label
const itemPath = (i: PickerItem) => i.path
const itemMeta = (i: PickerItem) => i.meta

/** The countdown in words for the chip ("in 3 days", "today", "2 days over"). */
function countdownWords(deadline: string, dueDate: string | null): string {
  const days = daysBetweenISO(todayISO(), deadline)
  const late = dueDate && dueDate > deadline ? ` · ${t('planned after it')}` : ''
  if (days === 0) return t('today') + late
  return (days < 0 ? t('{n, plural, one {# day over} other {# days over}}', { n: -days }) : t('{n, plural, one {in # day} other {in # days}}', { n: days })) + late
}

function Dot({ color }: { color?: string }) {
  return <span aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color ?? 'var(--ot-faint)' }} />
}

export interface PropertiesProps {
  task: Task
  userId?: string
  readOnly: boolean
  projects: Project[]
  labelMap: Map<string, Label>
  /** The live parent task, when the task has one. */
  parent?: Task
  /** Number of live subtasks (moving the task moves them too). */
  childCount: number
  /** Follow a copy after a move into another sharing scope, or open another task. */
  onOpen?: (id: string) => void
}

/** What every chip group reads: the panel's props and the model. */
interface GroupProps { p: PropertiesProps; m: PropertiesModel }

export function Properties(props: PropertiesProps) {
  const m = usePropertiesModel(props)
  return (
    <section ref={m.section} aria-label={t('Properties')} className="space-y-2">
      {/* Where the task lives: project › section, as one breadcrumb of chips. */}
      <PlacementChips p={props} m={m} />
      <div className="flex flex-wrap items-center gap-1.5" data-property-chips>
        <ScheduleChips p={props} m={m} />
        <RelationChips p={props} m={m} />
        <AddPropertyMenu p={props} m={m} />
      </div>
    </section>
  )
}

/** Project › section › parent task. */
function PlacementChips({ p: { task, readOnly, childCount, parent }, m }: GroupProps) {
  const { project, projectId, projectItems, currentProject, projectPins, moveTo, followsParent, shownSection, sectionMap, sections, sectionId, parentItems, parentError, changeParent, editing: ed } = m
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-property-breadcrumb>
      <PropertyChip id="project" icon="folder" label={t('Project')} readOnly={readOnly} {...ed.fixedChip('project')}
        value={<span className="flex min-w-0 items-center gap-1.5">{project ? <ProjectMark project={project} /> : <Icon name="inbox" size="xs" className="text-faint" />}<span className="truncate">{project?.name ?? t('Inbox')}</span>{project?.archived && <span className="text-faint">{t('(archived)')}</span>}</span>}
        note={childCount > 0 && ed.isEditing('project') ? t('{n, plural, one {Moving this task moves its subtask too.} other {Moving this task moves its subtasks too.}}', { n: childCount }) : undefined}
        editor={(close) => (
          <ComboboxPanel<PickerItem> label={t('Project')} placeholder={t('Find or create a project…')} source={projectItems}
            getKey={itemKey} getLabel={itemLabel} getPath={itemPath} getSecondary={itemMeta}
            pinned={projectPins} selected={[currentProject?.key ?? INBOX_KEY]} rankContext="task.project"
            renderLeading={(i) => (i.key === INBOX_KEY ? <Icon name="inbox" className="text-faint" /> : <Dot color={i.color} />)}
            onPick={async (i) => { await moveTo(i.value); close() }}
            onCreate={async (name) => { const id = await createProject({ name: name.trim() }); await moveTo(id); close() }}
            onClose={close} />
        )} />
      {ed.visible('section') && projectId && (
        <>
          <span aria-hidden="true" className="text-faint"><Icon name="chevron-right" size="xs" /></span>
          <PropertyChip id="section" icon="kanban" label={t('Section')} readOnly={readOnly || followsParent} {...ed.chipProps('section')}
            empty={!shownSection} placeholder={t('No section')}
            value={sectionMap.get(shownSection ?? '')?.name || t('Untitled section')}
            note={followsParent ? t('Subtasks follow their parent task’s section.') : undefined}
            editor={(close) => (
              <ComboboxPanel<PickerItem> label={t('Section')} placeholder={t('Find a section…')} source={sectionSource(sections, projectId)}
                getKey={itemKey} getLabel={itemLabel} pinned={[NONE_KEY]} selected={[sectionId ?? NONE_KEY]} rankContext="task.section"
                onPick={async (i) => { await moveTaskToSection(task.id, i.value).catch(reportActionError); close() }} onClose={close} />
            )} />
        </>
      )}
      {ed.visible('parent') && (
        <PropertyChip id="parent" icon="corner-down-right" label={t('Parent task')} readOnly={readOnly} {...ed.chipProps('parent')}
          empty={!task.parent_id} placeholder={t('No parent')}
          value={<span className="truncate">{parent?.title || t('Untitled')}{parent?.deleted_at ? ` ${t('(deleted)')}` : parent?.completed_at && !task.completed_at ? ` ${t('(completed)')}` : ''}</span>}
          note={parentError ? <span role="alert" className="text-danger">{parentError}</span> : undefined}
          editor={(close) => (
            <ComboboxPanel<PickerItem> label={t('Parent task')} placeholder={t('Find a task…')} source={parentItems}
              getKey={itemKey} getLabel={itemLabel} getPath={itemPath} getSecondary={itemMeta}
              pinned={[...parentItems.filter((i) => i.marker).map((i) => i.key), NONE_KEY]} selected={[task.parent_id ?? NONE_KEY]} rankContext="task.parent"
              emptyText={t('No open task matches.')} onPick={async (i) => { await changeParent(i.value); close() }} onClose={close} />
          )} />
      )}
    </div>
  )
}

/** Do on and Priority (always), then the schedule chips that have a value or were revealed. */
function ScheduleChips({ p: { task, readOnly, onOpen }, m }: GroupProps) {
  const dt = useDateTimeFormat()
  const { local, hint, zone, reminders, editing: ed } = m
  const priority = PRIORITIES.find((x) => x.p === task.priority) ?? PRIORITIES[3]
  return (
    <>
      {/* Do on: always present. */}
      <PropertyChip id="due" icon="calendar-days" label={t('Do on')} readOnly={readOnly} {...ed.fixedChip('due')}
        empty={!local} placeholder={t('Do on')}
        tone={local ? 'text-default' : ''}
        value={local && (
          <span className="truncate">
            {dt.formatDate(local.date, 'long')}{local.time ? ` · ${dt.formatTime(local.time)}` : ''}
            {task.evening ? <span className="text-faint">{` · ${t('evening')}`}</span> : null}
            {hint && <span className="ml-1 text-faint">{hint}</span>}
          </span>
        )}
        // Beside the chip only for a timed due (an untimed one has no zone to fix), and not
        // while a When editor is open: its Do on segment shows the same control (GitHub issue 100).
        aside={task.due?.time && !(ed.editing && WHEN_CHIPS.has(ed.editing)) ? <ZoneControl task={task} readOnly={readOnly} viewerZone={zone} /> : undefined}
        editorLabel={t('When')} editor={(close) => <WhenControl task={task} readOnly={readOnly} focus="due" onDone={close} onOpen={onOpen} />} />

      {/* Priority: always present, one chip that opens the four options. */}
      <PropertyChip id="priority" icon="flag" label={t('Priority')} readOnly={readOnly} {...ed.fixedChip('priority')}
        tone={priority.cls.split(' ')[0]} value={<span data-priority-value>{priority.label}</span>}
        editor={(close) => (
          <div className="flex gap-1.5" role="group" aria-label={t('Priority')}>
            {PRIORITIES.map(({ p, label, cls }) => (
              <button key={p} type="button" aria-pressed={task.priority === p}
                className={`min-w-11 rounded-control border px-2.5 py-1 text-meta ${cls} ${task.priority === p ? 'bg-sunken font-semibold dark:bg-raised' : 'border-dashed hover:bg-sunken dark:hover:bg-raised'}`}
                onClick={() => { act(updateTask(task.id, { priority: p })); close() }}>{label}</button>
            ))}
          </div>
        )} />

      {ed.visible('deadline') && (
        <PropertyChip id="deadline" icon="hourglass" label={t('Deadline')} readOnly={readOnly} {...ed.chipProps('deadline')}
          empty={!task.deadline} placeholder={t('Deadline')}
          tone={task.deadline && describeDeadline(task.deadline, undefined, local?.date ?? null)?.tone === 'overdue' ? 'text-danger' : ''}
          value={task.deadline && <span className="truncate">{dt.formatDate(task.deadline, 'long')}<span className="ml-1 text-faint">{countdownWords(task.deadline, local?.date ?? null)}</span></span>}
          onClear={task.deadline ? () => act(updateTask(task.id, { deadline: null })) : undefined}
          editorLabel={t('When')} editor={(close) => <WhenControl task={task} readOnly={readOnly} focus="deadline" onDone={close} onOpen={onOpen} />} />
      )}

      {ed.visible('when') && (
        <PropertyChip id="when" icon="calendar-range" label={t('Start')} readOnly={readOnly} {...ed.chipProps('when')}
          empty={!task.start} placeholder={t('Start')}
          value={task.start === 'someday' ? t('Someday') : task.start ? t('Starts {date}', { date: dt.formatDate(task.start, 'long') }) : t('Anytime')}
          onClear={task.start ? () => void unparkTask(task.id) : undefined}
          editorLabel={t('When')} editor={(close) => <WhenControl task={task} readOnly={readOnly} focus="start" onDone={close} onOpen={onOpen} />} />
      )}

      {ed.visible('evening') && (
        <PropertyChip id="evening" icon="moon" label={t('Evening')} readOnly={readOnly} {...ed.chipProps('evening')}
          value="This Evening" onClear={() => act(updateTask(task.id, { evening: false }))}
          editorLabel={t('When')} editor={(close) => <WhenControl task={task} readOnly={readOnly} focus="evening" onDone={close} onOpen={onOpen} />} />
      )}

      {ed.visible('reminders') && (
        <PropertyChip id="reminders" icon="alarm-clock" label={t('Reminders')} readOnly={readOnly} {...ed.chipProps('reminders')}
          empty={reminders === 0} placeholder={t('Reminder')}
          value={t('{reminders, plural, one {# reminder} other {# reminders}}', { reminders })}
          editorLabel={t('When')} editor={(close) => <WhenControl task={task} readOnly={readOnly} focus="reminders" onDone={close} onOpen={onOpen} />} />
      )}

      {ed.visible('estimate') && (
        <PropertyChip id="estimate" icon="clock" label={t('Estimate')} readOnly={readOnly} {...ed.chipProps('estimate')}
          empty={task.estimate_minutes === null} placeholder={t('Estimate')}
          value={task.estimate_minutes !== null ? formatMinutes(task.estimate_minutes) : null}
          onClear={task.estimate_minutes !== null ? () => act(updateTask(task.id, { estimate_minutes: null })) : undefined}
          editor={() => <EstimateField task={task} />} />
      )}

      {ed.visible('repeat') && (
        <PropertyChip id="repeat" icon="repeat" label={t('Repeat')} readOnly={readOnly} {...ed.chipProps('repeat')}
          empty={!task.recurrence} placeholder={t('Repeat')} value={task.recurrence}
          editorLabel={t('When')} editor={(close) => <WhenControl task={task} readOnly={readOnly} focus="repeat" onDone={close} onOpen={onOpen} />} />
      )}
    </>
  )
}

/** Labels, assignee, blockers and the tasks this one blocks. */
function RelationChips({ p: { task, readOnly, userId, onOpen }, m }: GroupProps) {
  const { labels, solo, assigneeName, blockers, blocks, blockerItems, blockError, toggleBlocker, projectName, editing: ed } = m
  return (
    <>
      {ed.visible('labels') && (
        <PropertyChip id="labels" icon="tag" label={t('Labels')} readOnly={readOnly} {...ed.chipProps('labels')}
          empty={labels.length === 0} placeholder={t('Labels')}
          value={<span className="flex flex-wrap gap-1">{labels.map((l) => <LabelChip key={l.id} label={l} />)}</span>}
          editor={(close) => (
            <div className="space-y-2">
              {labels.length > 0 && (
                <div className="flex flex-wrap gap-1">{labels.map((l) => <LabelChip key={l.id} label={l} onRemove={() => act(removeLabel(task.id, l.id))} />)}</div>
              )}
              <LabelPicker taskId={task.id} onClose={close} />
            </div>
          )} />
      )}

      {userId && ed.visible('assignee') && (solo ? (
        <PropertyChip id="assignee" icon="user-check" label={t('Assignee')} readOnly={readOnly} {...ed.chipProps('assignee')}
          value={<span className="flex items-center gap-1.5"><Avatar id={userId} name="You" size="sm" />{t('You')}</span>}
          onClear={task.assignee_id === userId ? () => act(updateTask(task.id, { assignee_id: null })) : undefined}
          editor={() => (
            <Switch label={t('Show in Assigned to me')} checked={task.assignee_id === userId} disabled={readOnly}
              onChange={(on) => act(updateTask(task.id, { assignee_id: on ? userId : null }))} />
          )} />
      ) : (
        <PropertyChip id="assignee" icon="user-check" label={t('Assignee')} readOnly={readOnly} {...ed.chipProps('assignee')}
          empty={!task.assignee_id} placeholder={t('Unassigned')}
          value={task.assignee_id && assigneeName && <span className="flex items-center gap-1.5"><Avatar id={task.assignee_id} name={assigneeName} size="sm" />{assigneeName}</span>}
          editor={(close) => <AssigneePicker taskId={task.id} userId={userId} onClose={close} />} />
      ))}

      {ed.visible('blocked-by') && (
        <PropertyChip id="blocked-by" icon="lock" label={t('Blocked by')} readOnly={readOnly} {...ed.chipProps('blocked-by')}
          empty={!blockers.length} placeholder={t('Blocked by')}
          value={(
            <span className="flex min-w-0 flex-wrap gap-1">
              {blockers.map((b) => (
                <span key={b.id} className={`max-w-full truncate ${b.completed_at ? 'text-faint line-through' : ''}`} data-blocker>
                  {b.title || t('Untitled')}{b.recurrence && !b.completed_at ? <span className="text-faint">{` · ${t('repeats')}`}</span> : null}
                </span>
              ))}
            </span>
          )}
          note={blockError ? <span role="alert" className="text-danger">{blockError}</span> : undefined}
          editor={(close) => (
            <ComboboxPanel<Task> label={t('Blocked by')} placeholder={t('Find a task this one waits for…')} source={blockerItems}
              getKey={(task) => task.id} getLabel={(task) => task.title || t('Untitled')} getPath={(task) => [projectName(task)]} multiple selected={task.blocked_by ?? []}
              rankContext="task.blocked-by" emptyText={t('No open task can block this one.')} onPick={(task) => toggleBlocker(task.id)} onClose={close} />
          )} />
      )}

      {blocks.length > 0 && (
        <PropertyChip id="blocks" icon="arrow-right" label={t('Blocks')} {...ed.fixedChip('blocks')}
          value={`Blocks ${blocks.length}`}
          editor={() => (
            <ul className="flex min-w-0 flex-col gap-0.5" aria-label={t('Tasks waiting for this one')}>
              {blocks.map((task) => (
                <li key={task.id} className="min-w-0">
                  <button type="button" className="max-w-full truncate text-left text-meta text-accent hover:underline" onClick={() => onOpen?.(task.id)}>{task.title || t('Untitled')}</button>
                </li>
              ))}
            </ul>
          )} />
      )}
    </>
  )
}

/** The Add menu: the optional properties not shown yet. */
function AddPropertyMenu({ p: { task, readOnly, userId }, m }: GroupProps) {
  const { solo, offerSection, editing: ed } = m
  const offers: { id: Optional; label: string; icon: IconName; shortcut?: string; when?: boolean; run?: () => void }[] = [
    { id: 'deadline', label: t('Deadline'), icon: 'hourglass', shortcut: keysOf('list.deadline') },
    { id: 'when', label: t('Start'), icon: 'calendar-range', shortcut: keysOf('list.defer') },
    { id: 'evening', label: t('This Evening'), icon: 'moon', shortcut: keysOf('list.evening'), run: () => act(updateTask(task.id, { evening: true })) },
    { id: 'reminders', label: t('Reminder'), icon: 'alarm-clock' },
    { id: 'estimate', label: t('Estimate'), icon: 'clock', shortcut: keysOf('list.estimate') },
    { id: 'repeat', label: t('Repeat'), icon: 'repeat' },
    { id: 'labels', label: t('Labels'), icon: 'tag', shortcut: keysOf('list.labels') },
    { id: 'assignee', label: solo ? t('Show in Assigned to me') : t('Assignee'), icon: 'user-check', shortcut: solo ? undefined : keysOf('list.assign'), when: !!userId, run: solo && userId ? () => act(updateTask(task.id, { assignee_id: userId })) : undefined },
    { id: 'blocked-by', label: t('Blocked by'), icon: 'lock', shortcut: keysOf('list.blocked-by') },
    { id: 'parent', label: t('Parent task'), icon: 'corner-down-right' },
    { id: 'section', label: t('Section'), icon: 'kanban', when: offerSection },
  ]
  const remaining = offers.filter((o) => (o.when ?? true) && !ed.visible(o.id))
  return (
    <>
      {!readOnly && remaining.length > 0 && (
        <span data-add-property className="contents">
          <Menu kind="menu" label={t('Add a property')} title={t('Add')} width="sm:w-64"
            trigger={<span className="inline-flex items-center gap-1 text-meta"><Icon name="plus" size="xs" />{t('Add')}</span>}
            triggerClassName="inline-flex min-h-8 items-center rounded-control border border-dashed border-input px-2.5 py-1 text-muted hover:bg-sunken hover:text-default dark:hover:bg-raised">
            {remaining.map((o, i) => (
              <span key={o.id} className="contents">
                {i > 0 && o.id === 'blocked-by' && <MenuSeparator />}
                <MenuItem label={o.label} icon={o.icon} shortcut={o.shortcut} onSelect={() => (o.run ? o.run() : ed.reveal(o.id))} />
              </span>
            ))}
          </Menu>
        </span>
      )}
    </>
  )
}
