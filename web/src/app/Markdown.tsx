// The app's Markdown renderer: MarkdownView plus what only the device knows
// (OpenSpec editor-everywhere D5, D6, note-links D2, D4): images from the task's
// attachments, and links to tasks, notes and projects that read as the item's
// current title (a done task struck through), or as muted text when the item is
// missing, in the Trash or out of reach.
import type { MouseEvent, ReactNode } from 'react'
import { useEmbeddedImage } from '../lib/embeds'
import { useRefTarget } from '../lib/localData'
import { t } from '../lib/i18n'
import { Icon, type IconName } from '../ui'
import { ImagePlaceholder, MarkdownView, type MarkdownEmbeds, type MarkdownProps } from './MarkdownView'
import { openRef, type RefKind } from './notes/openNote'

export type { MarkdownProps }

export function Markdown(props: MarkdownProps) {
  return <MarkdownView {...props} embeds={EMBEDS} />
}

const REF_ICON: Record<RefKind, IconName> = { note: 'notebook-pen', task: 'circle-check-big', project: 'folder' }

/**
 * An internal link as it reads everywhere (note-links D2): the item's icon and
 * title; muted, not a link, when `title` is null (D4). `onOpen` opens it in place.
 */
export function RefChip({ kind, id, title, label, done, onOpen }: { kind: RefKind; id: string; title: string | null; label: ReactNode; done?: boolean; onOpen?: (e: MouseEvent) => void }) {
  if (title === null) return <span className="note-ref" data-ref={kind} data-ref-state="muted"><Icon name={REF_ICON[kind]} size="xs" />{label}</span>
  return (
    <a href={`?${kind}=${id}`} className="note-ref" data-ref={kind} data-ref-state={done ? 'done' : 'live'}
      onClick={onOpen ?? ((e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); openRef(kind, id) })}>
      <Icon name={REF_ICON[kind]} size="xs" label={done ? t('Done') : undefined} />{title}
    </a>
  )
}

/** A link to a task, note or project, read from the device's rows. */
function RefLink({ kind, id, children }: { kind: RefKind; id: string; children: ReactNode }) {
  const live = useRefTarget(kind, id)
  return <RefChip kind={kind} id={id} title={live?.title ?? null} done={live?.done} label={children} />
}

/** An attachment of the task shown in place, or a placeholder naming its state. */
export function EmbeddedImage({ id, alt, taskId }: { id: string; alt: string; taskId: string | null }) {
  const s = useEmbeddedImage(id, taskId)
  if (s.kind === 'ready') return <img src={s.src} alt={alt} className="embedded-image max-h-96 max-w-full rounded-control" />
  const text = s.kind === 'removed' ? t('Removed image')
    : s.kind === 'locked' ? t('Encrypted image')
      : s.kind === 'uploading' ? t('{name}: uploading', { name: s.name })
        : s.kind === 'waiting' ? t('{name}: waiting to upload', { name: s.name }) : t('Loading image')
  return <ImagePlaceholder text={text} alt={alt} state={s.kind} locked={s.kind === 'locked'} />
}

const EMBEDS: MarkdownEmbeds = { Image: EmbeddedImage, RefLink }
