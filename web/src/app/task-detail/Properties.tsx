// The properties card of the task panel (OpenSpec task-detail-redesign, D1–D3, D8):
// each field is a PropertyRow that reads as a value and opens its editor on demand.
// Project, Section and Parent use the design-system picker over the pure sources in
// lib/pickerSources; every pick writes the same ops as before, locally first.
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { db } from '../../lib/db'
import { describeDeadline, localDueOf, zoneHint } from '../../lib/dates'
import { formatMinutes } from '../../lib/duration'
import { removeLabel, resolveLabels } from '../../lib/labels'
import { createProject, parkTask, setTaskParent, unparkTask, updateTask } from '../../lib/ops'
import { byPosition } from '../../lib/ordering'
import { INBOX_KEY, NONE_KEY, parentSource, projectSource, sectionSource, type PickerItem } from '../../lib/pickerSources'
import { effectiveSection, moveTaskToSection } from '../../lib/sections'
import { isSoloScope, memberName, membershipMap } from '../../lib/sharing'
import type { Label, Membership, Priority, Project, Section, Task } from '../../lib/types'
import { Avatar } from '../../ui/Avatar'
import { IconButton } from '../../ui/Button'
import { ComboboxPanel } from '../../ui/Combobox/Combobox'
import { Icon } from '../../ui/Icon'
import { Switch } from '../../ui/Switch'
import { AssigneePicker } from '../AssigneePicker'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import { DateField } from '../datetime/DateField'
import { DueField } from '../DueField'
import { EstimateField } from '../EstimateField'
import { LabelChip, LabelPicker } from '../LabelPicker'
import { RecurrenceField } from '../RecurrenceField'
import { RemindersField } from '../RemindersField'
import { deadlineFocus, deferFocus, estimateFocus } from '../signals'
import { useViewerZone } from '../useViews'
import { PropertyRow } from './PropertyRow'
import { ZoneControl } from './ZoneControl'

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

/** The countdown in words for the panel row ("in 3 days", "today", "2 days over"). */
function countdownWords(deadline: string, dueDate: string | null): string {
  const c = describeDeadline(deadline, undefined, dueDate)!
  const days = Number.parseInt(c.label, 10)
  const late = dueDate && dueDate > deadline ? ' · planned after it' : ''
  if (c.label === 'Today') return `today${late}`
  const n = `${days} day${days === 1 ? '' : 's'}`
  return (c.label.endsWith('over') ? `${n} over` : `in ${n}`) + late
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
    () => db.tasks.filter((t) => (t.project_id ?? null) === projectId).toArray(),
    [projectId], [] as Task[],
  )
  const [parentError, setParentError] = useState<string | null>(null)
  const [estimating, setEstimating] = useState(false)
  const [deadlining, setDeadlining] = useState(false)
  const [deferring, setDeferring] = useState(false)
  useEffect(() => { setParentError(null); setEstimating(false); setDeadlining(false); setDeferring(false) }, [task.id])

  // `Shift+N` on a list row opens the panel with the start date field (someday-and-evening 3.3).
  useEffect(() => {
    if (deferFocus.take(task.id)) setDeferring(true)
    return deferFocus.subscribe((id) => { if (id === task.id && deferFocus.take(id)) setDeferring(true) })
  }, [task.id])

  // `d` on a list row opens the panel with the deadline field focused (deadlines 3.2).
  useEffect(() => {
    if (deadlineFocus.take(task.id)) setDeadlining(true)
    return deadlineFocus.subscribe((id) => { if (id === task.id && deadlineFocus.take(id)) setDeadlining(true) })
  }, [task.id])

  // `e` on a list row opens the panel with the estimate editor (time-blocking). The
  // request is left pending so the EstimateField that mounts focuses its input.
  useEffect(() => {
    if (estimateFocus.take(task.id)) {
      estimateFocus.set(task.id)
      setEstimating(true)
    }
    return estimateFocus.subscribe((id) => { if (id === task.id) setEstimating(true) })
  }, [task.id])

  const projectItems = useMemo(() => projectSource(projects, { current: projectId, memberships }), [projects, projectId, memberships])
  const sectionMap = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections])
  const parentItems = useMemo(() => {
    const list = parent && !projectTasks.some((t) => t.id === parent.id) ? [...projectTasks, parent] : projectTasks
    return parentSource(list, task, sections)
  }, [projectTasks, parent, task, sections])

  const project = projectId ? projects.find((p) => p.id === projectId) : undefined
  const currentProject = projectItems.find((i) => i.value === projectId)

  // A move into another sharing scope creates a copy (project-sharing); follow it.
  const moveTo = async (id: string | null) => {
    if (id === projectId) return
    const newId = await updateTask(task.id, { project_id: id })
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
  const solo = !!userId && isSoloScope(projectId, memberships, userId) && (!task.assignee_id || task.assignee_id === userId)
  const local = localDueOf(task.due, zone)
  const hint = zoneHint(task.due, zone)
  const labels = resolveLabels(task.labels, labelMap)

  return (
    <section aria-label="Properties" className="rounded-card border border-default bg-surface px-2 py-1 sm:px-3">
      <PropertyRow icon="folder" label="Project" testId="project" readOnly={readOnly}
        value={<span className="flex min-w-0 items-center gap-2">{project ? <Dot color={project.color} /> : <Icon name="inbox" className="text-faint" />}<span className="truncate">{project?.name ?? 'Inbox'}</span>{project?.archived && <span className="text-meta text-faint">(archived)</span>}</span>}
        note={childCount > 0 ? `Moving this task moves its ${childCount === 1 ? 'subtask' : 'subtasks'} too.` : undefined}
        editor={(close) => (
          <ComboboxPanel<PickerItem> label="Project" placeholder="Find or create a project…" source={projectItems}
            getKey={itemKey} getLabel={itemLabel} getPath={itemPath} getSecondary={itemMeta}
            pinned={projectPins} selected={[currentProject?.key ?? INBOX_KEY]} rankContext="task.project"
            renderLeading={(i) => (i.key === INBOX_KEY ? <Icon name="inbox" className="text-faint" /> : <Dot color={i.color} />)}
            onPick={async (i) => { await moveTo(i.value); close() }}
            onCreate={async (name) => { const id = await createProject({ name: name.trim() }); await moveTo(id); close() }}
            onClose={close} />
        )} />

      {projectId && sections.length > 0 && (
        <PropertyRow icon="kanban" label="Section" testId="section" readOnly={readOnly || followsParent}
          empty={!(followsParent ? parentFollowSection : sectionId)} placeholder="No section"
          value={sectionMap.get((followsParent ? parentFollowSection : sectionId) ?? '')?.name || 'Untitled section'}
          note={followsParent ? 'Subtasks follow their parent task’s section.' : undefined}
          editor={(close) => (
            <ComboboxPanel<PickerItem> label="Section" placeholder="Find a section…" source={sectionSource(sections, projectId)}
              getKey={itemKey} getLabel={itemLabel} pinned={[NONE_KEY]} selected={[sectionId ?? NONE_KEY]} rankContext="task.section"
              onPick={async (i) => { await moveTaskToSection(task.id, i.value).catch(() => undefined); close() }} onClose={close} />
          )} />
      )}

      <PropertyRow icon="corner-down-right" label="Parent task" testId="parent" readOnly={readOnly}
        empty={!task.parent_id} placeholder="No parent"
        value={<span className="truncate">{parent?.title || 'Untitled'}{parent?.deleted_at ? ' (deleted)' : parent?.completed_at && !task.completed_at ? ' (completed)' : ''}</span>}
        note={parentError ? <span role="alert" className="text-danger">{parentError}</span> : undefined}
        editor={(close) => (
          <ComboboxPanel<PickerItem> label="Parent task" placeholder="Find a task…" source={parentItems}
            getKey={itemKey} getLabel={itemLabel} getPath={itemPath} getSecondary={itemMeta}
            pinned={[...parentItems.filter((i) => i.marker).map((i) => i.key), NONE_KEY]} selected={[task.parent_id ?? NONE_KEY]} rankContext="task.parent"
            emptyText="No open task matches." onPick={async (i) => { await changeParent(i.value); close() }} onClose={close} />
        )} />

      {userId && (solo ? (
        <PropertyRow icon="user-check" label="Assignee" testId="assignee" control={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-2 py-1">
            <span className="flex items-center gap-2 text-sm text-default"><Avatar id={userId} name="You" size="sm" />You</span>
            <Switch label="Show in Assigned to me" checked={task.assignee_id === userId} disabled={readOnly}
              onChange={(on) => void updateTask(task.id, { assignee_id: on ? userId : null })} />
          </div>
        } />
      ) : (
        <PropertyRow icon="user-check" label="Assignee" testId="assignee" readOnly={readOnly}
          empty={!task.assignee_id} placeholder="Unassigned"
          value={task.assignee_id && (
            <span className="flex items-center gap-2">
              <Avatar id={task.assignee_id} name={task.assignee_id === userId ? 'You' : memberName(task.assignee_id, memberships) ?? 'Former member'} size="sm" />
              {task.assignee_id === userId ? 'You' : memberName(task.assignee_id, memberships) ?? 'Former member'}
            </span>
          )}
          editor={(close) => <AssigneePicker taskId={task.id} userId={userId} onClose={close} />} />
      ))}

      <PropertyRow icon="flag" label="Priority" testId="priority" control={readOnly ? (
        <div className="px-2 py-1.5 text-sm text-default">P{task.priority}</div>
      ) : (
        <div className="flex gap-1.5 px-1 py-0.5" role="group" aria-label="Priority">
          {PRIORITIES.map(({ p, label, cls }) => (
            <button key={p} type="button" aria-pressed={task.priority === p} title={`Priority ${p} (${p})`}
              className={`min-w-11 rounded-control border px-2.5 py-1 text-sm ${cls} ${task.priority === p ? 'bg-sunken font-semibold dark:bg-raised' : 'border-dashed hover:bg-sunken dark:hover:bg-raised'}`}
              onClick={() => void updateTask(task.id, { priority: p })}>{label}</button>
          ))}
        </div>
      )} />

      <PropertyRow icon="calendar-days" label="Due" testId="due" readOnly={readOnly} empty={!local} placeholder="No due date"
        value={local && (
          <span className="truncate">
            {dt.formatDate(local.date, 'long')}{local.time ? ` · ${dt.formatTime(local.time)}` : ''}
            {hint && <span className="ml-2 text-meta text-faint">{hint}</span>}
          </span>
        )}
        aside={task.due ? <ZoneControl task={task} readOnly={readOnly} viewerZone={zone} /> : undefined}
        editor={() => <DueField task={task} readOnly={readOnly} />} />

      {/* The day the task must be finished by, separate from Due (OpenSpec change deadlines, D2). */}
      <PropertyRow icon="hourglass" label="Deadline" testId="deadline" readOnly={readOnly} empty={!task.deadline} placeholder="No deadline"
        editing={deadlining} onEditingChange={setDeadlining}
        value={task.deadline && (
          <span className="truncate">
            {dt.formatDate(task.deadline, 'long')}
            <span className="ml-2 text-meta text-muted">{countdownWords(task.deadline, local?.date ?? null)}</span>
          </span>
        )}
        editor={() => (
          <div className="flex flex-wrap items-start gap-2">
            <DateField label="Deadline" hideLabel autoFocus className="min-w-44 flex-1" value={task.deadline ?? null}
              onChange={(deadline) => void updateTask(task.id, { deadline })} />
            {task.deadline && <IconButton icon="x" label="Clear deadline" onClick={() => void updateTask(task.id, { deadline: null })} />}
          </div>
        )} />

      {/* When the task becomes relevant, and This Evening (OpenSpec change someday-and-evening, D5). */}
      <PropertyRow icon="calendar-range" label="When" testId="when" readOnly={readOnly}
        editing={deferring} onEditingChange={setDeferring}
        value={task.start === 'someday' ? 'Someday' : task.start ? `Starts ${dt.formatDate(task.start, 'long')}` : 'Anytime'}
        editor={() => (
          <div className="flex flex-wrap items-start gap-2">
            <button type="button" className="btn-ghost px-2 py-1 text-sm" aria-pressed={!task.start} onClick={() => void unparkTask(task.id)}>Anytime</button>
            <DateField label="Start date" hideLabel autoFocus className="min-w-44 flex-1" value={task.start && task.start !== 'someday' ? task.start : null}
              validate={(iso) => (local && iso > local.date ? 'The start must be on or before the due date.' : null)}
              onChange={(start) => void updateTask(task.id, { start })} />
            <button type="button" className="btn-ghost px-2 py-1 text-sm" aria-pressed={task.start === 'someday'} onClick={() => void parkTask(task.id)}>
              <Icon name="archive" />Someday
            </button>
          </div>
        )} />

      <PropertyRow icon="moon" label="Evening" testId="evening" control={readOnly ? (
        <div className="px-2 py-1.5 text-sm text-default">{task.evening ? 'This Evening' : 'Not this evening'}</div>
      ) : (
        <div className="px-2 py-1">
          <Switch label="This Evening" checked={!!task.evening} onChange={(on) => void updateTask(task.id, { evening: on })} />
        </div>
      )} />

      <PropertyRow icon="alarm-clock" label="Reminders" testId="reminders" control={
        <fieldset disabled={readOnly} className="min-w-0 px-1 py-0.5"><RemindersField task={task} /></fieldset>
      } />

      <PropertyRow icon="clock" label="Estimate" testId="estimate" readOnly={readOnly}
        empty={task.estimate_minutes === null} placeholder="No estimate"
        value={task.estimate_minutes !== null ? formatMinutes(task.estimate_minutes) : null}
        editing={estimating} onEditingChange={setEstimating}
        editor={() => <EstimateField task={task} />} />

      <PropertyRow icon="repeat" label="Repeat" testId="repeat" readOnly={readOnly}
        empty={!task.recurrence} placeholder="Does not repeat" value={task.recurrence}
        editor={() => <RecurrenceField task={task} onOpen={onOpen} />} />

      <PropertyRow icon="tag" label="Labels" testId="labels" readOnly={readOnly}
        empty={labels.length === 0} placeholder="No labels"
        value={<span className="flex flex-wrap gap-1">{labels.map((l) => <LabelChip key={l.id} label={l} />)}</span>}
        editor={(close) => (
          <div className="space-y-2">
            {labels.length > 0 && (
              <div className="flex flex-wrap gap-1">{labels.map((l) => <LabelChip key={l.id} label={l} onRemove={() => void removeLabel(task.id, l.id)} />)}</div>
            )}
            <LabelPicker taskId={task.id} onClose={close} />
          </div>
        )} />
    </section>
  )
}
