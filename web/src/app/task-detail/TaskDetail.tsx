import { useLiveQuery } from 'dexie-react-hooks'
import { Component, type FormEvent, lazy, type ReactNode, Suspense, useEffect, useMemo, useRef, useState, type TouchEvent } from 'react'
import { openAssistantWith, useAssistantStatus } from '../../lib/assistantStatus'
import { db } from '../../lib/db'
import { markTaskNotificationsRead } from '../../lib/notifications'
import { createSubtask, updateTask, skipOccurrence } from '../../lib/ops'
import { membershipMap, roleOf } from '../../lib/sharing'
import { progressOf } from '../../lib/subtasks'
import { duplicateTask } from '../../lib/templates'
import type { Label, Priority, Project, Task } from '../../lib/types'
import { IconButton, DESKTOP_HEADER_QUERY, useMediaQuery } from '../../ui'
import { Tooltip } from '../../ui'
import { Badge } from '../../ui'
import { Icon } from '../../ui'
import { MenuItem, MenuSeparator } from '../../ui'
import { Markdown } from '../Markdown'
import { Menu } from '../overlay/Menu'
import { useShortcutScope } from '../shortcuts'
import { keysOf } from '../../lib/shortcuts'
import { openHelp } from '../help/store'
import { navigate } from '../router'
import { completeWithUndo, deleteWithUndo } from '../undoable'
import { AttachmentsRow } from './AttachmentsRow'
import { ConversationTabs } from './ConversationTabs'
import { FieldsGroup } from './FieldsGroup'
import { Properties } from './Properties'
import { t } from '../../lib/i18n'
import { act } from '../actionError'

// The rich-text editor and its libraries are a separate chunk, fetched when a
// note is first opened (collaborative-rich-text, task 3.1).
const NotesEditor = lazy(() => import('../NotesEditor'))

/** The link that opens a task in the app (the same one notifications use). */
export function taskLink(id: string, origin = typeof location === 'undefined' ? '' : location.origin): string {
  return `${origin}/?task=${encodeURIComponent(id)}`
}

export function TaskDetail({ taskId, userId, projects, labelMap, onClose, onOpen, onToggleComplete, readOnly = false, variant = 'panel' }: {
  taskId: string
  /** `panel`: the shell's slot. `page`: the expanded task at /task/<id>, where Close is a Back action. */
  variant?: 'panel' | 'page'
  /** Signed-in account; enables the assignee row (task-assignment). */
  userId?: string
  /** Viewer of the task's shared project: values read as text, no Complete or Delete. */
  readOnly?: boolean
  projects: Project[]
  labelMap: Map<string, Label>
  onClose: () => void
  /** Open another task in the panel (a subtask or the parent). */
  onOpen?: (id: string) => void
  /** Complete / reopen through the list so the "complete parent too" prompt can follow. */
  onToggleComplete?: (task: Task) => void
}) {
  const assistant = useAssistantStatus()
  const task = useLiveQuery(() => db.tasks.get(taskId), [taskId])
  const [title, setTitle] = useState('')
  const [copied, setCopied] = useState(false)

  const children = useLiveQuery(
    () => db.tasks.where('parent_id').equals(taskId).filter((tk) => !tk.deleted_at).sortBy('position'),
    [taskId], [] as Task[],
  )
  const parent = useLiveQuery(() => (task?.parent_id ? db.tasks.get(task.parent_id) : undefined), [task?.parent_id])
  const series = useLiveQuery(() => (task?.series_id ? db.tasks.get(task.series_id) : undefined), [task?.series_id])
  const progress = useMemo(() => progressOf({ id: taskId }, children), [taskId, children])
  const memberships = useLiveQuery(() => membershipMap(), [])
  const panel = useRef<HTMLElement>(null)
  // The pinned bottom of the panel: the comment composer renders here while the
  // Comments tab is shown, so it is in view without scrolling (ux-overhaul).
  const [footer, setFooter] = useState<HTMLDivElement | null>(null)

  // The stored title the draft started from, and whether the field has focus: a
  // change from another device does not overwrite a title being typed
  // (client-sync-robustness); the draft is committed on blur as usual.
  const titleBase = useRef('')
  const titleField = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!task) return
    const focused = !!titleField.current && titleField.current === document.activeElement
    if (focused && title !== titleBase.current) return
    titleBase.current = task.title
    setTitle(task.title)
  }, [task?.id, task?.title]) // eslint-disable-line react-hooks/exhaustive-deps -- reacts to the stored title only; the draft is read, not a trigger
  useEffect(() => setCopied(false), [taskId])
  // Opening a task reads its notifications (task-assignment); works offline.
  useEffect(() => {
    void markTaskNotificationsRead(taskId)
  }, [taskId])

  // The `panel` scope while focus is inside the panel (keyboard-shortcuts "Innermost
  // scope wins"): 1–4 set the open task's priority, Shift+K skips its occurrence.
  useShortcutScope('panel', {
    'panel.priority': (e) => {
      if (!task || readOnly) return false
      act(updateTask(task.id, { priority: Number(e.key) as Priority }))
    },
    'panel.skip': () => {
      if (!task || readOnly || !task.recurrence) return false
      act(skipOccurrence(task.id))
    },
  }, { within: () => panel.current })

  const phone = !useMediaQuery(DESKTOP_HEADER_QUERY)
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const onSwipeStart = (e: TouchEvent<HTMLElement>) => { const item = e.touches[0]; swipe.current = item ? { x: item.clientX, y: item.clientY } : null }
  const onSwipeEnd = (e: TouchEvent<HTMLElement>) => {
    const s = swipe.current, entry = e.changedTouches[0]
    swipe.current = null
    if (s && entry && entry.clientY - s.y > 80 && Math.abs(entry.clientX - s.x) < 60) onClose()
  }

  if (!task) return null

  // assistant-skills: "Break this down" runs the skill with this task as its subject.
  const breakDown = () => openAssistantWith({ skill: 'break-down', text: t('Break down “{title}”', { title: task.title }), selected: [task.id] })

  const commitTitle = () => {
    const x1 = title.trim()
    titleBase.current = x1 && x1 !== task.title ? x1 : task.title
    if (x1 && x1 !== task.title) act(updateTask(task.id, { title: x1 }))
    else setTitle(task.title)
  }
  const toggle = (task: Task) => (onToggleComplete ? onToggleComplete(task) : act(completeWithUndo(task.id, !task.completed_at)))
  const remove = () => { act(deleteWithUndo(task.id)); onClose() }
  const copyLink = () => {
    void navigator.clipboard?.writeText(taskLink(task.id)).then(() => setCopied(true), () => {})
  }
  const page = variant === 'page'
  const done = !!task.completed_at
  const ring = { 1: 'border-p1 bg-p1-soft', 2: 'border-p2 bg-p2-soft', 3: 'border-p3 bg-p3-soft', 4: 'border-p4 bg-p4-soft' }[task.priority] ?? 'border-p4'
  return (
    <aside ref={panel} data-detail-for={task.id} data-detail-variant={variant}
      className={page
        ? 'mx-auto flex w-full max-w-3xl min-w-0 flex-col'
        : 'fixed inset-y-0 right-0 z-30 flex w-full flex-col border-l border-default bg-surface pb-[env(safe-area-inset-bottom)] shadow-3 md:max-w-md lg:static lg:w-[26rem] lg:max-w-none lg:shadow-none min-[1440px]:w-[30rem]'}>
      {/* Sticky header (ux-overhaul, web-app "Task panel layout"): the checkbox, the title, the menu, Close. */}
      <div data-panel-header className={`flex items-center gap-2 border-b border-default px-3 py-2 ${page ? 'sticky top-0 z-10 bg-canvas/95 backdrop-blur-sm' : 'pt-[max(0.5rem,env(safe-area-inset-top))]'}`}
        onTouchStart={page ? undefined : onSwipeStart} onTouchEnd={page ? undefined : onSwipeEnd}>
        {/* Below 768 px the panel is a full-screen sheet (app-shell "Panel width and expansion"): Back, or a swipe down on the header, closes it. */}
        {(page || phone) && <IconButton icon="arrow-left" label={t('Back to the list')} onClick={onClose} data-task-back className="touch-target" />}
        <button type="button" aria-label={done ? t('Reopen task') : t('Complete task')} aria-pressed={done} disabled={readOnly} onClick={() => toggle(task)} data-panel-complete
          className="touch-target inline-flex shrink-0 items-center justify-center rounded-full">
          <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition ${ring} ${done ? 'bg-faint border-input text-on-accent' : 'hover:bg-success-soft'}`}>
            {done && <Icon name="check" size="xs" />}
          </span>
        </button>
        <input
          className={`min-w-0 flex-1 bg-transparent font-semibold text-strong focus:outline-none ${page ? 'text-h2' : 'text-h3'} ${done ? 'text-faint line-through' : ''}`}
          value={title}
          readOnly={readOnly}
          onChange={(e) => setTitle(e.target.value)}
          ref={titleField}
          onBlur={commitTitle}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          aria-label={t('Title')}
          placeholder={t('Untitled')}
        />
        {progress.total > 0 && <Badge hue="slate" title={t('Completed subtasks')}>{progress.done}/{progress.total}</Badge>}
        {copied && <span role="status" className="text-meta text-muted">{t('Link copied')}</span>}
        <Menu kind="menu" label={t('Task actions')} trigger={<Icon name="ellipsis" size="md" />} triggerClassName="ui-btn ui-btn--ghost ui-btn--sm touch-target px-2 py-1.5" width="sm:w-60">
          <MenuItem label={t('Copy link')} icon="link" onSelect={copyLink} />
          <MenuItem label={t('Help')} icon="circle-help" description={t('The guide to the task panel')} onSelect={() => openHelp('task-panel')} />
          {!page && <MenuItem label={t('Expand')} icon="external-link" description={t('Open the task as a page')} onSelect={() => navigate({ view: 'task', id: task.id })} />}
          {parent && <MenuItem label={t('Open parent task')} icon="corner-down-right" onSelect={() => onOpen?.(parent.id)} />}
          {series && <MenuItem label={t('Open recurring task')} icon="repeat" onSelect={() => onOpen?.(series.id)} />}
          {!readOnly && <MenuItem label={t('Duplicate')} icon="copy" shortcut={keysOf('list.duplicate')} onSelect={() => void duplicateTask(task.id).then((id) => onOpen?.(id))} />}
          {!readOnly && assistant?.available && <MenuItem label={t('Break this down')} icon="list" onSelect={breakDown} />}
          {!readOnly && <MenuSeparator />}
          {!readOnly && <MenuItem label={t('Delete')} icon="trash-2" danger onSelect={remove} />}
        </Menu>
        {!page && <IconButton icon="x" label={t('Close')} onClick={onClose} data-overlay-close className="touch-target" />}
      </div>
      {readOnly && (
        <p role="note" className="border-b border-default bg-sunken px-4 py-2 text-meta text-muted">
          {t('Read-only: you are a viewer of this shared project. You can still comment.')}
        </p>
      )}
      <div className={page ? 'min-w-0' : 'min-w-0 flex-1 overflow-y-auto'}>
        <div className="min-w-0 space-y-4 p-4">
          {parent && (
            <Tooltip label={t('Open parent task')}>
              <button type="button" className="flex items-center gap-1 text-meta text-faint hover:text-default" onClick={() => onOpen?.(parent.id)}>
                <Icon name="corner-down-right" />{parent.title || t('Untitled')}
                {parent.deleted_at ? ` ${t('(deleted)')}` : parent.completed_at && !task.completed_at ? ` ${t('(completed)')}` : ''}
              </button>
            </Tooltip>
          )}
          {series && (
            <Tooltip label={t('Open the recurring task')}>
              <button type="button" className="flex items-center gap-1 text-meta text-faint hover:text-default" onClick={() => onOpen?.(series.id)}>
                <Icon name="repeat" />{task.completed_at ? t('Completed occurrence of {title}', { title: series.title || t('Untitled') }) : t('Single occurrence of {title}', { title: series.title || t('Untitled') })}{series.deleted_at ? ` ${t('(deleted)')}` : ''}
              </button>
            </Tooltip>
          )}
          <NotesBoundary task={task} readOnly={readOnly}>
            <Suspense fallback={<NotesPreview text={task.description} />}>
              <NotesEditor key={task.id} note={{ ...task, entity: 'task' }} readOnly={readOnly} />
            </Suspense>
          </NotesBoundary>

          <Properties task={task} userId={userId} readOnly={readOnly} projects={projects} labelMap={labelMap}
            parent={parent} childCount={children.length} onOpen={onOpen} />

          {/* Custom field values of the task's project (custom-fields). */}
          <FieldsGroup task={task} readOnly={readOnly} />

          {/* Subtasks as a checklist with a quiet add line (ux-overhaul, "Task panel layout"). */}
          <section aria-label={t('Subtasks')} data-subtasks>
            {children.length > 0 && (
              <h3 className="mb-1 flex items-center gap-2 text-meta font-semibold text-muted">
                <Icon name="list" className="text-faint" />{t('Subtasks')}<span className="font-normal text-faint">{progress.done}/{progress.total}</span>
              </h3>
            )}
            <ul className="space-y-0.5 empty:hidden" aria-label={t('Subtasks')}>
              {children.map((c) => (
                <li key={c.id} className="flex items-center gap-2 rounded-control px-1 py-1 hover:bg-sunken dark:hover:bg-raised">
                  <button
                    type="button"
                    aria-label={c.completed_at ? t('Reopen {title}', { title: c.title }) : t('Complete {title}', { title: c.title })}
                    aria-pressed={!!c.completed_at}
                    onClick={() => toggle(c)}
                    disabled={readOnly}
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${c.completed_at ? 'border-input bg-faint text-on-accent' : 'border-input hover:bg-success-soft'}`}
                  >
                    {c.completed_at && <Icon name="check" size={10} />}
                  </button>
                  <button type="button" className={`min-w-0 flex-1 truncate text-left text-body ${c.completed_at ? 'text-faint line-through' : 'text-default'}`} onClick={() => onOpen?.(c.id)}>
                    {c.title || <span className="italic text-faint">{t('Untitled')}</span>}
                  </button>
                </li>
              ))}
            </ul>
            {!readOnly && <AddSubtask parent={task} />}
          </section>

          <AttachmentsRow taskId={task.id} userId={userId} role={roleOf(task.project_id, memberships ?? new Map())} dropTarget={panel} />
        </div>
        <ConversationTabs task={task} userId={userId} readOnly={readOnly} onOpen={onOpen} composerHost={footer} />
      </div>
      <div ref={setFooter} data-panel-footer className={`shrink-0 border-t border-default px-4 py-3 empty:hidden ${page ? 'sticky bottom-0 bg-canvas/95 backdrop-blur-sm' : 'bg-surface'}`} />
    </aside>
  )
}

/** "Add subtask" input: creates on Enter and stays focused for the next entry. */
function AddSubtask({ parent }: { parent: Task }) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    const title = value.trim()
    if (!title) return
    setValue('')
    await createSubtask(parent.id, title)
    ref.current?.focus()
  }
  return (
    <form onSubmit={(e) => void submit(e)} className="flex items-center gap-2 px-1" data-add-subtask>
      <span className="text-faint"><Icon name="plus" size="xs" /></span>
      <input
        ref={ref}
        className="min-w-0 flex-1 bg-transparent py-1 text-body text-default placeholder:text-faint focus:outline-none"
        placeholder={t('Add subtask…')}
        aria-label={t('Add subtask')}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') (e.target as HTMLInputElement).blur() }}
      />
    </form>
  )
}

/** The note as rendered Markdown while the editor chunk loads. */
function NotesPreview({ text }: { text: string }) {
  return (
    <div className="notes-host" aria-busy="true">
      <div className="notes-editor">{text ? <Markdown source={text} /> : <p className="text-faint">{t('Add notes…')}</p>}</div>
    </div>
  )
}

/** Plain-text notes, the fallback when the editor cannot load (e.g. its chunk is missing offline). */
function PlainNotes({ task, readOnly }: { task: Task; readOnly: boolean }) {
  const [text, setText] = useState(task.description)
  useEffect(() => setText(task.description), [task.id, task.description])
  return (
    <textarea
      className="notes-plain"
      placeholder={t('Add notes…')}
      value={text}
      disabled={readOnly}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== task.description) act(updateTask(task.id, { description: text }))
      }}
      aria-label={t('Notes')}
    />
  )
}

/** Falls back to plain-text notes when the rich-text editor fails to load or render. */
class NotesBoundary extends Component<{ task: Task; readOnly: boolean; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return <PlainNotes task={this.props.task} readOnly={this.props.readOnly} />
  }
}
