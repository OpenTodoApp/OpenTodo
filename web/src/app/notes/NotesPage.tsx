// The Notes page (OpenSpec change notes-overview, design D3, D4 and D7): every task
// note, project note and standalone note of the workspace, from local data only,
// newest change first, 50 at a time with Show more. One row under the tool head:
// the search field, then Source, Project and Label (behind one Filters button on a
// phone). Search runs on the device over the decrypted text of the filtered list.
// The notes space (notes-space D5 to D7): filter tokens in the search field replace
// the Source, Project and Label pickers; the rows are one line; the header keeps a
// slot for the view switch of notes-graph-page.
// Graph mode (notes-graph-page): List | Graph in that slot, the graph in place of the
// list under the same header, the search field finding notes in it and the chips its topic.
// Keys: `q` new note and `/` the search (registry entries notes.new, notes.search),
// `j`/`k` (or the arrows) move between rows and Enter opens, Escape in the search
// returns to the list. A lazy route chunk: the shell loads it on first visit.
// The home of notes (notes-home): with no search and no filter, pinned notes come
// first under Pinned, the others under Recent (D4); typed text offers New note
// "<text>" as the first row, under the cursor when no note matches (D3); Source
// gains Unlinked, read from the note-links index (D5); `p` pins the focused note.
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { encryptionSnapshot, onEncryptionChange } from '../../lib/e2ee'
import { currentLanguage } from '../../lib/i18n/catalog'
import { isFavourite, pinnedNoteIds, setFavourite } from '../../lib/favourites'
import { useLabels, useMembershipMap, useProjects, useUserPrefsRow } from '../../lib/localData'
import { useLinkedTargets, useLinkIndex } from '../../lib/noteLinks'
import { useLiveTasks, NO_TASKS } from '../../lib/liveTasks'
import { homeGroups, NO_NOTE_FILTERS, NOTES_PAGE, NoteIndex, noteEntries, sameEntries, type NoteEntry, type NoteFilters } from '../../lib/noteList'
import { filterByTokens, parseStoredTokens, replaceTyping, tokensFromFilters, typingOf, type NoteToken, type TokenWorld } from '../../lib/noteQuery'
import { createNote } from '../../lib/noteOps'
import { NOTE_SORTS, pickNoteSort, readNoteSort, sortNotes, writeNoteSort, type NoteSort, type NoteSortBy } from '../../lib/noteSort'
import { useNoteRows } from '../../lib/noteRows'
import type { SnippetSegment } from '../../lib/noteSearch'
import { readJSON, readString, writeJSON, writeString } from '../../lib/deviceStorage'
import { canEditTasks, roleOf } from '../../lib/sharing'
import { keysOf } from '../../lib/shortcuts'
import { Button, DESKTOP_HEADER_QUERY, EmptyState, Icon, IconButton, ListGroupHeader, MenuGroup, MenuItem, MenuSeparator, PageBody, PageHeader, Tooltip, useMediaQuery } from '../../ui'
import type { ReactNode } from 'react'
import { t } from '../../lib/i18n'
import { act } from '../actionError'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import { closePanel, openPanel, panelOccupant, SPLIT_QUERY } from '../panel'
import { navigate, NOTES_VIEW_KEY, useRoute } from '../router'
import { useShortcutScope } from '../shortcuts'
import { relativeLabel } from '../task-detail/RelativeTime'
import { NoteSearchField } from './NoteSearchField'
import { focusBodyOnOpen, NotePage, NotePanel } from './NoteEditor'
import { createNoteWithUndo, deleteNote, turnNoteIntoTask } from './noteActions'
import { NoteMenu, NoteRow } from './NoteRow'
import { useNoteBulk } from './NoteBulkActions'
import { openNote } from './openNote'
import { LIST_READY, perfMark, SEARCH_RESULTS } from '../../lib/perfMarks'
import { loadLinkedReferences } from '../linkedRefsChunk'
import { graphShow } from '../../lib/notesGraphPrefs'
import type { GraphHandle } from '../notes-graph/GraphView'

// The Graph mode (notes-graph-page), its own chunk: loaded when the mode is first shown.
const NotesGraph = lazy(() => import('../notes-graph/NotesGraph'))

/** The page's filters on this device as an earlier version stored them (never synced; read once, left in place). */
export const NOTE_FILTERS_KEY = 'opentodo.notes.filters'
/** The search field's chips on this device (never synced, notes-space D6); the words are not kept. */
export const NOTE_TOKENS_KEY = 'opentodo.notes.tokens'

/** The stored chips, else the stored filters of an earlier version as chips. */
export function readNoteTokens(): NoteToken[] {
  const stored = readJSON<NoteToken[] | null>(NOTE_TOKENS_KEY, null, parseStoredTokens)
  return stored ?? tokensFromFilters(readNoteFilters(), { projects: [], labels: [], notes: [] })
}

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

type NotesMode = 'list' | 'graph'

/** The heading over the sorted notes: the order's name (notes-sort D3). */
export function sortHeading(sort: NoteSort): string {
  if (sort.by === 'created') return sort.reversed ? t('Oldest') : t('Newest')
  if (sort.by === 'title') return sort.reversed ? t('Z–A') : t('A–Z')
  return sort.reversed ? t('Oldest changed') : t('Recent')
}

/** The list's order on this device (notes-sort D3), and picking one; storage refused, it holds for the visit. */
function useNoteSort(): [NoteSort, (by: NoteSortBy) => void] {
  const [sort, setSort] = useState<NoteSort>(readNoteSort)
  const pick = (by: NoteSortBy) => {
    const next = pickNoteSort(sort, by)
    setSort(next)
    writeNoteSort(next)
  }
  return [sort, pick]
}

/** Sort in the header's menu (notes-sort D1): three orders, the checked one with its direction's arrow. */
export function NotesSortItems({ sort, onSort }: { sort: NoteSort; onSort: (by: NoteSortBy) => void }) {
  const label: Record<NoteSortBy, string> = { changed: t('Last changed'), created: t('Created'), title: t('Title') }
  return (
    <MenuGroup label={t('Sort')}>
      {NOTE_SORTS.map((by) => (
        <MenuItem key={by} label={label[by]} radio checked={sort.by === by} onSelect={() => onSort(by)} data-notes-sort={by}
          marker={sort.by === by ? <span className="text-muted" data-notes-sort-arrow={sort.reversed ? 'up' : 'down'}><Icon name={sort.reversed ? 'arrow-up' : 'arrow-down'} /></span> : undefined} />
      ))}
    </MenuGroup>
  )
}

/** List | Graph in the header (notes-graph-page D1): two buttons on a computer, the other mode's icon on a phone. */
export function NotesModeSwitch({ mode, onChange, compact }: { mode: NotesMode; onChange: (m: NotesMode) => void; compact: boolean }) {
  const label = { list: t('List'), graph: t('Graph') }
  const icon = { list: 'list', graph: 'waypoints' } as const
  if (compact) {
    const other = mode === 'list' ? 'graph' : 'list'
    return <IconButton icon={icon[other]} label={other === 'graph' ? t('Show as graph') : t('Show as list')} onClick={() => onChange(other)} data-notes-mode={mode} />
  }
  return (
    <span className="flex rounded-control border border-default text-meta" role="group" aria-label={t('Show notes as')} data-notes-mode={mode}>
      {(['list', 'graph'] as const).map((m) => (
        <Tooltip key={m} label={label[m]} shortcut={keysOf('notes.view-mode')}>
          <button type="button" aria-pressed={mode === m} onClick={() => onChange(m)} data-notes-mode-option={m}
            className={`${m === 'list' ? 'rounded-l-control' : 'rounded-r-control'} touch-target flex items-center gap-1.5 px-2 py-1 ${mode === m ? 'bg-sunken font-medium dark:bg-raised' : 'text-muted hover:bg-sunken dark:hover:bg-raised'}`}>
            <Icon name={icon[m]} size="sm" /><span className="max-lg:sr-only">{label[m]}</span>
          </button>
        </Tooltip>
      ))}
    </span>
  )
}

/**
 * The Notes page's header (notes-space D7): the title, the note count, New note and
 * Help, and the search row under them. `viewSwitch` is the place for the List | Graph
 * toggle of notes-graph-page, among the actions; `overflow` holds the graph's display choices.
 */
export function NotesHeader({ count, desktop, onNew, viewSwitch, overflow, children }: { count: number; desktop: boolean; onNew: () => void; viewSwitch?: ReactNode; overflow?: ReactNode; children: ReactNode }) {
  return (
    <PageHeader title={t('Notes')} help="notes" barActions
      meta={t('{n, plural, one {# note} other {# notes}}', { n: count })}
      // On a phone the floating + starts a note (the one add of the screen); the header keeps the title, count and Help.
      actions={desktop || viewSwitch ? <>{viewSwitch}{desktop && <Button size="sm" variant="ghost" onClick={onNew} data-note-new><Icon name="plus" />{t('New note')}</Button>}</> : undefined}
      overflow={overflow}>
      {children}
    </PageHeader>
  )
}

export function NotesPage({ id }: { id?: string }) {
  const route = useRoute()
  const mode: NotesMode = route.view === 'notes' && route.graph ? 'graph' : 'list'
  const graphMode = mode === 'graph'
  const graph = useRef<GraphHandle>(null)
  const show = graphShow.use()
  const tasks = useLiveTasks() ?? NO_TASKS
  const projects = useProjects()
  const labels = useLabels()
  const notes = useNoteRows()
  const prefs = useUserPrefsRow()
  const memberships = useMembershipMap()
  const dt = useDateTimeFormat()
  const desktop = useMediaQuery(DESKTOP_HEADER_QUERY)
  const docks = useMediaQuery(SPLIT_QUERY)
  const [tokens, setTokens] = useState<NoteToken[]>(readNoteTokens)
  const [text, setText] = useState('')
  const [limit, setLimit] = useState(NOTES_PAGE)
  const [sort, pickSort] = useNoteSort()
  // The list cursor while the search field holds words: an index over the rows, New note first; null is the default (D3).
  const [cursor, setCursor] = useState<number | null>(null)
  const search = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const index = useRef<NoteIndex | null>(null)

  // A note opened from here paints its Linked references without waiting on their chunk (linkedRefsChunk.ts).
  useEffect(() => { void loadLinkedReferences() }, [])
  // On a computer the note is docked beside the list; on a phone it is the page.
  const phonePage = !!id && !docks
  useDockedNote(id && docks ? id : null)

  const entries = useStableEntries(useMemo(() => noteEntries(tasks, projects, notes), [tasks, projects, notes]))
  const world = useMemo<TokenWorld>(() => ({ projects, labels, notes }), [projects, labels, notes])
  const pinnedIds = useMemo(() => pinnedNoteIds(prefs?.favourites), [prefs?.favourites])
  // The link index is read only for a chip that needs it.
  const linked = useLinkedTargets(tokens.some((x) => x.key === 'orphan'))
  const links = useLinkIndex(tokens.some((x) => x.key === 'linked'))
  const filtered = useMemo(() => filterByTokens(entries, tokens, {
    projects, pinnedIds, linked, now: Date.now(),
    linkedWith: (noteId) => (links ? new Set([...links.index.references('note', noteId), ...links.index.links('note', noteId)].map((r) => `${r.kind}:${r.id}`)) : null),
  }), [entries, tokens, projects, pinnedIds, linked, links])
  const pending = filtered === null
  const kept = useMemo(() => filtered ?? [], [filtered])
  // The list without words in the chosen order; search results keep their ranking (notes-sort D3).
  const sorted = useMemo(() => (sort.by === 'changed' && !sort.reversed ? kept : sortNotes(kept, sort, currentLanguage())), [kept, sort])
  // The token being typed is not a word yet: the search waits for it (D6).
  const typing = typingOf(text)
  const query = typing?.kind === 'value' ? replaceTyping(text, typing, '') : text
  // The search index is built in short slices once the page is open (or on the first
  // search, if that comes first) and forgets notes no longer listed.
  useEffect(() => { index.current?.prune(entries) }, [entries])
  useEffect(() => warmSoon(() => (index.current ??= new NoteIndex(currentLanguage())).warm(entries, 8)), [entries])
  // Dropped when the account locks (D4).
  useEffect(() => onEncryptionChange(() => { const s = encryptionSnapshot(); if (s.enabled && !s.unlocked) index.current?.clear() }), [])
  const rows = useMemo<Row[]>(() => {
    if (!query.trim()) return sorted.map((entry) => ({ entry }))
    index.current ??= new NoteIndex(currentLanguage())
    // Snippets for the rows shown (list-rendering-at-scale: one per hit took most of a keystroke).
    return index.current.search(kept, query, undefined, limit).map((r) => ({ entry: r.note, snippet: r.snippet }))
  }, [kept, sorted, query, limit])
  const typed = query.trim()
  // With no words and no chip: Pinned, then Recent (D4); without pins, one list as before.
  const groups = useMemo(() => (!typed && tokens.length === 0 ? homeGroups(sorted, pinnedIds) : null), [typed, tokens.length, sorted, pinnedIds])
  const pinnedRows: Row[] = useMemo(() => (groups ? groups.pinned.map((entry) => ({ entry })) : []), [groups])
  const grouped = pinnedRows.length > 0
  // The heading names the order: over Recent beside Pinned, or alone once the order is not the default.
  const sortNamed = !typed && (grouped || sort.by !== 'changed' || sort.reversed)
  const recent: Row[] = useMemo(() => (groups && grouped ? groups.recent.map((entry) => ({ entry })) : rows), [groups, grouped, rows])
  const recentShown = recent.slice(0, limit)
  const shown = [...pinnedRows, ...recentShown]
  // Ticking standalone notes the user may write (notes-bulk-actions D1, D2); none in Graph mode.
  const bulk = useNoteBulk({ rows: shown.map((r) => r.entry), enabled: !graphMode, projects, labels, memberships, favourites: prefs?.favourites })
  // The cursor starts on the first match, else on New note; the arrows in the field move it.
  const at = typed ? Math.min(cursor ?? (shown.length > 0 ? 1 : 0), shown.length) : -1
  useNotesMarks(entries.length > 0, query, rows)
  // Graph mode: the last mode shown is where Notes opens next on this device (D1); the chips are the topic, the words find (D4, D5).
  useEffect(() => { writeString(NOTES_VIEW_KEY, graphMode ? 'graph' : null) }, [graphMode])
  const matches = useMemo(() => (graphMode && typed ? rows.map((r) => r.entry.key) : null), [graphMode, typed, rows])
  const topic = useMemo(() => (graphMode && tokens.length > 0 && filtered ? new Set(filtered.map((e) => e.key)) : null), [graphMode, tokens.length, filtered])
  const switchMode = (m: NotesMode) => navigate({ view: 'notes', ...(id ? { id } : {}), graph: m === 'graph' })

  const changeTokens = (next: NoteToken[]) => {
    setTokens(next)
    setCursor(null)
    setLimit(NOTES_PAGE)
    writeJSON(NOTE_TOKENS_KEY, next) // storage refused: the chips hold for this visit
  }
  const changeText = (next: string) => { setText(next); setLimit(NOTES_PAGE); setCursor(null) }
  const changeSort = (by: NoteSortBy) => { pickSort(by); setLimit(NOTES_PAGE) }

  // A new note takes the project of the first `in:` chip the user may write in, and the labels of the label chips (D6).
  const placeOfNew = () => {
    const project = tokens.find((x): x is Extract<NoteToken, { key: 'in' }> => x.key === 'in' && canEditTasks(roleOf(x.id, memberships)) && projects.some((p) => p.id === x.id && !p.deleted_at))
    const live = new Set(labels.filter((l) => !l.deleted_at).map((l) => l.id))
    return { project_id: project?.id ?? null, labels: tokens.flatMap((x) => (x.key === 'label' && live.has(x.id) ? [x.id] : [])) }
  }
  const startNote = async () => {
    const created = await createNote(placeOfNew())
    navigate({ view: 'notes', id: created })
  }
  const newNote = () => act(startNote())
  // New note "<text>": titled with the words, in the chips' project and labels (D3), one Undo, the caret in its body.
  const createFromSearch = async () => {
    const title = [...typed].slice(0, TITLE_MAX).join('')
    if (!title) return
    const created = await createNoteWithUndo({ title, ...placeOfNew() })
    if (!created) return
    setText('')
    setCursor(null)
    focusBodyOnOpen(created)
    navigate({ view: 'notes', id: created })
  }
  const togglePin = (noteId: string) => act(setFavourite('note', noteId, !isFavourite(prefs, 'note', noteId)))
  // /notes?new=1 (the palette's New note): create one, open it, drop the parameter.
  useEffect(() => {
    if (new URLSearchParams(location.search).get('new') !== '1') return
    history.replaceState(history.state, '', graphMode ? '/notes?view=graph' : '/notes')
    newNote()
  })

  useShortcutScope('view', {
    'notes.new': () => newNote(),
    'notes.search': () => { search.current?.focus() },
    'notes.view-mode': () => switchMode(graphMode ? 'list' : 'graph'),
  }, { view: 'notes', enabled: !phonePage })

  if (phonePage) return <NotePage id={id} />

  const projectById = new Map(projects.map((p) => [p.id, p]))
  const labelById = new Map(labels.map((l) => [l.id, l]))
  const now = Date.now()
  const rowsOf = () => [...(list.current?.querySelectorAll<HTMLButtonElement>('[data-note-open]') ?? [])]
  const focusRow = (i: number) => rowsOf()[i]?.focus()
  const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const all = rowsOf()
    const at = all.indexOf(document.activeElement as HTMLButtonElement)
    if (at < 0) return
    // The selection's keys first (notes-bulk-actions D3).
    if (bulk.onListKey(e, all, at)) return
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); all[at].click(); return }
    const rowKey = all[at].closest('[data-note-key]')?.getAttribute('data-note-key') ?? ''
    if (e.key === 'p' && rowKey.startsWith('note:')) { e.preventDefault(); e.stopPropagation(); togglePin(rowKey.slice(5)); return }
    const step = e.key === 'j' || e.key === 'ArrowDown' ? 1 : e.key === 'k' || e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    e.stopPropagation()
    all[Math.max(0, Math.min(all.length - 1, at + step))]?.focus()
  }
  // The field's own keys come first (chips, suggestions); these move the list's cursor.
  const onFieldKey = (e: KeyboardEvent<HTMLInputElement>) => {
    // Graph mode (D4): Enter and the arrows fly to the next or previous match, Escape returns to the graph.
    if (graphMode && !e.altKey && !e.ctrlKey && !e.metaKey && !e.nativeEvent.isComposing) {
      const step = e.key === 'Enter' ? (e.shiftKey ? -1 : 1) : e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
      if (step && typed) {
        e.preventDefault()
        graph.current?.find(step)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        document.querySelector<HTMLElement>('[data-notes-graph-area]')?.focus()
        return
      }
    }
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
  }

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
        onOpen={() => openNote(entry)} tick={bulk.tickOf(entry.key)}
        menu={standalone ? <NoteMenu pinned={pinned} onPin={() => togglePin(entry.id)} pinKey={keysOf('notes.pin')}
          onTurnIntoTask={editable ? () => void turnNoteIntoTask(entry.id) : undefined} onDelete={editable ? () => void deleteNote(entry.id) : undefined} /> : undefined} />
    )
  }

  // The header's menu: Sort in List mode, the graph's display choices (D2) in Graph mode, which ignores the order.
  const overflow = !graphMode ? <>{bulk.selectItem}<MenuSeparator /><NotesSortItems sort={sort} onSort={changeSort} /></> : (
    <>
      <MenuItem label={t('Notes without links')} checked={show.orphans} onSelect={() => graphShow.set({ ...show, orphans: !show.orphans })} data-notes-graph-show="orphans" />
      <MenuItem label={t('Tasks and projects without notes')} checked={show.secondary} onSelect={() => graphShow.set({ ...show, secondary: !show.secondary })} data-notes-graph-show="secondary" />
    </>
  )

  return (
    <PageBody width="list" data-page="notes" flush={graphMode} className={graphMode ? 'flex h-full flex-col' : undefined} data-notes-mode={mode}>
      <NotesHeader count={entries.length} desktop={desktop} onNew={newNote} viewSwitch={<NotesModeSwitch mode={mode} onChange={switchMode} compact={!desktop} />} overflow={overflow}>
        <NoteSearchField text={text} onText={changeText} tokens={tokens} onTokens={changeTokens} projects={projects} labels={labels} world={world}
          inputRef={search} onListKey={onFieldKey} label={graphMode ? t('Find a note') : t('Search notes')} shortcut={keysOf('notes.search')} />
      </NotesHeader>
      {entries.length === 0 && !typed && tokens.length === 0 ? <NotesEmpty onNew={newNote} /> : graphMode ? (
        <Suspense fallback={<div className="notes-graph" data-notes-graph />}>
          <NotesGraph entries={entries} topic={topic} topicKey={JSON.stringify(tokens)} matches={matches} openId={id} handle={graph} />
        </Suspense>
      ) : pending ? null : (
        <>
          <ul ref={list} className="space-y-px" aria-label={t('Notes')} onKeyDown={onListKey} data-notes-list>
            {typed && <NewNoteRow text={typed} cursor={at === 0} onCreate={() => act(createFromSearch())} />}
            {grouped && <GroupHeading title={t('Pinned')} count={pinnedRows.length} testId="pinned" />}
            {pinnedRows.map((r) => renderRow(r, false))}
            {sortNamed && <GroupHeading title={sortHeading(sort)} count={recent.length} testId="recent" />}
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
      {!graphMode && bulk.bar}
    </PageBody>
  )
}

export default NotesPage
