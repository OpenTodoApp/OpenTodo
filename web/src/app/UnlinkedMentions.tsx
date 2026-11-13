// Unlinked mentions (OpenSpec change unlinked-mentions, D1 to D4): below Linked
// references, one folded line with the count of the notes that name the item without
// linking to it; expanded, their rows with the line around the mention, 50 at a time,
// each with Link for a source the user may edit. Hidden at 0. Matched in idle time after
// Linked references paint, on the device, over the local decrypted rows; nothing is sent.
// Part of the Linked references chunk.
import { useEffect, useId, useState } from 'react'
import { readString, writeString } from '../lib/deviceStorage'
import { currentLanguage } from '../lib/i18n/catalog'
import { t } from '../lib/i18n'
import { useMembershipMap } from '../lib/localData'
import { findMentions, type Mention } from '../lib/noteMentions'
import { linkMention } from '../lib/noteMentionLink'
import { linkRows, projectName, resolve, useLinkIndex, type LinkKind } from '../lib/noteLinks'
import { canEditProjectNote, canEditTasks, roleOf } from '../lib/sharing'
import { Button, Icon } from '../ui'
import { act } from './actionError'
import { showUndoToast } from './bulk/toastStore'
import { LINK_ICON } from './LinkOption'
import { openNote } from './notes/openNote'

/** The per-device open state of the Unlinked mentions line. */
export const MENTIONS_OPEN_KEY = 'opentodo.unlinkedMentions.open'
/** Marked in the performance timeline when the line is painted (after the note-references metric's mark). */
export const MENTIONS_MARK = 'ot:note-mentions'
/** Rows shown at first, and added by Show more. */
const PAGE = 50

/** The mentions of `kind:id`, worked out after paint and again when a note changes; null until the first pass. */
export function useMentions(kind: LinkKind, id: string): Mention[] | null {
  const live = useLinkIndex()
  const [mentions, setMentions] = useState<Mention[] | null>(null)
  const version = live?.version
  useEffect(() => {
    if (!live) return
    // After Linked references are painted (their mark is set a frame after paint), in idle time (D1).
    const later = (fn: () => void) => {
      if (typeof requestIdleCallback === 'function') { const h = requestIdleCallback(fn, { timeout: 1000 }); return () => cancelIdleCallback(h) }
      let t = 0
      const f = requestAnimationFrame(() => { t = window.setTimeout(fn, 50) })
      return () => { cancelAnimationFrame(f); clearTimeout(t) }
    }
    return later(() => {
      const rows = linkRows()
      const target = resolve(kind, id)
      if (!rows || !target) return setMentions([])
      const linking = new Set(live.index.references(kind, id).map((r) => `${r.kind}:${r.id}`))
      setMentions(findMentions({ kind, id, title: target.title, ...rows, linking, lang: currentLanguage() }))
    })
  }, [kind, id, version]) // eslint-disable-line react-hooks/exhaustive-deps -- the index's version stands for every row it reads
  return mentions
}

export default function UnlinkedMentions({ kind, id, folded = false }: { kind: LinkKind; id: string; folded?: boolean }) {
  const mentions = useMentions(kind, id)
  const memberships = useMembershipMap()
  const shown = !!mentions && mentions.length > 0
  useEffect(() => {
    if (!shown) return
    try {
      performance.clearMarks(MENTIONS_MARK)
      requestAnimationFrame(() => setTimeout(() => performance.mark(MENTIONS_MARK), 0))
    } catch {
      // No performance timeline: nothing to record.
    }
  }, [shown])
  if (!mentions || mentions.length === 0) return null
  const link = (m: Mention) => act((async () => {
    const target = resolve(kind, id)
    if (!target) return
    const undo = await linkMention({ kind: m.kind, id: m.id }, { kind, id, title: target.title })
    if (undo) showUndoToast(t('Linked {title}', { title: target.title }), undo)
  })())
  return <MentionsSection target={`${kind}:${id}`} mentions={mentions} folded={folded} project={(m) => (m.kind === 'project' ? null : projectName(m.projectId))}
    onLink={(m) => ((m.kind === 'project' ? canEditProjectNote(roleOf(m.id, memberships)) : canEditTasks(roleOf(m.projectId, memberships))) ? () => link(m) : undefined)} />
}

/** The section itself (stories render it with sample rows): the folded line, then 50 rows at a time. */
export function MentionsSection({ target, mentions, folded, project, onLink, open: openAtFirst }: {
  target: string; mentions: readonly Mention[]; folded: boolean; project: (m: Mention) => string | null
  /** Link for a source the user may edit, else undefined. */
  onLink: (m: Mention) => (() => void) | undefined
  /** Open at first (stories); else this device's choice. */
  open?: boolean
}) {
  const [open, setOpen] = useState(() => openAtFirst ?? readString(MENTIONS_OPEN_KEY) === '1')
  const [limit, setLimit] = useState(PAGE)
  const listId = useId()
  return (
    <section aria-label={t('Unlinked mentions')} className="linked-refs linked-refs--mentions" data-unlinked-mentions={target} data-folded={folded || undefined}>
      <button type="button" className="linked-refs__head linked-refs__toggle" aria-expanded={open} aria-controls={listId}
        onClick={() => { setOpen(!open); writeString(MENTIONS_OPEN_KEY, open ? '0' : '1') }}>
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size="xs" />{t('Unlinked mentions')}<span className="text-faint tabular-nums">{mentions.length}</span>
      </button>
      {open && (
        <>
          <ul id={listId} className="space-y-0.5">
            {mentions.slice(0, limit).map((m) => <MentionRow key={`${m.kind}:${m.id}`} m={m} project={project(m)} onLink={onLink(m)} />)}
          </ul>
          {mentions.length > limit && <Button size="sm" variant="ghost" onClick={() => setLimit((n) => n + PAGE)} data-mentions-more>{t('Show more')}</Button>}
        </>
      )}
    </section>
  )
}

/** One mention: the source's icon, title and project and its line, the title marked; Link beside it. */
export function MentionRow({ m, project, onLink }: { m: Mention; project: string | null; onLink?: () => void }) {
  return (
    <li className="group flex items-start gap-1" data-unlinked-mention={`${m.kind}:${m.id}`}>
      <a href={`?${m.kind}=${m.id}`} className="linked-ref min-w-0 flex-1"
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey) return
          e.preventDefault()
          openNote({ source: m.kind, id: m.id })
        }}>
        <span className="flex min-w-0 items-center gap-2">
          <Icon name={LINK_ICON[m.kind]} size="sm" className="shrink-0 text-muted" />
          <span className="user-text min-w-0 truncate text-body font-medium text-strong">{m.title || t('Untitled note')}</span>
          {project && <span className="user-text min-w-0 shrink truncate text-meta text-faint">{project}</span>}
        </span>
        <span className="user-text block truncate ps-6 text-meta text-muted">
          {m.snippet.map((s, i) => (s.mark ? <mark key={i} className="linked-ref__link">{s.text}</mark> : <span key={i}>{s.text}</span>))}
        </span>
      </a>
      {onLink && <Button size="sm" variant="ghost" className="mt-1 shrink-0" onClick={onLink} data-mention-link>{t('Link')}</Button>}
    </li>
  )
}
