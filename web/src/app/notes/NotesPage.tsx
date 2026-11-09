// The Notes page (OpenSpec change notes-overview, design D3, D4 and D7): every task
// note, project note and standalone note of the workspace, from local data only,
// newest change first, 50 at a time with Show more. One row under the tool head:
// the search field, then Source, Project and Label (behind one Filters button on a
// phone). Search runs on the device over the decrypted text of the filtered list.
// Keys: `q` new note and `/` the search (registry entries notes.new, notes.search),
// `j`/`k` (or the arrows) move between rows and Enter opens, Escape in the search
// returns to the list. A lazy route chunk: the shell loads it on first visit.
// The home of notes (notes-home): with no search and no filter, pinned notes come
// first under Pinned, the others under Recent (D4); typed text offers New note
// "<text>" as the first row, under the cursor when no note matches (D3); Source
// gains Unlinked, read from the note-links index (D5); `p` pins the focused note.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { encryptionSnapshot, onEncryptionChange } from '../../lib/e2ee'
import { currentLanguage } from '../../lib/i18n/catalog'
import { isFavourite, pinnedNoteIds, setFavourite } from '../../lib/favourites'
import { useLabels, useMembershipMap, useProjects, useUserPrefsRow } from '../../lib/localData'
import { useLinkedTargets } from '../../lib/noteLinks'
import { useLiveTasks, NO_TASKS } from '../../lib/liveTasks'
import { filterEntries, homeGroups, isDefaultFilters, NO_NOTE_FILTERS, NOTES_PAGE, NoteIndex, noteEntries, sameEntries, type NoteEntry, type NoteFilters } from '../../lib/noteList'
import { createNote } from '../../lib/noteOps'
import { useNoteRows } from '../../lib/noteRows'
import type { SnippetSegment } from '../../lib/noteSearch'
import { readString, writeString } from '../../lib/deviceStorage'
import { canEditTasks, roleOf } from '../../lib/sharing'
import { keysOf } from '../../lib/shortcuts'
import { Button, DESKTOP_HEADER_QUERY, EmptyState, Icon, ListGroupHeader, PageBody, PageHeader, useMediaQuery } from '../../ui'
import { t } from '../../lib/i18n'
import { act } from '../actionError'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import { closePanel, openPanel, panelOccupant, SPLIT_QUERY } from '../panel'
import { navigate } from '../router'
import { useShortcutScope } from '../shortcuts'
import { relativeLabel } from '../task-detail/RelativeTime'
import { NoteFiltersSheet, NoteFilterControls } from './NoteFilters'
import { focusBodyOnOpen, NotePage, NotePanel } from './NoteEditor'
import { createNoteWithUndo, deleteNote, turnNoteIntoTask } from './noteActions'
import { NoteMenu, NoteRow } from './NoteRow'
import { openNote } from './openNote'
import { LIST_READY, perfMark, SEARCH_RESULTS } from '../../lib/perfMarks'

/** The page's filters on this device (never synced). */
export const NOTE_FILTERS_KEY = 'opentodo.notes.filters'

export function readNoteFilters(): NoteFilters {
  try {
    const v = JSON.parse(readString(NOTE_FILTERS_KEY) ?? 'null') as Partial<NoteFilters> | null
    if (!v || typeof v !== 'object') return NO_NOTE_FILTERS
    const source = (['all', 'task', 'project', 'note', 'unlinked'] as const).find((s) => s === v.source) ?? 'all'
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

/** The longest title a note takes (the title field's limit), in characters. */
const TITLE_MAX = 500

/** The New note "<text>" row while the search field holds text (notes-home D3). */
export function NewNoteRow({ text, cursor, onCreate }: { text: string; cursor: boolean; onCreate: () => void }) {
  return (
    <li className={`group relative flex min-h-12 items-center rounded-control md:min-h-(--size-row) ${cursor ? 'bg-sunken dark:bg-raised' : 'hover:bg-sunken dark:hover:bg-raised'}`}
      data-note-new-row data-cursor={cursor || undefined}>
      <button type="button" data-note-open data-note-create onClick={onCreate}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-control px-2 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-accent"><Icon name="notebook-pen" /></span>
        <span className="user-text min-w-0 flex-1 truncate text-body text-default">{t('New note "{title}"', { title: text })}</span>
      </button>
    </li>
  )
}

/** A quiet heading over Pinned or Recent, with the number of notes beneath it. */
export function GroupHeading({ title, count, testId }: { title: string; count: number; testId: string }) {
  return (
    <li data-notes-group={testId}>
      <ListGroupHeader title={title} count={count} bar={false} countLabel={(n) => t('{n, plural, one {# note} other {# notes}}', { n })} />
    </li>
  )
}

/** How long one slice of warming the index may run before the page gets the thread back (ms). */
const WARM_SLICE_MS = 8

/**
 * Runs `step` in short slices while it returns true; returns the cancel. Not in idle
 * periods: just after a first sync (the activity log written, every list catching up)
 * a phone had too few of them, and a search typed then prepared most of 2,500 notes
 * on its first keystroke (perf: notes-search). A slice of WARM_SLICE_MS leaves a
 * keystroke waiting at most that long.
 */
function warmSoon(step: () => boolean): () => void {
  let stopped = false
  let handle = 0
  const run = () => {
    if (stopped) return
    const until = performance.now() + WARM_SLICE_MS
    let more = step()
    while (more && performance.now() < until) more = step()
    if (more) handle = window.setTimeout(run, 0)
  }
  handle = window.setTimeout(run, 0)
  return () => {
    stopped = true
    clearTimeout(handle)
  }
}

/** The entries, kept as the same array while they show the same notes (sameEntries). */
function useStableEntries(next: NoteEntry[]): NoteEntry[] {
  const kept = useRef(next)
  if (!sameEntries(kept.current, next)) kept.current = next
  return kept.current
}

/** The page's measurement points (performance-10k D4): the list on screen, and the results of each search keystroke. */
function useNotesMarks(listed: boolean, query: string, rows: unknown) {
  useEffect(() => { if (listed) perfMark(LIST_READY, { view: 'notes' }) }, [listed])
  useEffect(() => { if (query.trim()) perfMark(SEARCH_RESULTS, { view: 'notes' }) }, [query, rows])
}

export function NotesPage({ id }: { id?: string }) {
  const tasks = useLiveTasks() ?? NO_TASKS
  const projects = useProjects()
  const labels = useLabels()
  const notes = useNoteRows()
  const prefs = useUserPrefsRow()
  const memberships = useMembershipMap()
  const dt = useDateTimeFormat()
  const desktop = useMediaQuery(DESKTOP_HEADER_QUERY)
  const docks = useMediaQuery(SPLIT_QUERY)
  const [filters, setFilters] = useState(readNoteFilters)
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(NOTES_PAGE)
  // The list cursor while the search field holds text: an index over the rows, New note first; null is the default (D3).
  const [cursor, setCursor] = useState<number | null>(null)
  const search = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const index = useRef<NoteIndex | null>(null)

  // On a computer the note is docked beside the list; on a phone it is the page.
  const phonePage = !!id && !docks
  useDockedNote(id && docks ? id : null)

  const entries = useStableEntries(useMemo(() => noteEntries(tasks, projects, notes), [tasks, projects, notes]))
  const linked = useLinkedTargets(filters.source === 'unlinked')
  const unlinkedPending = filters.source === 'unlinked' && !linked
  const filtered = useMemo(() => filterEntries(entries, filters, linked), [entries, filters, linked])
  const pinnedIds = useMemo(() => pinnedNoteIds(prefs?.favourites), [prefs?.favourites])
  // The search index is built in short slices once the page is open (or on the first
  // search, if that comes first) and forgets notes no longer listed.
  useEffect(() => { index.current?.prune(entries) }, [entries])
  useEffect(() => warmSoon(() => (index.current ??= new NoteIndex(currentLanguage())).warm(entries, 8)), [entries])
  // Dropped when the account locks (D4).
  useEffect(() => onEncryptionChange(() => { const s = encryptionSnapshot(); if (s.enabled && !s.unlocked) index.current?.clear() }), [])
  const rows = useMemo<Row[]>(() => {
    if (!query.trim()) return filtered.map((entry) => ({ entry }))
    index.current ??= new NoteIndex(currentLanguage())
    // Snippets for the rows shown (list-rendering-at-scale: one per hit took most of a keystroke).
    return index.current.search(filtered, query, undefined, limit).map((r) => ({ entry: r.note, snippet: r.snippet }))
  }, [filtered, query, limit])
  const typed = query.trim()
  // With no search and no filter: Pinned, then Recent (D4); without pins, one list as before.
  const groups = useMemo(() => (!typed && isDefaultFilters(filters) ? homeGroups(filtered, pinnedIds) : null), [typed, filters, filtered, pinnedIds])
  const pinnedRows: Row[] = useMemo(() => (groups ? groups.pinned.map((entry) => ({ entry })) : []), [groups])
  const grouped = pinnedRows.length > 0
  const recent: Row[] = useMemo(() => (groups && grouped ? groups.recent.map((entry) => ({ entry })) : rows), [groups, grouped, rows])
  const recentShown = recent.slice(0, limit)
  const shown = [...pinnedRows, ...recentShown]
  // The cursor starts on the first match, else on New note; the arrows in the field move it.
  const at = typed ? Math.min(cursor ?? (shown.length > 0 ? 1 : 0), shown.length) : -1
  useNotesMarks(entries.length > 0, query, rows)

  const changeFilters = (next: NoteFilters) => {
    setFilters(next)
    setCursor(null)
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
  // New note "<text>": titled with the text, in the Project filter's project (D3), one Undo, the caret in its body.
  const createFromSearch = async () => {
    const title = [...typed].slice(0, TITLE_MAX).join('')
    if (!title) return
    const project = filters.projectId && canEditTasks(roleOf(filters.projectId, memberships)) ? filters.projectId : null
    const created = await createNoteWithUndo({ title, project_id: project, labels: filters.labelId ? [filters.labelId] : [] })
    if (!created) return
    setQuery('')
    setCursor(null)
    focusBodyOnOpen(created)
    navigate({ view: 'notes', id: created })
  }
  const togglePin = (noteId: string) => act(setFavourite('note', noteId, !isFavourite(prefs, 'note', noteId)))
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
    if (e.key === 'p') {
      const key = all[at].closest('[data-note-key]')?.getAttribute('data-note-key') ?? ''
      if (!key.startsWith('note:')) return
      e.preventDefault()
      e.stopPropagation()
      togglePin(key.slice(5))
      return
    }
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
        onChange={(e) => { setQuery(e.target.value); setLimit(NOTES_PAGE); setCursor(null) }}
        onKeyDown={(e) => {
          if (typed && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault()
            setCursor(Math.max(0, Math.min(shown.length, at + (e.key === 'ArrowDown' ? 1 : -1))))
            return
          }
          if (typed && e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault()
            rowsOf()[at]?.click()
            return
          }
          if (e.key !== 'Escape') return
          // Escape returns to the list (the open note's row, else the first).
          e.preventDefault()
          e.stopPropagation()
          const all = rowsOf()
          const current = all.findIndex((b) => b.getAttribute('aria-current') === 'true')
          // The open note's row, else the first note (New note "<text>" only when nothing matched).
          const first = all.findIndex((b) => !b.hasAttribute('data-note-create'))
          if (all.length) focusRow(current >= 0 ? current : Math.max(0, first))
          else e.currentTarget.blur()
        }} />
    </div>
  )
  const filterProps = { filters, onChange: changeFilters, projects, labels }
  const renderRow = ({ entry, snippet }: Row, cursored: boolean) => {
    const standalone = entry.source === 'note'
    const editable = standalone && canEditTasks(roleOf(entry.projectId, memberships))
    const pinned = standalone && pinnedIds.includes(entry.id)
    return (
      <NoteRow key={entry.key} entry={entry} snippet={snippet} current={standalone && entry.id === id} cursor={cursored}
        project={entry.projectId ? projectById.get(entry.projectId) : undefined}
        labels={entry.labels.map((l) => labelById.get(l)).filter((l) => !!l && !l.deleted_at) as NonNullable<ReturnType<typeof labelById.get>>[]}
        updated={entry.updated ? relativeLabel(entry.updated, now, (ms) => dt.formatInstant(ms, 'date')) : ''}
        updatedTitle={entry.updated ? dt.formatInstant(entry.updated, 'datetime') : undefined}
        onOpen={() => openNote(entry)}
        menu={standalone ? <NoteMenu pinned={pinned} onPin={() => togglePin(entry.id)} pinKey={keysOf('notes.pin')}
          onTurnIntoTask={editable ? () => void turnNoteIntoTask(entry.id) : undefined} onDelete={editable ? () => void deleteNote(entry.id) : undefined} /> : undefined} />
    )
  }

  return (
    <PageBody width="list" data-page="notes">
      <PageHeader title={t('Notes')} help="notes" barActions
        meta={t('{n, plural, one {# note} other {# notes}}', { n: entries.length })}
        actions={<Button size="sm" variant={desktop ? 'ghost' : 'primary'} onClick={newNote} data-note-new><Icon name="plus" />{t('New note')}</Button>}>
        {searchField}
        {desktop ? <NoteFilterControls {...filterProps} /> : <NoteFiltersSheet {...filterProps} />}
      </PageHeader>
      {entries.length === 0 && !typed ? <NotesEmpty onNew={newNote} /> : unlinkedPending ? null : (
        <>
          <ul ref={list} className="space-y-0.5" aria-label={t('Notes')} onKeyDown={onListKey} data-notes-list>
            {typed && <NewNoteRow text={typed} cursor={at === 0} onCreate={() => act(createFromSearch())} />}
            {grouped && <GroupHeading title={t('Pinned')} count={pinnedRows.length} testId="pinned" />}
            {pinnedRows.map((r) => renderRow(r, false))}
            {grouped && <GroupHeading title={t('Recent')} count={recent.length} testId="recent" />}
            {recentShown.map((r, i) => renderRow(r, typed ? i + 1 === at : false))}
          </ul>
          {/* While typing, New note "<text>" is the answer to an empty search: no sentence under it. */}
          {shown.length === 0 && !typed && (
            <p className="py-6 text-body text-muted" role="status" data-notes-none>{t('No note matches these filters.')}</p>
          )}
          {recent.length > recentShown.length && (
            <div className="mt-3 flex items-center gap-3">
              <Button size="sm" variant="ghost" onClick={() => setLimit((n) => n + NOTES_PAGE)} data-notes-more>{t('Show more')}</Button>
              <span className="text-meta text-muted" data-notes-count>{t('{shown} of {total}', { shown: shown.length, total: pinnedRows.length + recent.length })}</span>
            </div>
          )}
        </>
      )}
    </PageBody>
  )
}

export default NotesPage
