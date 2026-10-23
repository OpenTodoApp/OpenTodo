// The task's notes (collaborative-rich-text): the rich-text editor, fetched as its own
// chunk when a note is first opened (task 3.1), the rendered Markdown while it loads,
// and plain text when it cannot load. The docked panel clamps long notes at rest; the
// task page never does (task-full-page).
import { Component, lazy, type ReactNode, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { updateTask } from '../../lib/ops'
import type { Task } from '../../lib/types'
import { t } from '../../lib/i18n'
import { act } from '../actionError'
import { Markdown } from '../Markdown'

const NotesEditor = lazy(() => import('../NotesEditor'))

/** The notes editor with its loading and failure fallbacks; `clamp` rests long notes at about eight lines. */
export function TaskNotes({ task, readOnly, clamp }: { task: Task; readOnly: boolean; clamp: boolean }) {
  return (
    <NotesClamp taskId={task.id} enabled={clamp}>
      <NotesBoundary task={task} readOnly={readOnly}>
        <Suspense fallback={<NotesPreview text={task.description} />}>
          <NotesEditor key={task.id} note={{ ...task, entity: 'task' }} readOnly={readOnly} />
        </Suspense>
      </NotesBoundary>
    </NotesClamp>
  )
}

/** Lines of notes shown at rest in the panel before "Show all" (task-panel-facets D4). */
export const NOTES_CLAMP_LINES = 8

/**
 * Long notes rest clamped in the panel (web-app "Task panel notes clamp"): about eight
 * lines and a "Show all" line, so the facts below stay in view. Focusing the notes or
 * Show all expands them until another task is opened; the task page never clamps, and
 * notes only a line over the limit are never clamped, so short notes do not flicker.
 */
function NotesClamp({ taskId, enabled, children }: { taskId: string; enabled: boolean; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [tall, setTall] = useState(false)
  useEffect(() => { setExpanded(false) }, [taskId])
  useLayoutEffect(() => {
    const el = box.current
    if (!el || !enabled) return
    const measure = () => {
      const content = el.firstElementChild as HTMLElement | null
      if (!content) return
      const line = parseFloat(getComputedStyle(content).lineHeight) || 24
      setTall(content.scrollHeight > line * (NOTES_CLAMP_LINES + 1))
    }
    measure()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    if (ro && el.firstElementChild) ro.observe(el.firstElementChild)
    return () => ro?.disconnect()
  }, [enabled, taskId])
  const clamped = enabled && tall && !expanded
  return (
    <div ref={box} className="notes-clamp" data-clamped={clamped || undefined} onFocusCapture={() => setExpanded(true)}>
      {children}
      {clamped && (
        <button type="button" className="mt-1 text-meta text-accent hover:underline" onClick={() => setExpanded(true)} data-notes-show-all>{t('Show all')}</button>
      )}
    </div>
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
