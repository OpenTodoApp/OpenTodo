// The properties of the task panel (OpenSpec change ux-overhaul, web-app "Task panel
// layout", design D4): the project breadcrumb, then a wrapping row of chips for the
// properties that have a value (Do on and Priority always), and an Add menu for the
// rest. Every chip writes the same ops as the rows it replaces, locally first.
import { useLiveQuery } from 'dexie-react-hooks'
import { keysOf } from '../../lib/shortcuts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../../lib/db'
import { describeDeadline, localDueOf, zoneHint, daysBetweenISO, todayISO } from '../../lib/dates'
import { blockerCandidates, dependents, setBlockedBy } from '../../lib/dependencies'
import { formatMinutes } from '../../lib/duration'
import { removeLabel, resolveLabels } from '../../lib/labels'
import { createProject, setTaskParent, unparkTask, updateTask } from '../../lib/ops'
import { byPosition } from '../../lib/ordering'
import { INBOX_KEY, NONE_KEY, parentSource, projectSource, sectionSource, type PickerItem } from '../../lib/pickerSources'
import { effectiveSection, moveTaskToSection } from '../../lib/sections'
import { isSoloScope, memberName, membershipMap } from '../../lib/sharing'
import { visibleTasks } from '../../lib/trash'
import type { Label, Membership, Priority, Project, Section, Task } from '../../lib/types'
import { Avatar, ComboboxPanel, Icon, type IconName, MenuItem, MenuSeparator, Switch } from '../../ui'
import { AssigneePicker } from '../AssigneePicker'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import { EstimateField } from '../EstimateField'
import { LabelChip, LabelPicker } from '../LabelPicker'
import { Menu } from '../overlay/Menu'
import { blockedByFocus, deadlineFocus, deferFocus, estimateFocus } from '../signals'
import { moveWithUndo } from '../undoable'
import { ProjectMark } from '../Sidebar'
import { useViewerZone } from '../useViews'
import { PropertyChip } from './PropertyChip'
import { WhenControl } from './WhenControl'
import { ZoneControl } from './ZoneControl'
import { t } from '../../lib/i18n'

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

/** The properties the Add menu can offer, in its order. */
type Optional = 'deadline' | 'when' | 'evening' | 'reminders' | 'estimate' | 'repeat' | 'labels' | 'assignee' | 'blocked-by' | 'parent' | 'section'

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

export function Properties({ task, userId, readOnly, projects, labelMap, parent, childCount, onOpen }: PropertiesProps) {
  const dt = useDateTimeFormat()
  const zone = useViewerZone()
  const projectId = task.project_id ?? null
  const memberships = useLiveQuery(() => membershipMap(), [], new Map<string, Membership>())
  const sections = useLiveQuery(
    () => (projectId ? db.sections.where('project_id').equals(projectId).filter((s) => !s.deleted_at).toArray().then((l) => l.sort(byPosition)) : Promise.resolve([] as Section[])),
    [projectId], [] as Section[],
  )
  // Tasks of the same project (any state): the parent picker applies its own rules.
  const projectTasks = useLiveQuery(
    () => db.tasks.filter((tk) => (tk.project_id ?? null) === projectId).toArray(),
    [projectId], [] as Task[],
  )
  const [parentError, setParentError] = useState<string | null>(null)
  const [blockError, setBlockError] = useState<string | null>(null)
  // Which optional property is being edited (one at a time), and which empty ones the
  // Add menu made visible until their editor closes without a value.
  const [editing, setEditingState] = useState<string | null>(null)
  const [shown, setShown] = useState<Set<Optional>>(() => new Set())
  useEffect(() => { setParentError(null); setBlockError(null); setEditingState(null); setShown(new Set()) }, [task.id])
  const isEditing = (id: string) => editing === id
  const setEditing = (id: string, on: boolean) => setEditingState((cur) => (on ? id : cur === id ? null : cur))
  const reveal = (id: Optional) => { setShown((s) => new Set(s).add(id)); setEditingState(id) }
  const section = useRef<HTMLElement>(null)

  // `b`, `Shift+N`, `d` and `e` on a list row open the panel with that editor (task-dependencies 3.3,
  // someday-and-evening 3.3, deadlines 3.2, time-blocking).
  useEffect(() => {
    const subs = [
      [blockedByFocus, 'blocked-by'], [deferFocus, 'when'], [deadlineFocus, 'deadline'],
    ] as const
    for (const [ch, id] of subs) if (ch.take(task.id)) reveal(id)
    if (estimateFocus.take(task.id)) { estimateFocus.set(task.id); reveal('estimate') }
    const offs = subs.map(([ch, id]) => ch.subscribe((item) => { if (item === task.id && ch.take(item)) reveal(id) }))
    offs.push(estimateFocus.subscribe((entry) => { if (entry === task.id) reveal('estimate') }))
    return () => offs.forEach((off) => off())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id])
  // Every live task: blockers may sit in any project of the same sharing scope.
  const allTasks = useLiveQuery(() => visibleTasks(), [], [] as Task[])

  const projectItems = useMemo(() => projectSource(projects, { current: projectId, memberships }), [projects, projectId, memberships])
  const sectionMap = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections])
  const parentItems = useMemo(() => {
    const list = parent && !projectTasks.some((task) => task.id === parent.id) ? [...projectTasks, parent] : projectTasks
    return parentSource(list, task, sections)
  }, [projectTasks, parent, task, sections])

  const taskById = useMemo(() => new Map(allTasks.map((task) => [task.id, task])), [allTasks])
  const blockers = useMemo(() => (task.blocked_by ?? []).map((id) => taskById.get(id)).filter((task): task is Task => !!task), [task.blocked_by, taskById])
  const blocks = useMemo(() => dependents(task.id, allTasks).filter((task) => !task.completed_at), [task.id, allTasks])
  const projectName = (task: Task) => (task.project_id ? projects.find((p) => p.id === task.project_id)?.name ?? t('Project') : t('Inbox'))
  const blockerItems = useMemo(() => [...blockers, ...blockerCandidates(task, allTasks, memberships)], [blockers, task, allTasks, memberships])
  const toggleBlocker = async (id: string) => {
    setBlockError(null)
    try {
      const list = task.blocked_by ?? []
      await setBlockedBy(task.id, list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
    } catch (err) {
      setBlockError(err instanceof Error ? err.message : String(err))
    }
  }

  const project = projectId ? projects.find((p) => p.id === projectId) : undefined
  const currentProject = projectItems.find((i) => i.value === projectId)
  const moveTo = async (id: string | null) => {
    if (id === projectId) return
    const newId = await moveWithUndo(task.id, id, id ? projects.find((p) => p.id === id)?.name ?? t('the project') : t('Inbox'))
    if (newId !== task.id) onOpen?.(newId)
  }
  const changeParent = async (value: string | null) => {
    setParentError(null)
    try {
      await setTaskParent(task.id, value)
    } catch (err) {
      setParentError(err instanceof Error ? err.message : String(err))
    }
  }

  const projectPins = [...(currentProject?.marker ? [currentProject.key] : []), INBOX_KEY]
  const sectionId = effectiveSection(task, sectionMap)
  const followsParent = !!parent && !parent.deleted_at
  const parentFollowSection = followsParent ? effectiveSection(parent, sectionMap) : null
  const shownSection = followsParent ? parentFollowSection : sectionId
  const solo = !!userId && isSoloScope(projectId, memberships, userId) && (!task.assignee_id || task.assignee_id === userId)
  const local = localDueOf(task.due, zone)
  const hint = zoneHint(task.due, zone)
  const labels = resolveLabels(task.labels, labelMap)
  const reminders = useLiveQuery(() => db.reminders.where('task_id').equals(task.id).filter((r) => !r.deleted_at).count(), [task.id], 0)
  const assigneeName = task.assignee_id ? (task.assignee_id === userId ? t('You') : memberName(task.assignee_id, memberships) ?? t('Former member')) : null

  // Visible: set properties, plus the ones the Add menu revealed.
  const has: Record<Optional, boolean> = {
    deadline: !!task.deadline,
    when: !!task.start,
    evening: !!task.evening,
    reminders: reminders > 0,
    estimate: task.estimate_minutes !== null,
    repeat: !!task.recurrence,
    labels: labels.length > 0,
    assignee: !!task.assignee_id || (!!userId && !solo),
    'blocked-by': blockers.length > 0,
    parent: !!task.parent_id,
    section: !!shownSection,
  }
  const visible = (id: Optional) => has[id] || shown.has(id)
  // A chip the Add menu revealed leaves again when its editor closes without a value.
  // The value arrives through the live query a moment after the write, so the check
  // waits a beat; when the chip goes, focus moves to the Add control that made it.
  const hasRef = useRef(has)
  hasRef.current = has
  const shownRef = useRef(shown)
  shownRef.current = shown
  const settleRevealed = (id: Optional) => {
    if (!shownRef.current.has(id)) return
    window.setTimeout(() => {
      if (hasRef.current[id] || !shownRef.current.has(id)) return
      setShown((s) => { const n = new Set(s); n.delete(id); return n })
      section.current?.querySelector<HTMLElement>(`button[aria-label="${t('Add a property')}"]`)?.focus()
    }, 50)
  }
  const chipProps = (id: Optional) => ({
    editing: isEditing(id),
    onEditingChange: (on: boolean) => {
      setEditing(id, on)
      if (!on) settleRevealed(id)
    },
  })
  const offerSection = !!projectId && sections.length > 0 && !followsParent
  const offers: { id: Optional; label: string; icon: IconName; shortcut?: string; when?: boolean; run?: () => void }[] = [
    { id: 'deadline', label: t('Deadline'), icon: 'hourglass', shortcut: keysOf('list.deadline') },
    { id: 'when', label: t('Start'), icon: 'calendar-range', shortcut: keysOf('list.defer') },
    { id: 'evening', label: t('This Evening'), icon: 'moon', shortcut: keysOf('list.evening'), run: () => void updateTask(task.id, { evening: true }) },
    { id: 'reminders', label: t('Reminder'), icon: 'alarm-clock' },
    { id: 'estimate', label: t('Estimate'), icon: 'clock', shortcut: keysOf('list.estimate') },
    { id: 'repeat', label: t('Repeat'), icon: 'repeat' },
    { id: 'labels', label: t('Labels'), icon: 'tag', shortcut: keysOf('list.labels') },
    { id: 'assignee', label: solo ? t('Show in Assigned to me') : t('Assignee'), icon: 'user-check', shortcut: solo ? undefined : keysOf('list.assign'), when: !!userId, run: solo && userId ? () => void updateTask(task.id, { assignee_id: userId }) : undefined },
    { id: 'blocked-by', label: t('Blocked by'), icon: 'lock', shortcut: keysOf('list.blocked-by') },
    { id: 'parent', label: t('Parent task'), icon: 'corner-down-right' },
    { id: 'section', label: t('Section'), icon: 'kanban', when: offerSection },
  ]
  const remaining = offers.filter((o) => (o.when ?? true) && !visible(o.id))

  const priority = PRIORITIES.find((x) => x.p === task.priority) ?? PRIORITIES[3]

  return (
    <section ref={section} aria-label={t('Properties')} className="space-y-2">
      {/* Where the task lives: project › section, as one breadcrumb of chips. */}
      <div className="flex flex-wrap items-center gap-1.5" data-property-breadcrumb>
        <PropertyChip id="project" icon="folder" label={t('Project')} readOnly={readOnly} editing={isEditing('project')} onEditingChange={(on) => setEditing('project', on)}
          value={<span className="flex min-w-0 items-center gap-1.5">{project ? <ProjectMark project={project} /> : <Icon name="inbox" size="xs" className="text-faint" />}<span className="truncate">{project?.name ?? t('Inbox')}</span>{project?.archived && <span className="text-faint">{t('(archived)')}</span>}</span>}
          note={childCount > 0 && isEditing('project') ? t('{n, plural, one {Moving this task moves its subtask too.} other {Moving this task moves its subtasks too.}}', { n: childCount }) : undefined}
          editor={(close) => (
            <ComboboxPanel<PickerItem> label={t('Project')} placeholder={t('Find or create a project…')} source={projectItems}
              getKey={itemKey} getLabel={itemLabel} getPath={itemPath} getSecondary={itemMeta}
              pinned={projectPins} selected={[currentProject?.key ?? INBOX_KEY]} rankContext="task.project"
              renderLeading={(i) => (i.key === INBOX_KEY ? <Icon name="inbox" className="text-faint" /> : <Dot color={i.color} />)}
              onPick={async (i) => { await moveTo(i.value); close() }}
              onCreate={async (name) => { const id = await createProject({ name: name.trim() }); await moveTo(id); close() }}
              onClose={close} />
          )} />
        {visible('section') && projectId && (
          <>
            <span aria-hidden="true" className="text-faint"><Icon name="chevron-right" size="xs" /></span>
            <PropertyChip id="section" icon="kanban" label={t('Section')} readOnly={readOnly || followsParent} {...chipProps('section')}
              empty={!shownSection} placeholder={t('No section')}
              value={sectionMap.get(shownSection ?? '')?.name || t('Untitled section')}
              note={followsParent ? t('Subtasks follow their parent task’s section.') : undefined}
              editor={(close) => (
                <ComboboxPanel<PickerItem> label={t('Section')} placeholder={t('Find a section…')} source={sectionSource(sections, projectId)}
                  getKey={itemKey} getLabel={itemLabel} pinned={[NONE_KEY]} selected={[sectionId ?? NONE_KEY]} rankContext="task.section"
                  onPick={async (i) => { await moveTaskToSection(task.id, i.value).catch(() => undefined); close() }} onClose={close} />
              )} />
          </>
        )}
        {visible('parent') && (
          <PropertyChip id="parent" icon="corner-down-right" label={t('Parent task')} readOnly={readOnly} {...chipProps('parent')}
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

      <div className="flex flex-wrap items-center gap-1.5" data-property-chips>
        {/* Do on: always present. */}
        <PropertyChip id="due" icon="calendar-days" label={t('Do on')} readOnly={readOnly} editing={isEditing('due')} onEditingChange={(on) => setEditing('due', on)}
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
          aside={task.due?.time && !(editing && WHEN_CHIPS.has(editing)) ? <ZoneControl task={task} readOnly={readOnly} viewerZone={zone} /> : undefined}
          editorLabel={t('When')} editor={(close) => <WhenControl task={task} readOnly={readOnly} focus="due" onDone={close} onOpen={onOpen} />} />

        {/* Priority: always present, one chip that opens the four options. */}
        <PropertyChip id="priority" icon="flag" label={t('Priority')} readOnly={readOnly} editing={isEditing('priority')} onEditingChange={(on) => setEditing('priority', on)}
          tone={priority.cls.split(' ')[0]} value={<span data-priority-value>{priority.label}</span>}
          editor={(close) => (
            <div className="flex gap-1.5" role="group" aria-label={t('Priority')}>
              {PRIORITIES.map(({ p, label, cls }) => (
                <button key={p} type="button" aria-pressed={task.priority === p}
                  className={`min-w-11 rounded-control border px-2.5 py-1 text-meta ${cls} ${task.priority === p ? 'bg-sunken font-semibold dark:bg-raised' : 'border-dashed hover:bg-sunken dark:hover:bg-raised'}`}
                  onClick={() => { void updateTask(task.id, { priority: p }); close() }}>{label}</button>
              ))}
            </div>
          )} />

        {visible('deadline') && (
          <PropertyChip id="deadline" icon="hourglass" label={t('Deadline')} readOnly={readOnly} {...chipProps('deadline')}
            empty={!task.deadline} placeholder={t('Deadline')}
            tone={task.deadline && describeDeadline(task.deadline, undefined, local?.date ?? null)?.tone === 'overdue' ? 'text-danger' : ''}
            value={task.deadline && <span className="truncate">{dt.formatDate(task.deadline, 'long')}<span className="ml-1 text-faint">{countdownWords(task.deadline, local?.date ?? null)}</span></span>}
            onClear={task.deadline ? () => void updateTask(task.id, { deadline: null }) : undefined}
            editorLabel={t('When')} editor={(close) => <WhenControl task={task} readOnly={readOnly} focus="deadline" onDone={close} onOpen={onOpen} />} />
        )}

        {visible('when') && (
          <PropertyChip id="when" icon="calendar-range" label={t('Start')} readOnly={readOnly} {...chipProps('when')}
            empty={!task.start} placeholder={t('Start')}
            value={task.start === 'someday' ? t('Someday') : task.start ? t('Starts {date}', { date: dt.formatDate(task.start, 'long') }) : t('Anytime')}
            onClear={task.start ? () => void unparkTask(task.id) : undefined}
            editorLabel={t('When')} editor={(close) => <WhenControl task={task} readOnly={readOnly} focus="start" onDone={close} onOpen={onOpen} />} />
        )}

        {visible('evening') && (
          <PropertyChip id="evening" icon="moon" label={t('Evening')} readOnly={readOnly} {...chipProps('evening')}
            value="This Evening" onClear={() => void updateTask(task.id, { evening: false })}
            editorLabel={t('When')} editor={(close) => <WhenControl task={task} readOnly={readOnly} focus="evening" onDone={close} onOpen={onOpen} />} />
        )}

        {visible('reminders') && (
          <PropertyChip id="reminders" icon="alarm-clock" label={t('Reminders')} readOnly={readOnly} {...chipProps('reminders')}
            empty={reminders === 0} placeholder={t('Reminder')}
            value={t('{reminders, plural, one {# reminder} other {# reminders}}', { reminders })}
            editorLabel={t('When')} editor={(close) => <WhenControl task={task} readOnly={readOnly} focus="reminders" onDone={close} onOpen={onOpen} />} />
        )}

        {visible('estimate') && (
          <PropertyChip id="estimate" icon="clock" label={t('Estimate')} readOnly={readOnly} {...chipProps('estimate')}
            empty={task.estimate_minutes === null} placeholder={t('Estimate')}
            value={task.estimate_minutes !== null ? formatMinutes(task.estimate_minutes) : null}
            onClear={task.estimate_minutes !== null ? () => void updateTask(task.id, { estimate_minutes: null }) : undefined}
            editor={() => <EstimateField task={task} />} />
        )}

        {visible('repeat') && (
          <PropertyChip id="repeat" icon="repeat" label={t('Repeat')} readOnly={readOnly} {...chipProps('repeat')}
            empty={!task.recurrence} placeholder={t('Repeat')} value={task.recurrence}
            editorLabel={t('When')} editor={(close) => <WhenControl task={task} readOnly={readOnly} focus="repeat" onDone={close} onOpen={onOpen} />} />
        )}

        {visible('labels') && (
          <PropertyChip id="labels" icon="tag" label={t('Labels')} readOnly={readOnly} {...chipProps('labels')}
            empty={labels.length === 0} placeholder={t('Labels')}
            value={<span className="flex flex-wrap gap-1">{labels.map((l) => <LabelChip key={l.id} label={l} />)}</span>}
            editor={(close) => (
              <div className="space-y-2">
                {labels.length > 0 && (
                  <div className="flex flex-wrap gap-1">{labels.map((l) => <LabelChip key={l.id} label={l} onRemove={() => void removeLabel(task.id, l.id)} />)}</div>
                )}
                <LabelPicker taskId={task.id} onClose={close} />
              </div>
            )} />
        )}

        {userId && visible('assignee') && (solo ? (
          <PropertyChip id="assignee" icon="user-check" label={t('Assignee')} readOnly={readOnly} {...chipProps('assignee')}
            value={<span className="flex items-center gap-1.5"><Avatar id={userId} name="You" size="sm" />{t('You')}</span>}
            onClear={task.assignee_id === userId ? () => void updateTask(task.id, { assignee_id: null }) : undefined}
            editor={() => (
              <Switch label={t('Show in Assigned to me')} checked={task.assignee_id === userId} disabled={readOnly}
                onChange={(on) => void updateTask(task.id, { assignee_id: on ? userId : null })} />
            )} />
        ) : (
          <PropertyChip id="assignee" icon="user-check" label={t('Assignee')} readOnly={readOnly} {...chipProps('assignee')}
            empty={!task.assignee_id} placeholder={t('Unassigned')}
            value={task.assignee_id && assigneeName && <span className="flex items-center gap-1.5"><Avatar id={task.assignee_id} name={assigneeName} size="sm" />{assigneeName}</span>}
            editor={(close) => <AssigneePicker taskId={task.id} userId={userId} onClose={close} />} />
        ))}

        {visible('blocked-by') && (
          <PropertyChip id="blocked-by" icon="lock" label={t('Blocked by')} readOnly={readOnly} {...chipProps('blocked-by')}
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
          <PropertyChip id="blocks" icon="arrow-right" label={t('Blocks')} editing={isEditing('blocks')} onEditingChange={(on) => setEditing('blocks', on)}
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

        {!readOnly && remaining.length > 0 && (
          <Menu kind="menu" label={t('Add a property')} title={t('Add')} width="sm:w-64"
            trigger={<span className="inline-flex items-center gap-1 text-meta"><Icon name="plus" size="xs" />{t('Add')}</span>}
            triggerClassName="inline-flex min-h-8 items-center rounded-control border border-dashed border-input px-2.5 py-1 text-muted hover:bg-sunken hover:text-default dark:hover:bg-raised">
            {remaining.map((o, i) => (
              <span key={o.id} className="contents">
                {i > 0 && o.id === 'blocked-by' && <MenuSeparator />}
                <MenuItem label={o.label} icon={o.icon} shortcut={o.shortcut} onSelect={() => (o.run ? o.run() : reveal(o.id))} />
              </span>
            ))}
          </Menu>
        )}
      </div>
    </section>
  )
}
