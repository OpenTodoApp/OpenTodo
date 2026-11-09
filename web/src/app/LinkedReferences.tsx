// Linked references (OpenSpec change note-links, design D5): the task notes,
// project notes and standalone notes on this device that link to an item, most
// recently changed first, each with its icon, title, project and the line around
// the link with the link's text highlighted. At the end of a standalone note and
// below a task's notes; in a project's note area one folded line with the count,
// whose open state is a per-device preference. Hidden when nothing links here.
// Computed on the device (lib/noteLinks): offline, encrypted accounts included,
// nothing sent. Lazy chunk (linkedRefsLazy.tsx).
import { useEffect, useId, useState } from 'react'
import { readString, writeString } from '../lib/deviceStorage'
import { t } from '../lib/i18n'
import { projectName, useReferences, type LinkKind, type Reference } from '../lib/noteLinks'
import { Icon } from '../ui'
import { LINK_ICON } from './LinkOption'
import { openNote } from './notes/openNote'

/** The per-device open state of the folded line in a project's note area. */
export const REFERENCES_OPEN_KEY = 'opentodo.linkedReferences.open'
/** Marked in the performance timeline when the section is painted (nightly metric note-references). */
export const REFERENCES_MARK = 'ot:note-references'

function Row({ r }: { r: Reference }) {
  const project = r.kind === 'project' ? null : projectName(r.projectId)
  return (
    <li>
      <a href={`?${r.kind}=${r.id}`} className="linked-ref" data-linked-ref={`${r.kind}:${r.id}`}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey) return
          e.preventDefault()
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
    </li>
  )
}

export default function LinkedReferences({ kind, id, folded = false }: { kind: LinkKind; id: string; folded?: boolean }) {
  const refs = useReferences(kind, id)
  const [open, setOpen] = useState(() => !folded || readString(REFERENCES_OPEN_KEY) === '1')
  const listId = useId()
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
  if (!refs || refs.length === 0) return null
  const heading = (
    <>
      {t('Linked references')}<span className="text-faint tabular-nums">{refs.length}</span>
    </>
  )
  return (
    <section aria-label={t('Linked references')} className="linked-refs" data-linked-references={`${kind}:${id}`} data-folded={folded || undefined}>
      {folded
        ? (
          <button type="button" className="linked-refs__head linked-refs__toggle" aria-expanded={open} aria-controls={listId}
            onClick={() => { setOpen(!open); writeString(REFERENCES_OPEN_KEY, open ? '0' : '1') }}>
            <Icon name={open ? 'chevron-down' : 'chevron-right'} size="xs" />{heading}
          </button>
        )
        : <h2 className="linked-refs__head">{heading}</h2>}
      {open && <ul id={listId} className="space-y-0.5">{refs.map((r) => <Row key={`${r.kind}:${r.id}`} r={r} />)}</ul>}
    </section>
  )
}
