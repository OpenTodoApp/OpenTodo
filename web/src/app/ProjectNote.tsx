// A project's note at the top of the project (OpenSpec change project-notes,
// design D4): the Markdown projection at rest, the task-notes editor in place
// when an editor activates it or presses Shift+P (a `project.note` entry of the
// shortcut registry, resolved by the dispatcher in the project's `view` scope).
// Long notes fold after about eight lines; the fold is a per-device preference
// in Dexie meta, never synced. It sits above the sections, the board and the
// timeline, below the quick add, so chrome stays together above content.
import { resettable } from '../lib/moduleState'
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button, Icon } from '../ui'
import { setProjectNoteFolded, useMembership, useProjectNoteFolded } from '../lib/localData'
import { canEditProjectNote, roleOf } from '../lib/sharing'
import { keysOf } from '../lib/shortcuts'
import type { Project } from '../lib/types'
import { Markdown } from './Markdown'
import { useShortcutScope } from './shortcuts'
import { Kbd } from './shortcuts/Kbd'
import { t } from '../lib/i18n'
import { OUTLINE_MIN } from '../lib/noteOutline'
import type { OutlineEntry } from './editor/NoteOutline'

const NotesEditor = lazy(() => import('./NotesEditor'))
// The outline of a rendered note (note-outline), fetched only for a note with headings: the first load is unchanged.
const OutlineButton = lazy(() => import('./editor/NoteOutline').then((m) => ({ default: m.OutlineButton })))

/** "Add a note" from the project menu on a phone, where the empty note's line is not shown (phone-v2 D1). */
const noteRequests = new Set<(id: string) => void>()
/** A request made before the project's page is on screen (the Notes page opens a project note): taken by its note when it mounts. */
let pendingNote: string | null = null
resettable('projectNote.pending', () => (pendingNote = null))
export function requestProjectNote(projectId: string): void {
  pendingNote = projectId
  noteRequests.forEach((fn) => fn(projectId))
}

/** The rendered note's top-level headings of levels 1 to 3 (not in quotes, lists or tables). */
function noteHeadings(el: HTMLElement): HTMLElement[] {
  return [...el.querySelectorAll<HTMLElement>('[data-heading-level="1"], [data-heading-level="2"], [data-heading-level="3"]')].filter((h) => !h.parentElement?.closest('blockquote, li, table'))
}

/** Folded height: about eight lines of body text. */
const FOLD_PX = 8 * 22

export function ProjectNote({ project, phone = false }: { project: Project; phone?: boolean }) {
  // null: a personal project; undefined: still loading (render nothing rather than flash "Add a note" to a viewer).
  const membership = useMembership(project.id)
  const editable = canEditProjectNote(roleOf(project.id, new Map(membership ? [[project.id, membership]] : [])))
  const folded = useProjectNoteFolded(project.id)
  const [editing, setEditing] = useState(false)
  const [tall, setTall] = useState(false)
  const [heads, setHeads] = useState<OutlineEntry[]>([])
  const [outlineOpen, setOutlineOpen] = useState(false)
  const body = useRef<HTMLDivElement>(null)
  const note = project.description ?? ''

  // Shift+P edits the note. The dispatcher keeps it out of text fields and dialogs
  // (keyboard-shortcuts "One shortcut registry with scopes"); a viewer lets it fall through.
  useShortcutScope('view', {
    'project.note': () => { if (!editable) return false; setEditing(true) },
  }, { view: 'project' })

  useEffect(() => {
    const on = (id: string) => { if (id === project.id) { pendingNote = null; setEditing(true) } }
    if (pendingNote === project.id) on(project.id)
    noteRequests.add(on)
    return () => { noteRequests.delete(on) }
  }, [project.id])

  useLayoutEffect(() => {
    const el = body.current
    setTall(!!el && el.scrollHeight > FOLD_PX + 24)
    const next = el ? noteHeadings(el).map((h) => ({ level: Number(h.dataset.headingLevel) as OutlineEntry['level'], text: h.textContent?.trim() ?? '' })) : []
    setHeads((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
  }, [note, editing, membership])
  // A heading chosen in the rendered note's outline (note-outline D3): unfolded, scrolled to the top and focused.
  const goTo = (i: number) => {
    if (folded) void setProjectNoteFolded(project.id, false)
    requestAnimationFrame(() => {
      const h = body.current ? noteHeadings(body.current)[i] : undefined
      if (!h) return
      h.tabIndex = -1
      h.scrollIntoView?.({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
      h.focus({ preventScroll: true })
    })
  }

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

  // On a phone the empty line would be a row of chrome; the project menu offers "Add a note" instead.
  if (!note.trim() && phone) return null
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
      <div className="notes-frame" data-outline={heads.length >= OUTLINE_MIN ? 'menu' : undefined}>
        {heads.length >= OUTLINE_MIN && <Suspense fallback={null}><OutlineButton items={heads} current={-1} onGo={goTo} open={outlineOpen} onOpenChange={setOutlineOpen} /></Suspense>}
        <div ref={body} className={`overflow-hidden text-body ${heads.length >= OUTLINE_MIN ? 'pe-9' : ''} ${editable ? 'cursor-text rounded-control hover:bg-sunken dark:hover:bg-raised' : ''}`}
          style={clipped ? { maxHeight: FOLD_PX } : undefined}
          {...(editable ? {
            role: 'button', tabIndex: 0, 'aria-label': t('Edit the project note ({keys})', { keys: keysOf('project.note') }),
            onClick: (e: React.MouseEvent) => { if (!(e.target as HTMLElement).closest('a')) setEditing(true) },
            onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); setEditing(true) } },
          } : {})}>
          <Markdown source={note} />
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
