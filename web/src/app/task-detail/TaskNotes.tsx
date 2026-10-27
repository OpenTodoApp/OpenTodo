// The task's notes (collaborative-rich-text): the rich-text editor, fetched as its own
// chunk when a note is first opened (task 3.1), the rendered Markdown while it loads,
// and plain text when it cannot load. Notes are shown in full in the panel and on the
// task page; long ones grow with the panel's own scrolling (task-panel-notes-below).
import { Component, lazy, type ReactNode, Suspense, useState } from 'react'
import { updateTask } from '../../lib/ops'
import type { Task } from '../../lib/types'
import { t } from '../../lib/i18n'
import { act } from '../actionError'
import { Markdown } from '../Markdown'
import { useResetOnChange } from '../../lib/useResetOnChange'

const NotesEditor = lazy(() => import('../NotesEditor'))

/** The notes editor with its loading and failure fallbacks. */
export function TaskNotes({ task, readOnly }: { task: Task; readOnly: boolean }) {
  return (
    <NotesBoundary task={task} readOnly={readOnly}>
      <Suspense fallback={<NotesPreview text={task.description} />}>
        <NotesEditor key={task.id} note={{ ...task, entity: 'task' }} readOnly={readOnly} />
      </Suspense>
    </NotesBoundary>
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
  useResetOnChange([task.id, task.description], () => setText(task.description))
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
