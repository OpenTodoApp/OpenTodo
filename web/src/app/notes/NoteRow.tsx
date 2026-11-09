// One row of the Notes page (OpenSpec change notes-overview, design D7): the
// source icon; on the first line the title with the project, the labels and the
// relative time of the last change at its end; on the second a one-line preview
// (or, while searching, the snippet with its matched words highlighted, as text).
// At least 48 px tall on phones; a standalone note's menu holds Pin, Turn into
// task and Delete (no swipe actions), and a long press opens it.
import type { ReactNode } from 'react'
import { stripMarkdown, type SnippetSegment } from '../../lib/noteSearch'
import type { NoteEntry } from '../../lib/noteList'
import type { Label, Project } from '../../lib/types'
import { Icon, Menu, MenuItem, type IconName } from '../../ui'
import { t } from '../../lib/i18n'

export const SOURCE_ICON: Record<NoteEntry['source'], IconName> = { note: 'notebook-pen', task: 'circle-check-big', project: 'folder' }
const SOURCE_NAME: Record<NoteEntry['source'], () => string> = { note: () => t('Note'), task: () => t('Task note'), project: () => t('Project note') }

/** How many characters of a preview a row keeps: more than a line of the widest list shows. */
export const PREVIEW_MAX = 300

/** The first line of the note's text, without Markdown syntax, cut to PREVIEW_MAX characters. */
export function previewOf(text: string): string {
  for (const line of stripMarkdown(text).split('\n')) {
    const s = line.trim()
    if (s) return cut(s, PREVIEW_MAX)
  }
  return ''
}

/** s cut to at most max code points. */
function cut(s: string, max: number): string {
  if (s.length <= max) return s
  // 2 * max code units hold at least max code points.
  const head = [...s.slice(0, 2 * max)]
  return head.length <= max && s.length <= 2 * max ? s : head.slice(0, max).join('')
}

/**
 * Each entry's preview, worked out once: every row of the page drew the whole
 * note again on each keystroke of a search (a 10 KB note stripped of its Markdown,
 * then laid out on one line), though a search row shows its snippet instead.
 */
const previews = new WeakMap<NoteEntry, string>()
function previewOfEntry(entry: NoteEntry): string {
  let p = previews.get(entry)
  if (p === undefined) previews.set(entry, (p = previewOf(entry.text)))
  return p
}

/** The snippet's segments, the matched ones in <mark>: text only, never HTML from the note. */
export function Snippet({ segments }: { segments: readonly SnippetSegment[] }) {
  return <>{segments.map((s, i) => (s.mark ? <mark key={i} className="rounded-chip bg-highlight px-0.5 text-on-highlight">{s.text}</mark> : <span key={i}>{s.text}</span>))}</>
}

export interface NoteRowProps {
  entry: NoteEntry
  /** While searching: the snippet in place of the preview. */
  snippet?: readonly SnippetSegment[]
  project?: Pick<Project, 'name' | 'color'>
  labels: readonly Pick<Label, 'id' | 'name' | 'color'>[]
  /** "5 min ago", from the page's relative-time helper. */
  updated: string
  /** The absolute time, for the tooltip and assistive technology. */
  updatedTitle?: string
  /** The note open in the panel. */
  current?: boolean
  /** Under the list cursor while the search field holds text (notes-home D3): Enter opens it. */
  cursor?: boolean
  onOpen: () => void
  /** A standalone note the user may change: its menu. */
  menu?: ReactNode
}

export function NoteRow({ entry, snippet, project, labels, updated, current, cursor, onOpen, menu }: NoteRowProps) {
  const title = entry.title.trim() || (entry.source === 'note' ? t('Untitled note') : t('Untitled'))
  const preview = snippet?.length ? '' : previewOfEntry(entry)
  return (
    <li className={`group relative flex min-h-12 items-start gap-1 rounded-control md:min-h-(--size-row) ${current ? 'bg-selected-row' : cursor ? 'bg-sunken dark:bg-raised' : 'hover:bg-sunken dark:hover:bg-raised'}`}
      data-note-key={entry.key} data-note-source={entry.source} data-cursor={cursor || undefined}
      // A long press (a right click on a computer) opens the row's menu (notes-home D6).
      onContextMenu={menu ? (e) => {
        const trigger = e.currentTarget.querySelector<HTMLButtonElement>('[data-note-menu]')
        if (!trigger || (e.target as Element).closest('[data-note-menu]')) return
        e.preventDefault()
        trigger.click()
      } : undefined}>
      <button type="button" data-note-open onClick={onOpen} aria-current={current || undefined}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-control px-2 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-muted"><Icon name={SOURCE_ICON[entry.source]} label={SOURCE_NAME[entry.source]()} /></span>
        <span className="min-w-0 flex-1">
          {/* Line 1: the title, then (right-aligned, faint) the project, labels and when it changed; line 2: the text. */}
          <span className="flex min-w-0 items-baseline gap-3">
            <span className={`user-text min-w-[40%] flex-1 truncate text-body ${entry.title.trim() ? 'text-default' : 'text-muted'}`} data-note-title>{title}</span>
            <span className="flex min-w-0 shrink items-center justify-end gap-x-2 text-meta whitespace-nowrap text-faint" data-note-meta>
              {project && entry.source !== 'project' && (
                <span className="inline-flex min-w-0 items-center gap-1"><span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: project.color }} /><span className="max-w-40 truncate">{project.name}</span></span>
              )}
              {labels.map((l) => (
                <span key={l.id} className="inline-flex min-w-0 items-center gap-1"><span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: l.color }} /><span className="truncate">{l.name}</span></span>
              ))}
              {entry.marker && <span className="shrink-0" data-note-marker={entry.marker}>{entry.marker === 'completed' ? t('Completed') : t('Archived')}</span>}
              <time className="shrink-0 tabular-nums" dateTime={entry.updated ? new Date(entry.updated).toISOString() : undefined}>{updated}</time>
            </span>
          </span>
          {(snippet?.length || preview) && (
            <span className="user-text block truncate text-meta text-muted" data-note-preview>{snippet?.length ? <Snippet segments={snippet} /> : preview}</span>
          )}
        </span>
      </button>
      {/* Revealed on hover or focus with a mouse, always shown on touch (.hover-reveal). */}
      {/* The slot is kept on rows without a menu too, so every row's time lines up. */}
      {menu ? <div className="hover-reveal flex w-11 shrink-0 justify-end self-center pr-1">{menu}</div> : <div aria-hidden className="w-11 shrink-0" />}
    </li>
  )
}

/**
 * A standalone note's menu (the row and the panel): Pin or Unpin (notes-home D4,
 * personal, so a viewer of a shared project has it too), then Turn into task and
 * Delete for a note the user may change.
 */
export function NoteMenu({ pinned, onPin, onTurnIntoTask, onDelete, pinKey, label = t('Note actions') }: {
  pinned: boolean; onPin: () => void; onTurnIntoTask?: () => void; onDelete?: () => void
  /** The list row's key for Pin (`p` on a focused row); the panel's menu has none. */
  pinKey?: string
  label?: string
}) {
  return (
    <Menu kind="menu" label={label} trigger={<Icon name="ellipsis" size="md" />} triggerClassName="ui-btn ui-btn--ghost ui-btn--sm touch-target px-2 py-1.5" width="sm:w-56"
      triggerProps={{ 'data-note-menu': '' }}>
      <MenuItem label={pinned ? t('Unpin') : t('Pin')} icon={pinned ? 'pin-off' : 'pin'} shortcut={pinKey} onSelect={onPin} data-note-pin={pinned ? 'unpin' : 'pin'} />
      {onTurnIntoTask && <MenuItem label={t('Turn into task')} icon="circle-check-big" description={t('The note goes to the Trash; Undo brings it back')} onSelect={onTurnIntoTask} data-note-to-task />}
      {onDelete && <MenuItem label={t('Delete')} icon="trash-2" danger onSelect={onDelete} data-note-delete />}
    </Menu>
  )
}
