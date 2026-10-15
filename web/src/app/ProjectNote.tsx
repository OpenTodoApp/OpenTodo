// A project's note at the top of the project (OpenSpec change project-notes,
// design D4): the Markdown projection at rest, the task-notes editor in place
// when an editor activates it or presses Shift+P. Long notes fold after about
// eight lines; the fold is a per-device preference in Dexie meta, never synced.
import { useLiveQuery } from 'dexie-react-hooks'
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button, Icon } from '../ui'
import { db, getMeta, setMeta } from '../lib/db'
import { canEditProjectNote, roleOf } from '../lib/sharing'
import type { Membership, Project } from '../lib/types'
import { Markdown } from './Markdown'

const NotesEditor = lazy(() => import('./NotesEditor'))

/** Folded height: about eight lines of body text. */
const FOLD_PX = 8 * 22
const foldKey = (projectId: string) => `project-note-folded:${projectId}`

export function ProjectNote({ project }: { project: Project }) {
  // null: a personal project; undefined: still loading (render nothing rather than flash "Add a note" to a viewer).
  const membership = useLiveQuery(() => db.memberships.get(project.id).then((m) => m ?? null), [project.id]) as Membership | null | undefined
  const editable = canEditProjectNote(roleOf(project.id, new Map(membership ? [[project.id, membership]] : [])))
  const folded = useLiveQuery(() => getMeta<boolean>(foldKey(project.id), true), [project.id], true)
  const [editing, setEditing] = useState(false)
  const [tall, setTall] = useState(false)
  const body = useRef<HTMLDivElement>(null)
  const note = project.description ?? ''

  // Shift+P edits the note (ignored while typing elsewhere), like m and Shift+S in the header.
  useEffect(() => {
    if (!editable) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'P' || !e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (document.querySelector('[role="dialog"]')) return
      e.preventDefault()
      setEditing(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editable])

  useLayoutEffect(() => {
    const el = body.current
    setTall(!!el && el.scrollHeight > FOLD_PX + 24)
  }, [note, editing, membership])

  if (membership === undefined || (!editable && !note.trim())) return null

  if (editing) {
    return (
      <section aria-label="Project note" className="mb-4 rounded-card border border-default bg-surface p-3" data-project-note="editing">
        <Suspense fallback={<p className="text-meta text-faint">Loading the editor…</p>}>
          <NotesEditor note={{ ...project, entity: 'project' }} readOnly={false} autoFocus onEscape={() => setEditing(false)} />
        </Suspense>
        <div className="mt-2 flex justify-end">
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Done</Button>
        </div>
      </section>
    )
  }

  if (!note.trim()) {
    return (
      <div className="mb-3" data-project-note="empty">
        <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 rounded-control px-1.5 py-1 text-meta text-faint hover:bg-sunken hover:text-muted dark:hover:bg-raised">
          <Icon name="pencil" size="xs" />Add a note <span className="ui-kbd ml-1">Shift+P</span>
        </button>
      </div>
    )
  }

  const clipped = tall && folded
  return (
    <section aria-label="Project note" className="mb-4" data-project-note={clipped ? 'folded' : 'open'}>
      <div className="relative">
        <div ref={body} className={`overflow-hidden text-body ${editable ? 'cursor-text rounded-control hover:bg-sunken dark:hover:bg-raised' : ''}`}
          style={clipped ? { maxHeight: FOLD_PX } : undefined}
          {...(editable ? {
            role: 'button', tabIndex: 0, 'aria-label': 'Edit the project note (Shift+P)',
            onClick: (e: React.MouseEvent) => { if (!(e.target as HTMLElement).closest('a')) setEditing(true) },
            onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); setEditing(true) } },
          } : {})}>
          <Markdown source={note} rich />
        </div>
        {clipped && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-canvas" aria-hidden />}
      </div>
      {tall && (
        <button type="button" className="mt-1 text-meta text-muted hover:text-default hover:underline" aria-expanded={!folded}
          onClick={() => void setMeta(foldKey(project.id), !folded)}>
          {folded ? 'Show more' : 'Show less'}
        </button>
      )}
    </section>
  )
}
