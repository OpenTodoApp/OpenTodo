// The task page on a phone (OpenSpec change phone-ui-trial, "Phone task page"): the
// container. It runs on the hooks the desktop page runs on (`useTaskDetail`,
// `useTaskFacts`) and hands their result to the drawing (`PhoneTaskView`). The
// editors are the present ones, which open as bottom sheets on a phone; only the
// date has a sheet of its own. Nothing here writes: every edit goes through the
// editor or the hook that the desktop page uses.
import { useCallback, useEffect, useRef, useState } from 'react'
import { t } from '../../lib/i18n'
import { isSample } from '../../lib/sampleTasks'
import { roleOf } from '../../lib/sharing'
import type { Task } from '../../lib/types'
import { setPageBar } from '../../ui'
import { LabelChip } from '../../app/LabelPicker'
import { LocationPreview } from '../../app/locations/LocationPreview'
import { SampleNotice } from '../../app/SampleNotice'
import { useShortcutScope } from '../../app/shortcuts'
import { TitleField } from '../../app/TitleField'
import { AttachMenu, AttachmentsRow } from '../../app/task-detail/AttachmentsRow'
import { ConversationTabs } from '../../app/task-detail/ConversationTabs'
import { PartEditor, type PropertiesProps } from '../../app/task-detail/Facets'
import { FieldsGroup } from '../../app/task-detail/FieldsGroup'
import { useFollowing, useOccurrenceView } from '../../app/task-detail/occurrenceView'
import { RotationLine } from '../../app/task-detail/RotationLine'
import { Subtasks } from '../../app/task-detail/Subtasks'
import { TaskActionsMenu } from '../../app/task-detail/TaskActionsMenu'
import { ReadOnlyNote, TaskRelations } from '../../app/task-detail/TaskHead'
import { TaskNotes } from '../../app/task-detail/TaskNotes'
import { TaskPageDialog } from '../../app/task-detail/TaskPageDialog'
import type { TaskPageViewProps } from '../../app/task-detail/taskPageProps'
import { type TaskDetailModel, useTaskDetail } from '../../app/task-detail/useTaskDetail'
import { type Fact, useTaskFacts } from '../../app/task-detail/useTaskFacts'
import { useOwnBar } from '../chrome'
import { leaveScreen } from '../transition'
import { FACT_CHIP, type FactModel } from '../components/FactRow'
import { PhoneTaskView } from './PhoneTaskView'
import { TaskDateSheet } from './TaskDateSheet'

export function PhoneTaskPage({ taskId, userId, readOnly: viewer, projects, labelMap, nav, onOpen }: TaskPageViewProps) {
  const root = useRef<HTMLDivElement>(null)
  const m = useTaskDetail({ taskId, readOnly: viewer, projects, labelMap, onClose: nav.onBack, onOpen, scope: root })
  // On This occurrence a series' values show without editing them (series-exceptions D5).
  const occurrence = useOccurrenceView(m.task)
  const readOnly = viewer || !!occurrence
  // Under This and following only the series' own fields are edited (series-split D6).
  const following = useFollowing(m.task)
  const locked = readOnly || !!following
  useOwnBar()
  // The edge swipe and the system's Back read the way back from the page bar (app-shell "Edge swipe goes back").
  const onBack = nav.onBack
  const back = useCallback(() => leaveScreen(onBack), [onBack])
  useEffect(() => {
    setPageBar({ title: '', back: { label: t('Back to the list'), onClick: back } })
    return () => setPageBar(null)
  }, [back])
  // A hardware keyboard keeps the task page's keys (keyboard-shortcuts): j and k step, Esc returns.
  useShortcutScope('view', {
    'task.next': () => (nav.hasNext ? nav.onStep(1) : false),
    'task.prev': () => (nav.hasPrev ? nav.onStep(-1) : false),
    'task.escape': (e) => {
      if ((e.target as HTMLElement | null)?.closest('[data-overlay], [data-overlay-root]')) return false
      back()
    },
    'task.parent': () => {
      if (!m.parent || m.parent.deleted_at) return false
      onOpen(m.parent.id)
    },
  }, { view: 'task' })

  const { task } = m
  if (!task) return null
  return (
    <div ref={root} className="min-h-full" data-task-page={task.id} data-detail-for={task.id} data-detail-variant="phone">
      <Body m={m} task={task} viewer={viewer} readOnly={readOnly} locked={locked} root={root}
        facts={{ task, userId, readOnly, projects, labelMap, parent: m.parent ?? undefined, childCount: m.children.length, onOpen }}
        nav={nav} onBack={back} onOpen={onOpen} userId={userId} />
    </div>
  )
}

/** A fact as the phone draws it; `value` falls back to the fact's quiet action ("Set a date"). */
const shown = (f: Fact, fixed: boolean, placeholder = false): FactModel => ({
  id: f.id, label: f.label, icon: f.icon, fixed,
  value: f.value ?? (placeholder ? f.empty : null),
  tone: f.value === null ? 'text-faint' : f.tone,
})

function Body({ m, task, viewer, readOnly, locked, root, facts: props, nav, onBack, onOpen, userId }: {
  m: TaskDetailModel; task: Task; viewer: boolean; readOnly: boolean; locked: boolean
  root: React.RefObject<HTMLDivElement | null>
  facts: PropertiesProps
  nav: TaskPageViewProps['nav']; onBack: () => void; onOpen: (id: string) => void; userId?: string
}) {
  const f = useTaskFacts(props)
  const [dating, setDating] = useState(false)
  // The pinned end of the page: the comment composer renders here while Comments is shown.
  const [footer, setFooter] = useState<HTMLDivElement | null>(null)

  const offered = (x: Fact) => !((x.onlySet || readOnly) && x.value === null)
  const fixed = (x: Fact) => readOnly || (x.id === 'origin' && !!f.parts.get('origin')?.fixed)
  // The date is always a row, so a task without one says so; every other fact is a row once it has a value.
  const schedule = f.schedule.filter(offered).filter((x) => x.id === 'due' || x.value !== null).map((x) => shown(x, fixed(x), x.id === 'due'))
  const details = [...f.where, ...f.details].filter(offered).filter((x) => x.value !== null).map((x) => shown(x, fixed(x)))
  const labels = f.m.labels
  if (labels.length) {
    details.push({ id: 'labels', label: t('Labels'), icon: 'tag', fixed: readOnly,
      value: <span className="flex min-w-0 flex-wrap justify-end gap-1">{labels.map((l) => <LabelChip key={l.id} label={l} />)}</span> })
  }
  const unset = [...f.schedule, ...f.details, ...f.where].filter(offered).filter((x) => x.value === null && x.id !== 'due')
    .map((x) => ({ id: x.id, label: x.label, icon: x.icon }))
  if (!labels.length) unset.push({ id: 'labels', label: t('Labels'), icon: 'tag' })

  const openFact = (id: string) => {
    if (id === 'due' && !readOnly) { setDating(true); return }
    f.pe.activate(id)
  }
  const position = nav.position ? t('{n} of {total}', { n: nav.position.index + 1, total: nav.position.total }) : ''

  return (
    <>
      <PhoneTaskView
        title={(
          <TitleField multiline title={task.title} value={m.title} onChange={m.setTitle} onCommit={m.commitTitle}
            projects={props.projects} labels={m.labelList} readOnly={readOnly} fieldRef={m.titleField}
            className="block w-full resize-none overflow-hidden rounded-control bg-transparent text-h1 font-semibold text-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/30"
            ariaLabel={t('Title')} placeholder={t('Untitled')} dataAttrs={{ 'data-task-title': true }} />
        )}
        done={!!task.completed_at} priority={(task.priority >= 1 && task.priority <= 4 ? task.priority : 4) as 1 | 2 | 3 | 4} readOnly={locked}
        backLabel={nav.backLabel}
        schedule={schedule} details={details} unset={unset} openFact={dating ? 'due' : f.pe.open} factAnchor={f.pe.partRef}
        notice={<>{viewer && <ReadOnlyNote />}{isSample(task) && !readOnly && <SampleNotice />}</>}
        relations={<TaskRelations m={m} onOpen={onOpen} readOnly={viewer} />}
        notes={(
          <div className="space-y-2" data-task-notes-block>
            <TaskNotes task={task} readOnly={locked} outline="auto" />
          </div>
        )}
        extra={<><RotationLine as="div" className="px-1" task={task} userId={userId} /><LocationPreview shown={f.shownLocation} /></>}
        rest={(
          <div className="min-w-0 space-y-4" data-task-rest>
            <FieldsGroup task={task} readOnly={locked} />
            <Subtasks task={task} items={m.children} progress={m.progress} readOnly={locked} boxed onToggle={m.toggle} onOpen={onOpen} />
            <AttachmentsRow taskId={task.id} userId={userId} role={roleOf(task.project_id, m.memberships ?? new Map())} dropTarget={root} />
            <ConversationTabs task={task} userId={userId} readOnly={readOnly} onOpen={onOpen} composerHost={footer} page />
            {/* Above the conversation's sticky tab bar (z 5), which would otherwise paint over the open composer. */}
            <div ref={setFooter} data-panel-footer className="sticky bottom-0 z-[6] bg-canvas pb-3 pt-2 empty:hidden" />
          </div>
        )}
        chipEnd={!locked && <AttachMenu taskId={task.id} chip={FACT_CHIP} />}
        menu={<TaskActionsMenu m={m} page readOnly={locked} onOpen={onOpen}
          step={position ? { position, hasPrev: nav.hasPrev, hasNext: nav.hasNext, onStep: nav.onStep } : undefined} />}
        onBack={onBack} onToggle={() => m.toggle(task)} onFact={openFact} />
      {!readOnly && f.pe.open && (
        <PartEditor id={f.pe.open} props={props} m={f.m} anchor={f.pe.anchor} segment={f.pe.segment} onSegment={f.pe.setSegment} onClose={f.pe.close} />
      )}
      {dating && <TaskDateSheet task={task} onClose={() => setDating(false)} />}
      {m.pageDialog && <TaskPageDialog task={task} status={m.pageStatus ?? null} onClose={() => m.setPageDialog(false)} />}
    </>
  )
}
