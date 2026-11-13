// Linked references (OpenSpec change note-links, design D5): the task notes,
// project notes and standalone notes on this device that link to an item, most
// recently changed first, each with its icon, title, project and the line around
// the link with the link's text highlighted. At the end of a standalone note and
// below a task's notes; in a project's note area one folded line with the count,
// whose open state is a per-device preference. Hidden when nothing links here.
// Computed on the device (lib/noteLinks): offline, encrypted accounts included,
// nothing sent. Lazy chunk (linkedRefsLazy.tsx).
import { useEffect, useId, useState, type ReactNode } from 'react'
import { readString, writeString } from '../lib/deviceStorage'
import { t } from '../lib/i18n'
import { connectedNow, projectName, useReferences, watchLinks, type LinkKind, type Reference } from '../lib/noteLinks'
import { Icon } from '../ui'
import { CONNECTIONS_ICON, LINK_ICON } from './LinkOption'
import { openNote } from './notes/openNote'
import { openConnections } from './signals'
import UnlinkedMentions from './UnlinkedMentions'

/** The per-device open state of the folded line in a project's note area. */
export const REFERENCES_OPEN_KEY = 'opentodo.linkedReferences.open'
/** Marked in the performance timeline when the section is painted (nightly metric note-references). */
export const REFERENCES_MARK = 'ot:note-references'

/** Whether an item has connections (notes-graph D3), live; the menus' Show connections reads it through signals.ts. */
export function watchConnected(kind: LinkKind, id: string, fn: (on: boolean) => void): () => void {
  const read = () => {
    const on = connectedNow(kind, id)
    // Offered: fetch the dialog's chunk now, so the first open paints at once (notes-graph D6).
    if (on) void import('./connections/ConnectionsDialog')
    fn(on)
  }
  const stop = watchLinks(read)
  read()
  return stop
}

/** One row: the item's icon, title and project, and the line around the link; opens the item (the Connections list reuses it). */
export function ReferenceRow({ r, project, onOpen, after }: { r: Reference; project: string | null; onOpen?: () => void; after?: ReactNode }) {
  return (
    <li className={after ? 'flex items-start gap-1' : undefined}>
      <a href={`?${r.kind}=${r.id}`} className={`linked-ref ${after ? 'min-w-0 flex-1' : ''}`} data-linked-ref={`${r.kind}:${r.id}`}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey) return
          e.preventDefault()
          onOpen?.()
          openNote({ source: r.kind, id: r.id })
        }}>
        <span className="flex min-w-0 items-center gap-2">
          <Icon name={LINK_ICON[r.kind]} size="sm" className="shrink-0 text-muted" />
          <span className="user-text min-w-0 truncate text-body font-medium text-strong">{r.title}</span>
          {project && <span className="user-text min-w-0 shrink truncate text-meta text-faint">{project}</span>}
        </span>
        {(r.snippet.before || r.snippet.after) && (
          <span className="user-text block truncate ps-6 text-meta text-muted">
            {r.snippet.before}<span className="linked-ref__link">{r.snippet.link}</span>{r.snippet.after}
          </span>
        )}
      </a>
      {after}
    </li>
  )
}

export default function LinkedReferences({ kind, id, folded = false }: { kind: LinkKind; id: string; folded?: boolean }) {
  const refs = useReferences(kind, id)
  const shown = !!refs && refs.length > 0
  useEffect(() => {
    if (!shown) return
    try {
      performance.clearMarks(REFERENCES_MARK)
      requestAnimationFrame(() => setTimeout(() => performance.mark(REFERENCES_MARK), 0))
    } catch {
      // No performance timeline: nothing to record.
    }
  }, [shown])
  return (
    <>
      {refs && refs.length > 0 && <ReferencesSection target={`${kind}:${id}`} refs={refs} folded={folded} project={(r) => (r.kind === 'project' ? null : projectName(r.projectId))}
        onGraph={() => openConnections(kind, id)} />}
      {/* The notes that name the item without linking it (unlinked-mentions), once the index is built. */}
      {refs && <UnlinkedMentions kind={kind} id={id} folded={folded} />}
    </>
  )
}

/** The section itself (stories render it with sample rows). */
export function ReferencesSection({ target, refs, folded, project, onGraph }: { target: string; refs: readonly Reference[]; folded: boolean; project: (r: Reference) => string | null; onGraph?: () => void }) {
  const [open, setOpen] = useState(() => !folded || readString(REFERENCES_OPEN_KEY) === '1')
  const listId = useId()
  const heading = (
    <>
      {t('Linked references')}<span className="text-faint tabular-nums">{refs.length}</span>
    </>
  )
  return (
    <section aria-label={t('Linked references')} className="linked-refs" data-linked-references={target} data-folded={folded || undefined}>
      <div className="flex items-center gap-1">
        {folded
          ? (
            <button type="button" className="linked-refs__head linked-refs__toggle" aria-expanded={open} aria-controls={listId}
              onClick={() => { setOpen(!open); writeString(REFERENCES_OPEN_KEY, open ? '0' : '1') }}>
              <Icon name={open ? 'chevron-down' : 'chevron-right'} size="xs" />{heading}
            </button>
          )
          : <h2 className="linked-refs__head">{heading}</h2>}
        {/* The item's Connections (notes-graph D3), inside the content's own heading. */}
        {onGraph && (
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm touch-target ms-auto px-1.5 text-muted" aria-label={t('Show connections')}
            onClick={onGraph} data-connections-open>
            <Icon name={CONNECTIONS_ICON} size="sm" />
          </button>
        )}
      </div>
      {open && <ul id={listId} className="space-y-0.5">{refs.map((r) => <ReferenceRow key={`${r.kind}:${r.id}`} r={r} project={project(r)} />)}</ul>}
    </section>
  )
}
