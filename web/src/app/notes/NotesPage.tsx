// The Notes page (OpenSpec change notes-overview, design D3, D4 and D7): every task
// note, project note and standalone note of the workspace, from local data only,
// newest change first, 50 at a time with Show more. One row under the tool head:
// the search field, then Source, Project and Label (behind one Filters button on a
// phone). Search runs on the device over the decrypted text of the filtered list.
// Keys: `q` new note and `/` the search (registry entries notes.new, notes.search),
// `j`/`k` (or the arrows) move between rows and Enter opens, Escape in the search
// returns to the list. A lazy route chunk: the shell loads it on first visit.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { encryptionSnapshot, onEncryptionChange } from '../../lib/e2ee'
import { currentLanguage } from '../../lib/i18n/catalog'
import { useLabels, useMembershipMap, useProjects } from '../../lib/localData'
import { useLiveTasks, NO_TASKS } from '../../lib/liveTasks'
import { filterEntries, NO_NOTE_FILTERS, NOTES_PAGE, NoteIndex, noteEntries, type NoteEntry, type NoteFilters } from '../../lib/noteList'
import { createNote } from '../../lib/noteOps'
import { useNoteRows } from '../../lib/noteRows'
import type { SnippetSegment } from '../../lib/noteSearch'
import { readString, writeString } from '../../lib/deviceStorage'
import { canEditTasks, roleOf } from '../../lib/sharing'
import { keysOf } from '../../lib/shortcuts'
import { Button, DESKTOP_HEADER_QUERY, EmptyState, Icon, PageBody, PageHeader, useMediaQuery } from '../../ui'
import { t } from '../../lib/i18n'
import { act } from '../actionError'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import { closePanel, openPanel, panelOccupant, SPLIT_QUERY } from '../panel'
import { navigate } from '../router'
import { useShortcutScope } from '../shortcuts'
import { relativeLabel } from '../task-detail/RelativeTime'
import { NoteFiltersSheet, NoteFilterControls } from './NoteFilters'
import { NotePage, NotePanel } from './NoteEditor'
import { deleteNote, turnNoteIntoTask } from './noteActions'
import { NoteMenu, NoteRow } from './NoteRow'
import { openNote } from './openNote'

/** The page's filters on this device (never synced). */
export const NOTE_FILTERS_KEY = 'opentodo.notes.filters'

export function readNoteFilters(): NoteFilters {
  try {
    const v = JSON.parse(readString(NOTE_FILTERS_KEY) ?? 'null') as Partial<NoteFilters> | null
    if (!v || typeof v !== 'object') return NO_NOTE_FILTERS
    const source = (['all', 'task', 'project', 'note'] as const).find((s) => s === v.source) ?? 'all'
    return { source, projectId: typeof v.projectId === 'string' ? v.projectId : null, labelId: typeof v.labelId === 'string' ? v.labelId : null }
  } catch {
    return NO_NOTE_FILTERS
  }
}

const PANEL_KEY = 'note:'

/** Opens the standalone note `id` in the shell's panel slot; null closes a note the page put there. */
function useDockedNote(id: string | null) {
  useEffect(() => {
    if (!id) {
      if (panelOccupant()?.kind === 'custom' && (panelOccupant() as { key: string }).key.startsWith(PANEL_KEY)) closePanel()
      return
    }
    openPanel(`${PANEL_KEY}${id}`, () => <NotePanel key={id} id={id} />)
  }, [id])
  useEffect(() => () => {
    const o = panelOccupant()
    if (o?.kind === 'custom' && o.key.startsWith(PANEL_KEY)) closePanel()
  }, [])
}

/** The empty page: one sentence and New note (task-list-presentation "Empty views"). */
export function NotesEmpty({ onNew }: { onNew: () => void }) {
  return (
    <div data-empty-state="notes">
      <EmptyState title={t('Notes you write, and the notes of your tasks and projects, are listed here.')}
        action={{ label: t('New note'), onClick: onNew, shortcut: keysOf('notes.new') }} />
    </div>
  )
}

interface Row { entry: NoteEntry; snippet?: SnippetSegment[] }

export function NotesPage({ id }: { id?: string }) {
  const tasks = useLiveTasks() ?? NO_TASKS
  const projects = useProjects()
  const labels = useLabels()
  const notes = useNoteRows()
  const memberships = useMembershipMap()
  const dt = useDateTimeFormat()
  const desktop = useMediaQuery(DESKTOP_HEADER_QUERY)
  const docks = useMediaQuery(SPLIT_QUERY)
  const [filters, setFilters] = useState(readNoteFilters)
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(NOTES_PAGE)
  const search = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const index = useRef<NoteIndex | null>(null)

  // On a computer the note is docked beside the list; on a phone it is the page.
  const phonePage = !!id && !docks
  useDockedNote(id && docks ? id : null)

  const entries = useMemo(() => noteEntries(tasks, projects, notes), [tasks, projects, notes])
  const filtered = useMemo(() => filterEntries(entries, filters), [entries, filters])
  // The search index is built on the first search and forgets notes no longer listed.
  useEffect(() => { index.current?.prune(entries) }, [entries])
  // Dropped when the account locks (D4).
  useEffect(() => onEncryptionChange(() => { const s = encryptionSnapshot(); if (s.enabled && !s.unlocked) index.current?.clear() }), [])
  const rows = useMemo<Row[]>(() => {
    if (!query.trim()) return filtered.map((entry) => ({ entry }))
    index.current ??= new NoteIndex(currentLanguage())
    return index.current.search(filtered, query).map((r) => ({ entry: r.note, snippet: r.snippet }))
  }, [filtered, query])
  const shown = rows.slice(0, limit)

  const changeFilters = (next: NoteFilters) => {
    setFilters(next)
    setLimit(NOTES_PAGE)
    writeString(NOTE_FILTERS_KEY, JSON.stringify(next)) // storage refused: the filters hold for this visit
  }

  // A new note takes the project and label the list is filtered by.
  const startNote = async () => {
    const project = filters.projectId && canEditTasks(roleOf(filters.projectId, memberships)) ? filters.projectId : null
    const created = await createNote({ project_id: project, labels: filters.labelId ? [filters.labelId] : [] })
    navigate({ view: 'notes', id: created })
  }
  const newNote = () => act(startNote())
  // /notes?new=1 (the palette's New note): create one, open it, drop the parameter.
  useEffect(() => {
    if (new URLSearchParams(location.search).get('new') !== '1') return
    history.replaceState(history.state, '', '/notes')
    newNote()
  })

  useShortcutScope('view', {
    'notes.new': () => newNote(),
    'notes.search': () => { search.current?.focus() },
  }, { view: 'notes', enabled: !phonePage })

  if (phonePage) return <NotePage id={id} />

  const projectById = new Map(projects.map((p) => [p.id, p]))
  const labelById = new Map(labels.map((l) => [l.id, l]))
  const now = Date.now()
  const rowsOf = () => [...(list.current?.querySelectorAll<HTMLButtonElement>('[data-note-open]') ?? [])]
  const focusRow = (i: number) => rowsOf()[i]?.focus()
  const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    const all = rowsOf()
    const at = all.indexOf(document.activeElement as HTMLButtonElement)
    if (at < 0) return
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); all[at].click(); return }
    const step = e.key === 'j' || e.key === 'ArrowDown' ? 1 : e.key === 'k' || e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    e.stopPropagation()
    all[Math.max(0, Math.min(all.length - 1, at + step))]?.focus()
  }

  const searchField = (
    <div className="relative min-w-0 flex-[1_1_14rem]">
      <Icon name="search" className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
      <input ref={search} type="search" className="ui-input w-full pl-8" aria-label={t('Search notes')} placeholder={t('Search notes')}
        aria-keyshortcuts={keysOf('notes.search')} value={query} data-note-search
        onChange={(e) => { setQuery(e.target.value); setLimit(NOTES_PAGE) }}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return
          // Escape returns to the list (the open note's row, else the first).
          e.preventDefault()
          e.stopPropagation()
          const all = rowsOf()
          const current = all.findIndex((b) => b.getAttribute('aria-current') === 'true')
          if (all.length) focusRow(Math.max(0, current))
          else e.currentTarget.blur()
        }} />
    </div>
  )
  const filterProps = { filters, onChange: changeFilters, projects, labels }

  return (
    <PageBody width="list" data-page="notes">
      <PageHeader title={t('Notes')} help="notes" barActions
        meta={t('{n, plural, one {# note} other {# notes}}', { n: entries.length })}
        actions={<Button size="sm" variant={desktop ? 'ghost' : 'primary'} onClick={newNote} data-note-new><Icon name="plus" />{t('New note')}</Button>}>
        {searchField}
        {desktop ? <NoteFilterControls {...filterProps} /> : <NoteFiltersSheet {...filterProps} />}
      </PageHeader>
      {entries.length === 0 ? <NotesEmpty onNew={newNote} /> : rows.length === 0 ? (
        <p className="py-6 text-body text-muted" role="status" data-notes-none>{query.trim() ? t('No note matches your search.') : t('No note matches these filters.')}</p>
      ) : (
        <>
          <ul ref={list} className="space-y-0.5" aria-label={t('Notes')} onKeyDown={onListKey} data-notes-list>
            {shown.map(({ entry, snippet }) => {
              const editable = entry.source === 'note' && canEditTasks(roleOf(entry.projectId, memberships))
              return (
                <NoteRow key={entry.key} entry={entry} snippet={snippet} current={entry.source === 'note' && entry.id === id}
                  project={entry.projectId ? projectById.get(entry.projectId) : undefined}
                  labels={entry.labels.map((l) => labelById.get(l)).filter((l) => !!l && !l.deleted_at) as NonNullable<ReturnType<typeof labelById.get>>[]}
                  updated={entry.updated ? relativeLabel(entry.updated, now, (ms) => dt.formatInstant(ms, 'date')) : ''}
                  updatedTitle={entry.updated ? dt.formatInstant(entry.updated, 'datetime') : undefined}
                  onOpen={() => openNote(entry)}
                  menu={editable ? <NoteMenu onTurnIntoTask={() => void turnNoteIntoTask(entry.id)} onDelete={() => void deleteNote(entry.id)} /> : undefined} />
              )
            })}
          </ul>
          {rows.length > shown.length && (
            <div className="mt-3 flex items-center gap-3">
              <Button size="sm" variant="ghost" onClick={() => setLimit((n) => n + NOTES_PAGE)} data-notes-more>{t('Show more')}</Button>
              <span className="text-meta text-muted" data-notes-count>{t('{shown} of {total}', { shown: shown.length, total: rows.length })}</span>
            </div>
          )}
        </>
      )}
    </PageBody>
  )
}

export default NotesPage
