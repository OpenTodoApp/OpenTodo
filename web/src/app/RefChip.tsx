// An internal link as it reads in rendered Markdown and in the editor (OpenSpec
// change note-links, D2, D4, D7). Lazy chunk: Markdown loads it on its first
// internal link, the editor's link node with the editor.
import type { MouseEvent, ReactNode } from 'react'
import { t } from '../lib/i18n'
import { useRefTarget } from '../lib/refTarget'
import { Icon, type IconName } from '../ui'
import { openTaskPanel } from './panel'
import { navigate } from './router'

type RefKind = 'task' | 'note' | 'project'

/** Opens the target of an internal link in place (note-links D7): a task's panel or page, a project, a note. */
export function openRef(kind: RefKind, id: string): void {
  if (kind === 'task') openTaskPanel(id)
  else navigate(kind === 'note' ? { view: 'notes', id } : { view: 'project', id })
}

const REF_ICON: Record<RefKind, IconName> = { note: 'notebook-pen', task: 'circle-check-big', project: 'folder' }

/**
 * An internal link as it reads everywhere (note-links D2): the item's icon and
 * title; muted, not a link, when `title` is null (D4). `onOpen` opens it in place.
 */
export function RefChip({ kind, id, title, label, done, onOpen, tabIndex }: { kind: RefKind; id: string; title: ReactNode | null; label: ReactNode; done?: boolean; onOpen?: (e: MouseEvent) => void; tabIndex?: number }) {
  if (title === null) return <span className="note-ref" data-ref={kind} data-ref-state="muted"><Icon name={REF_ICON[kind]} size="xs" />{label}</span>
  return (
    <a href={`?${kind}=${id}`} className="note-ref" data-ref={kind} data-ref-state={done ? 'done' : 'live'} tabIndex={tabIndex}
      onClick={onOpen ?? ((e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); openRef(kind, id) })}>
      <Icon name={REF_ICON[kind]} size="xs" label={done ? t('Done') : undefined} />{title}
    </a>
  )
}

/** A link to a task, note or project, read from the device's rows. */
export default function RefLink({ kind, id, children }: { kind: RefKind; id: string; children: ReactNode }) {
  const live = useRefTarget(kind, id)
  return <RefChip kind={kind} id={id} title={live === undefined ? children : live?.title ?? null} done={live?.done} label={children} />
}

