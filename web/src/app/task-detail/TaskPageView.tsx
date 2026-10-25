// The task as a page (OpenSpec change task-full-page, design D1): a compact header
// with the breadcrumb (project › section › task), the task's place in the list it was
// opened from ("4 / 12") with the next and previous task, the menu and Close; then
// two columns: the content (title, notes, subtasks, attachments, the conversation and
// its composer pinned to the bottom) and the facts (TaskFacts). Below 1024 px the
// facts sit under the notes; below 768 px they are one stacked card of rows, the
// unset ones behind More (precision-phone D4). Esc, Close and the phone's Back
// return to the list.
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { roleOf } from '../../lib/sharing'
import type { Label, Project } from '../../lib/types'
import { t } from '../../lib/i18n'
import { DESKTOP_HEADER_QUERY, Icon, IconButton, PAGE_FRAME, PageHeader, useMediaQuery } from '../../ui'
import { navigate } from '../router'
import { SampleNotice } from '../SampleNotice'
import { isSample } from '../../lib/sampleTasks'
import { useShortcutScope } from '../shortcuts'
import { ProjectMark } from '../Sidebar'
import { keysOf } from '../../lib/shortcuts'
import { AttachMenu, AttachmentsRow } from './AttachmentsRow'
import { ConversationTabs } from './ConversationTabs'
import { FieldsGroup } from './FieldsGroup'
import { Subtasks } from './Subtasks'
import { TaskActionsMenu } from './TaskActionsMenu'
import { TaskFacts } from './TaskFacts'
import { ReadOnlyNote, TaskHead, TaskRelations } from './TaskHead'
import { TaskNotes } from './TaskNotes'
import { TaskPageDialog } from './TaskPageDialog'
import { useTaskDetail } from './useTaskDetail'

export interface TaskPageNav {
  /** Where the task sits in the list it was opened from, or null when it is not listed there. */
  position: { index: number; total: number } | null
  hasPrev: boolean
  hasNext: boolean
  onStep: (step: 1 | -1) => void
  onBack: () => void
  /** The list's name, for the phone's bar ("Today"). */
  backLabel: string
}

export interface TaskPageViewProps {
  taskId: string
  userId?: string
  readOnly: boolean
  projects: Project[]
  labelMap: Map<string, Label>
  nav: TaskPageNav
  onOpen: (id: string) => void
}

export function TaskPageView({ taskId, userId, readOnly, projects, labelMap, nav, onOpen }: TaskPageViewProps) {
  const root = useRef<HTMLDivElement>(null)
  const m = useTaskDetail({ taskId, readOnly, projects, labelMap, onClose: nav.onBack, onOpen, scope: root })
  const desktop = useMediaQuery(DESKTOP_HEADER_QUERY)
  // The pinned bottom of the content column: the comment composer renders here while Comments is shown.
  const [footer, setFooter] = useState<HTMLDivElement | null>(null)
  // The header's height, so the conversation's tab bar and the facts pin just under it.
  useLayoutEffect(() => {
    const el = root.current
    const head = el?.querySelector<HTMLElement>('[data-page-header]')
    if (el && head) el.style.setProperty('--panel-header-h', `${head.offsetHeight}px`)
  })

  // The task page's keys (keyboard-shortcuts): j and k step through the list, Esc returns to it.
  useShortcutScope('view', {
    'task.next': () => (nav.hasNext ? nav.onStep(1) : false),
    'task.prev': () => (nav.hasPrev ? nav.onStep(-1) : false),
    'task.escape': (e) => {
      // An overlay above the page (a popover, a dialog) keeps its own Escape.
      if ((e.target as HTMLElement | null)?.closest('[data-overlay], [data-overlay-root]')) return false
      nav.onBack()
    },
  }, { view: 'task' })

  const { task } = m
  if (!task) return null
  const project = task.project_id ? projects.find((p) => p.id === task.project_id) : undefined

  const stepper = (
    <>
      {nav.position && (
        <span className="px-1 text-meta tabular-nums text-muted" data-task-position>
          <span aria-hidden="true">{nav.position.index + 1} / {nav.position.total}</span>
          <span className="sr-only">{t('Task {n} of {total}', { n: nav.position.index + 1, total: nav.position.total })}</span>
        </span>
      )}
      {nav.position && <IconButton icon="arrow-down" size="sm" label={t('Next task')} shortcut={keysOf('task.next')} disabled={!nav.hasNext} onClick={() => nav.onStep(1)} data-task-next />}
      {nav.position && <IconButton icon="arrow-up" size="sm" label={t('Previous task')} shortcut={keysOf('task.prev')} disabled={!nav.hasPrev} onClick={() => nav.onStep(-1)} data-task-prev />}
    </>
  )
  const crumbs = (
    <Breadcrumb>
      {project
        ? <button type="button" className="inline-flex min-w-0 items-center gap-1.5 rounded-control px-1 text-muted hover:bg-hover hover:text-default" onClick={() => navigate({ view: 'project', id: project.id })} data-crumb="project">
            <ProjectMark project={project} /><span className="truncate">{project.name}</span>
          </button>
        : <span className="px-1 text-muted" data-crumb="project">{nav.backLabel || t('Inbox')}</span>}
      {m.parent && (
        <button type="button" className="min-w-0 truncate rounded-control px-1 text-muted hover:bg-hover hover:text-default" onClick={() => onOpen(m.parent!.id)} data-crumb="parent">
          {m.parent.title || t('Untitled')}
        </button>
      )}
      <span className="min-w-0 truncate px-1 text-strong" aria-current="page" data-crumb="task">{task.title || t('Untitled')}</span>
    </Breadcrumb>
  )

  return (
    <div ref={root} className={`${PAGE_FRAME} px-4 md:px-8`} data-task-page={task.id} data-detail-for={task.id} data-detail-variant="page">
      <PageHeader title={desktop ? crumbs : nav.backLabel || project?.name || t('Inbox')} help="task-panel" barActions
        back={desktop ? undefined : { label: t('Back to the list'), onClick: nav.onBack }}
        menu={<TaskActionsMenu m={m} page readOnly={readOnly} onOpen={onOpen} />}
        actions={<>{stepper}{desktop && <IconButton icon="x" size="sm" label={t('Close')} shortcut="Esc" onClick={nav.onBack} data-task-close />}</>} />
      {readOnly && <ReadOnlyNote />}
      {isSample(task) && !readOnly && <SampleNotice />}
      <div className="grid min-w-0 gap-x-10 gap-y-6 pb-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-3 lg:col-start-1 lg:pt-4" data-task-content>
          <div className="flex min-w-0 items-start gap-2">
            <TaskHead m={m} readOnly={readOnly} projects={projects} size="page" />
          </div>
          <TaskRelations m={m} onOpen={onOpen} />
          <TaskNotes task={task} readOnly={readOnly} clamp={false} />
          {!readOnly && (
            <div className="flex items-center gap-1" data-content-tools>
              <AttachMenu taskId={task.id} />
            </div>
          )}
        </div>
        <aside aria-label={t('Facts')} className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:sticky lg:top-(--panel-header-h) lg:self-start lg:border-l lg:border-soft lg:pl-8 lg:pt-4 max-lg:rounded-card max-lg:border max-lg:border-default md:max-lg:p-3 max-md:overflow-hidden" data-task-facts>
          {/* Below 768 px the facts are one stacked card of 44 px rows (precision-phone D4). */}
          <TaskFacts stacked={!desktop} task={task} userId={userId} readOnly={readOnly} projects={projects} labelMap={labelMap}
            parent={m.parent ?? undefined} childCount={m.children.length} onOpen={onOpen} />
        </aside>
        <div className="min-w-0 space-y-4 lg:col-start-1" data-task-rest>
          {/* Custom field values of the task's project (custom-fields). */}
          <FieldsGroup task={task} readOnly={readOnly} />
          <Subtasks task={task} items={m.children} progress={m.progress} readOnly={readOnly} boxed onToggle={m.toggle} onOpen={onOpen} />
          <AttachmentsRow taskId={task.id} userId={userId} role={roleOf(task.project_id, m.memberships ?? new Map())} dropTarget={root} />
          <ConversationTabs task={task} userId={userId} readOnly={readOnly} onOpen={onOpen} composerHost={footer} page />
          <div ref={setFooter} data-panel-footer className="sticky bottom-0 bg-surface pb-3 pt-2 empty:hidden" />
        </div>
      </div>
      {m.pageDialog && <TaskPageDialog task={task} status={m.pageStatus ?? null} onClose={() => m.setPageDialog(false)} />}
    </div>
  )
}

/** Crumbs separated by a chevron; the last one is the page. Phrasing content, since the page's heading holds it. */
function Breadcrumb({ children }: { children: ReactNode[] }) {
  const items = children.filter(Boolean)
  return (
    <span className="flex min-w-0 items-center gap-0.5 text-body font-normal" data-breadcrumb>
      {items.map((c, i) => (
        <span key={i} className="flex min-w-0 items-center gap-0.5">
          {i > 0 && <Icon name="chevron-right" size="xs" className="shrink-0 text-faint" />}
          {c}
        </span>
      ))}
    </span>
  )
}
