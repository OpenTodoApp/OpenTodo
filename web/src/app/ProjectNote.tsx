// A project's note at the top of the project (OpenSpec change project-notes,
// design D4): the Markdown projection at rest, the task-notes editor in place
// when an editor activates it or presses Shift+P (a `project.note` entry of the
// shortcut registry, resolved by the dispatcher in the project's `view` scope).
// Long notes fold after about eight lines; the fold is a per-device preference
// in Dexie meta, never synced. It sits above the sections, the board and the
// timeline, below the quick add, so chrome stays together above content.
import { lazy, Suspense, useLayoutEffect, useRef, useState } from 'react'
import { Button, Icon } from '../ui'
import { setProjectNoteFolded, useMembership, useProjectNoteFolded } from '../lib/localData'
import { canEditProjectNote, roleOf } from '../lib/sharing'
import { keysOf } from '../lib/shortcuts'
import type { Project } from '../lib/types'
import { Markdown } from './Markdown'
import { useShortcutScope } from './shortcuts'
import { Kbd } from './shortcuts/Kbd'
import { t } from '../lib/i18n'

const NotesEditor = lazy(() => import('./NotesEditor'))

/** Folded height: about eight lines of body text. */
const FOLD_PX = 8 * 22
export function ProjectNote({ project }: { project: Project }) {
  // null: a personal project; undefined: still loading (render nothing rather than flash "Add a note" to a viewer).
  const membership = useMembership(project.id)
  const editable = canEditProjectNote(roleOf(project.id, new Map(membership ? [[project.id, membership]] : [])))
  const folded = useProjectNoteFolded(project.id)
  const [editing, setEditing] = useState(false)
  const [tall, setTall] = useState(false)
  const body = useRef<HTMLDivElement>(null)
  const note = project.description ?? ''

  // Shift+P edits the note. The dispatcher keeps it out of text fields and dialogs
  // (keyboard-shortcuts "One shortcut registry with scopes"); a viewer lets it fall through.
  useShortcutScope('view', {
    'project.note': () => { if (!editable) return false; setEditing(true) },
  }, { view: 'project' })

  useLayoutEffect(() => {
    const el = body.current
    setTall(!!el && el.scrollHeight > FOLD_PX + 24)
  }, [note, editing, membership])

  if (membership === undefined || (!editable && !note.trim())) return null

  if (editing) {
    return (
      <section aria-label={t('Project note')} className="mb-4 rounded-card border border-default bg-surface p-3" data-project-note="editing">
        <Suspense fallback={<p className="text-meta text-faint">{t('Loading the editor…')}</p>}>
          <NotesEditor note={{ ...project, entity: 'project' }} readOnly={false} autoFocus onEscape={() => setEditing(false)} />
        </Suspense>
        <div className="mt-2 flex justify-end">
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>{t('Done')}</Button>
        </div>
      </section>
    )
  }

  if (!note.trim()) {
    // One quiet line for people who may edit (the interface budget counts it as content, not chrome).
    return (
      <div className="mb-3" data-project-note="empty">
        <button type="button" onClick={() => setEditing(true)} className="inline-flex min-h-7 items-center gap-1.5 rounded-control px-1.5 py-1 text-meta text-faint hover:bg-sunken hover:text-muted dark:hover:bg-raised">
          <Icon name="pencil" size="xs" />{t('Add a note')} <Kbd k={keysOf('project.note')} only className="ml-1" />
        </button>
      </div>
    )
  }

  const clipped = tall && folded
  return (
    <section aria-label={t('Project note')} className="mb-4" data-project-note={clipped ? 'folded' : 'open'}>
      <div className="relative">
        <div ref={body} className={`overflow-hidden text-body ${editable ? 'cursor-text rounded-control hover:bg-sunken dark:hover:bg-raised' : ''}`}
          style={clipped ? { maxHeight: FOLD_PX } : undefined}
          {...(editable ? {
            role: 'button', tabIndex: 0, 'aria-label': t('Edit the project note ({keys})', { keys: keysOf('project.note') }),
            onClick: (e: React.MouseEvent) => { if (!(e.target as HTMLElement).closest('a')) setEditing(true) },
            onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); setEditing(true) } },
          } : {})}>
          <Markdown source={note} rich />
        </div>
        {clipped && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-canvas" aria-hidden />}
      </div>
      {tall && (
        <button type="button" className="mt-1 text-meta text-muted hover:text-default hover:underline" aria-expanded={!folded}
          onClick={() => void setProjectNoteFolded(project.id, !folded)}>
          {folded ? t('Show more') : t('Show less')}
        </button>
      )}
    </section>
  )
}
