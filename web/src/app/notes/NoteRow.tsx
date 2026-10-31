// One row of the Notes page (OpenSpec change notes-overview, design D7): the
// source icon, the title, a one-line preview (or, while searching, the snippet
// with its matched words highlighted, as text), then the project, the labels and
// the relative time of the last change. At least 48 px tall on phones; a
// standalone note's menu holds Turn into task and Delete (no swipe actions).
import type { ReactNode } from 'react'
import { stripMarkdown, type SnippetSegment } from '../../lib/noteSearch'
import type { NoteEntry } from '../../lib/noteList'
import type { Label, Project } from '../../lib/types'
import { Icon, Menu, MenuItem, type IconName } from '../../ui'
import { t } from '../../lib/i18n'

export const SOURCE_ICON: Record<NoteEntry['source'], IconName> = { note: 'notebook-pen', task: 'circle-check-big', project: 'folder' }
const SOURCE_NAME: Record<NoteEntry['source'], () => string> = { note: () => t('Note'), task: () => t('Task note'), project: () => t('Project note') }

/** The first line of the note's text, without Markdown syntax. */
export function previewOf(text: string): string {
  for (const line of stripMarkdown(text).split('\n')) {
    const s = line.trim()
    if (s) return s
  }
  return ''
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
  onOpen: () => void
  /** A standalone note the user may change: its menu. */
  menu?: ReactNode
}

export function NoteRow({ entry, snippet, project, labels, updated, current, onOpen, menu }: NoteRowProps) {
  const title = entry.title.trim() || (entry.source === 'note' ? t('Untitled note') : t('Untitled'))
  const preview = previewOf(entry.text)
  return (
    <li className={`group relative flex min-h-12 items-start gap-1 rounded-control md:min-h-(--size-row) ${current ? 'bg-selected-row' : 'hover:bg-sunken dark:hover:bg-raised'}`}
      data-note-key={entry.key} data-note-source={entry.source}>
      <button type="button" data-note-open onClick={onOpen} aria-current={current || undefined}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-control px-2 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-muted"><Icon name={SOURCE_ICON[entry.source]} label={SOURCE_NAME[entry.source]()} /></span>
        <span className="min-w-0 flex-1">
          <span className={`user-text block truncate text-body ${entry.title.trim() ? 'text-default' : 'text-muted'}`} data-note-title>{title}</span>
          {(snippet?.length || preview) && (
            <span className="user-text block truncate text-meta text-muted" data-note-preview>{snippet?.length ? <Snippet segments={snippet} /> : preview}</span>
          )}
          <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-meta text-faint" data-note-meta>
            {project && entry.source !== 'project' && (
              <span className="inline-flex min-w-0 items-center gap-1"><span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: project.color }} /><span className="truncate">{project.name}</span></span>
            )}
            {labels.map((l) => (
              <span key={l.id} className="inline-flex items-center gap-1"><span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: l.color }} />{l.name}</span>
            ))}
            {entry.marker && <span data-note-marker={entry.marker}>{entry.marker === 'completed' ? t('Completed') : t('Archived')}</span>}
            <time dateTime={entry.updated ? new Date(entry.updated).toISOString() : undefined}>{updated}</time>
          </span>
        </span>
      </button>
      {menu && <div className="shrink-0 self-center pr-1">{menu}</div>}
    </li>
  )
}

/** A standalone note's menu (the row and the panel): Turn into task, Delete. */
export function NoteMenu({ onTurnIntoTask, onDelete, label = t('Note actions') }: { onTurnIntoTask: () => void; onDelete: () => void; label?: string }) {
  return (
    <Menu kind="menu" label={label} trigger={<Icon name="ellipsis" size="md" />} triggerClassName="ui-btn ui-btn--ghost ui-btn--sm touch-target px-2 py-1.5" width="sm:w-56">
      <MenuItem label={t('Turn into task')} icon="circle-check-big" description={t('The note goes to the Trash; Undo brings it back')} onSelect={onTurnIntoTask} data-note-to-task />
      <MenuItem label={t('Delete')} icon="trash-2" danger onSelect={onDelete} data-note-delete />
    </Menu>
  )
}
