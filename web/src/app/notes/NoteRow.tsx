// One row of the Notes page (OpenSpec change notes-space, design D5): one line on a
// row grid of fixed tracks: the kind icon, the title (while searching, the snippet
// after it with its matched words highlighted, as text), where the note lives, its
// labels and the relative time of the last change, right-aligned. The row is its own
// size container: under 40 rem the labels leave and the place narrows. At least 48 px
// tall on phones; a standalone note's menu holds Pin, Turn into task and Delete (no
// swipe actions), and a long press opens it.
import type { ReactNode } from 'react'
import type { SnippetSegment } from '../../lib/noteSearch'
import type { NoteEntry } from '../../lib/noteList'
import type { Label, Project } from '../../lib/types'
import { Icon, LabelChips, Menu, MenuGroup, MenuItem, type IconName } from '../../ui'
import { t } from '../../lib/i18n'

export const SOURCE_ICON: Record<NoteEntry['source'], IconName> = { note: 'notebook-pen', task: 'circle-check-big', project: 'folder' }
const SOURCE_NAME: Record<NoteEntry['source'], () => string> = { note: () => t('Note'), task: () => t('Task note'), project: () => t('Project note') }

/** The snippet's segments, the matched ones in <mark>: text only, never HTML from the note. */
export function Snippet({ segments }: { segments: readonly SnippetSegment[] }) {
  return <>{segments.map((s, i) => (s.mark ? <mark key={i} className="rounded-chip bg-highlight px-0.5 text-on-highlight">{s.text}</mark> : <span key={i}>{s.text}</span>))}</>
}

export interface NoteRowProps {
  entry: NoteEntry
  /** While searching: the snippet after the title. */
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

/** The row grid (D5): icon, title, place, labels, time; the same tracks on every row, so the columns line up. */
// Narrow, the place is as wide as its name up to 5 rem (an empty one takes none), so the title keeps the room.
const GRID = 'grid grid-cols-[1.25rem_minmax(0,1fr)_auto_auto] gap-x-2 @min-[40rem]/note:grid-cols-[1.25rem_minmax(0,1fr)_10rem_8rem_5rem] @min-[40rem]/note:gap-x-3'

export function NoteRow({ entry, snippet, project, labels, updated, updatedTitle, current, cursor, onOpen, menu }: NoteRowProps) {
  const title = entry.title.trim() || (entry.source === 'note' ? t('Untitled note') : t('Untitled'))
  // Where the note lives: its project (a task's, or the project of a project note); a task without one is in the Inbox.
  const place = project ? project.name : entry.source === 'task' ? t('Inbox') : ''
  return (
    <li className={`group relative flex min-h-12 items-center gap-1 rounded-control @container/note md:min-h-(--size-row) ${current ? 'bg-selected-row' : cursor ? 'bg-sunken dark:bg-raised' : 'hover:bg-sunken dark:hover:bg-raised'}`}
      data-note-key={entry.key} data-note-source={entry.source} data-cursor={cursor || undefined}
      // A long press (a right click on a computer) opens the row's menu (notes-home D6).
      onContextMenu={menu ? (e) => {
        const trigger = e.currentTarget.querySelector<HTMLButtonElement>('[data-note-menu]')
        if (!trigger || (e.target as Element).closest('[data-note-menu]')) return
        e.preventDefault()
        trigger.click()
      } : undefined}>
      <button type="button" data-note-open onClick={onOpen} aria-current={current || undefined}
        className={`${GRID} min-w-0 flex-1 items-baseline rounded-control px-2 py-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus`}>
        <span className="flex h-5 w-5 items-center justify-center self-center text-muted"><Icon name={SOURCE_ICON[entry.source]} label={SOURCE_NAME[entry.source]()} /></span>
        <span className="flex min-w-0 items-baseline gap-2" data-note-line>
          <span className={`user-text min-w-0 truncate text-body ${snippet?.length ? 'max-w-[60%] shrink-0' : ''} ${entry.title.trim() ? 'text-default' : 'text-muted'}`} data-note-title>{title}</span>
          {entry.template && <span className="shrink-0 text-meta text-faint" data-note-template>{t('Template')}</span>}
          {entry.marker && <span className="shrink-0 text-meta text-faint" data-note-marker={entry.marker}>{entry.marker === 'completed' ? t('Completed') : t('Archived')}</span>}
          {snippet?.length ? <span className="user-text min-w-0 flex-1 truncate text-meta text-muted" data-note-snippet><Snippet segments={snippet} /></span> : null}
        </span>
        <span className="flex min-w-0 max-w-20 items-center justify-end gap-1 text-meta text-faint @min-[40rem]/note:max-w-none @min-[40rem]/note:justify-start" data-note-place>
          {project && <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: project.color }} />}
          <span className="truncate">{place}</span>
        </span>
        <span className="hidden min-w-0 overflow-hidden @min-[40rem]/note:flex" data-note-labels>{labels.length > 0 && <LabelChips labels={labels} />}</span>
        <time className="text-right text-meta whitespace-nowrap text-faint tabular-nums" aria-label={updatedTitle}
          dateTime={entry.updated ? new Date(entry.updated).toISOString() : undefined}>{updated}</time>
      </button>
      {/* Revealed on hover or focus with a mouse, always shown on touch (.hover-reveal). */}
      {/* The slot is kept on rows without a menu too, so every row's time lines up. */}
      {menu ? <div className="hover-reveal flex w-11 shrink-0 justify-end pr-1">{menu}</div> : <div aria-hidden className="w-11 shrink-0" />}
    </li>
  )
}

/**
 * A standalone note's menu (the row and the panel): Pin or Unpin (notes-home D4,
 * personal, so a viewer of a shared project has it too), then Turn into task and
 * Delete for a note the user may change.
 */
export function NoteMenu({ pinned, onPin, onConnections, onTurnIntoTask, onDelete, routines, onRunRoutine, offline, template, onTemplate, pinKey, label = t('Note actions') }: {
  pinned: boolean; onPin: () => void; onTurnIntoTask?: () => void; onDelete?: () => void
  /** Whether the note is a template, and Use as template / Stop using as template (note-templates); absent for a viewer. */
  template?: boolean
  onTemplate?: () => void
  /** The manual routines that run on a note (notes-in-routines): Run routine… lists them. */
  routines?: readonly { id: string; name: string }[]
  onRunRoutine?: (id: string) => void
  /** Running a routine needs a connection: the list says so. */
  offline?: boolean
  /** Show connections (notes-graph D3): passed while the note links with something. */
  onConnections?: () => void
  /** The list row's key for Pin (`p` on a focused row); the panel's menu has none. */
  pinKey?: string
  label?: string
}) {
  return (
    <Menu kind="menu" label={label} trigger={<Icon name="ellipsis" size="md" />} triggerClassName="ui-btn ui-btn--ghost ui-btn--sm touch-target px-2 py-1.5" width="sm:w-56"
      triggerProps={{ 'data-note-menu': '' }}>
      <MenuItem label={pinned ? t('Unpin') : t('Pin')} icon={pinned ? 'pin-off' : 'pin'} shortcut={pinKey} onSelect={onPin} data-note-pin={pinned ? 'unpin' : 'pin'} />
      {onConnections && <MenuItem label={t('Show connections')} icon="waypoints" onSelect={onConnections} data-show-connections />}
      {onTemplate && <MenuItem label={template ? t('Stop using as template') : t('Use as template')} icon="copy" onSelect={onTemplate} data-note-template-toggle={template ? 'off' : 'on'} />}
      {onTurnIntoTask && <MenuItem label={t('Turn into task')} icon="circle-check-big" description={t('The note goes to the Trash; Undo brings it back')} onSelect={onTurnIntoTask} data-note-to-task />}
      {onRunRoutine && !!routines?.length && (
        <MenuGroup label={t('Run routine…')}>
          {offline
            ? <MenuItem label={t('Running a routine needs a connection.')} disabled onSelect={() => {}} data-note-run-offline />
            : routines.map((r) => <MenuItem key={r.id} label={r.name || t('Untitled routine')} icon="zap" onSelect={() => onRunRoutine(r.id)} data-note-run-routine={r.id} />)}
        </MenuGroup>
      )}
      {onDelete && <MenuItem label={t('Delete')} icon="trash-2" danger onSelect={onDelete} data-note-delete />}
    </Menu>
  )
}
