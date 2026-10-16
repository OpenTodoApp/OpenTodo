// Filter view (OpenSpec change `filter-query-language`): a query input over the
// local store. Parsing and evaluation are pure (lib/filter); results are a live
// query, so local edits and synced ops update them without a reload, offline too.
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, PageBody, PageHeader } from '../ui'
import { type KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { blockedMap } from '../lib/dependencies'
import { db } from '../lib/db'
import { compareDueThenPriority } from '../lib/ordering'
import { addFilterHistory, compile, getFilterHistory, parse, type Node } from '../lib/filter'
import { resolveLabels } from '../lib/labels'
import { setTaskCompleted } from '../lib/ops'
import { buildProjectTree } from '../lib/projects'
import { breadcrumbOf, progressMap } from '../lib/subtasks'
import { habitStatsMap } from '../lib/habits'
import { createView } from '../lib/views'
import { ancestors, flattenTree } from '../lib/tree'
import type { Label, Project, Task } from '../lib/types'
import { LabelPicker } from './LabelPicker'
import { NamePrompt } from './NamePrompt'
import { navigate } from './router'
import { setCurrentFilter } from './listActions'
import { useBulkList } from './bulk/useBulkList'
import { useListKeys } from './useListKeys'
import { useShortcutScope } from './shortcuts'
import { useToday, useViewerZone } from './useViews'
import { setPanelTaskId, usePanelTaskId } from './panel'
import { TaskRow } from './TaskRow'
import { visibleTasks } from '../lib/trash'
import { Dialog } from './overlay'
import { useDateTimeFormat } from './DateTimePrefsProvider'

const DEBOUNCE_MS = 150

type Parsed = { ok: true; ast: Node | null } | { ok: false; error: string }

function tryParse(src: string): Parsed {
  try {
    return { ok: true, ast: parse(src) }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

interface Group {
  key: string
  heading: string
  tasks: Task[]
}

export function FilterView({ initialQuery = '' }: { initialQuery?: string } = {}) {
  const today = useToday()
  const zone = useViewerZone()
  // `this week` follows the first-day-of-week preference (completed-date-filters D2).
  const weekStart = useDateTimeFormat().resolved.weekStart
  const [query, setQuery] = useState(initialQuery)
  const [debounced, setDebounced] = useState(initialQuery)
  // A query handed over by the command palette is remembered like a typed one.
  useEffect(() => { if (initialQuery.trim()) void addFilterHistory(initialQuery) }, [initialQuery])
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [query])

  const projects = useLiveQuery(() => db.projects.filter((p) => !p.deleted_at).toArray(), [], [] as Project[])
  const labels = useLiveQuery(() => db.labels.toArray(), [], [] as Label[])
  const allTasks = useLiveQuery(() => visibleTasks(), [], [] as Task[])
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const labelMap = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels])
  const taskMap = useMemo(() => new Map(allTasks.map((t) => [t.id, t])), [allTasks])
  const progress = useMemo(() => progressMap(allTasks), [allTasks])
  const blocked = useMemo(() => blockedMap(allTasks), [allTasks])
  const habits = useMemo(() => habitStatsMap(allTasks, today), [allTasks, today])

  // A syntax error keeps the last valid query (and so the previous results) on screen.
  const parsed = useMemo(() => tryParse(debounced), [debounced])
  const [good, setGood] = useState<{ src: string; ast: Node | null }>({ src: '', ast: null })
  if (parsed.ok && good.src !== debounced) setGood({ src: debounced, ast: parsed.ast })

  useEffect(() => { setCurrentFilter(good.ast ? good.src : null); return () => setCurrentFilter(null) }, [good])

  const result = useMemo(() => {
    if (!good.ast) return null
    // Like the other cross-project views, tasks of archived projects stay out.
    const archived = new Set(projects.filter((p) => p.archived).map((p) => p.id))
    const { test, warnings } = compile(good.ast, { today, labels, projects, tasks: allTasks, weekStart })
    const tasks = allTasks.filter((t) => !(t.project_id && archived.has(t.project_id)) && test(t))
    return { tasks, warnings }
  }, [good, allTasks, labels, projects, today, zone, weekStart])

  const groups = useMemo<Group[]>(() => {
    if (!result) return []
    const byProject = new Map<string, Task[]>()
    for (const t of result.tasks) {
      const k = t.project_id ?? ''
      const list = byProject.get(k)
      if (list) list.push(t)
      else byProject.set(k, [t])
    }
    // Inbox first, then projects in sidebar (tree) order, then anything else.
    const order = ['', ...flattenTree(buildProjectTree(projects).roots).map((n) => n.id)]
    for (const k of byProject.keys()) if (!order.includes(k)) order.push(k)
    const heading = (id: string) => {
      const p = projectMap.get(id)
      if (!p) return 'Project'
      return [...ancestors(id, projectMap).reverse(), p].map((x) => x.name).join(' › ')
    }
    return order.filter((k) => byProject.has(k)).map((k) => ({
      key: k || 'inbox',
      heading: k ? heading(k) : 'Inbox',
      tasks: byProject.get(k)!.sort(compareDueThenPriority),
    }))
  }, [result, projects, projectMap])
  const rows = useMemo(() => groups.flatMap((g) => g.tasks), [groups])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const openId = usePanelTaskId()
  const setOpenId = setPanelTaskId
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // A view can be saved from any query that parses and is not empty.
  const canSave = query.trim() !== '' && tryParse(query).ok
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // ---- per-device history (local meta, never synced) ----
  const [history, setHistory] = useState<string[]>([])
  const [histIdx, setHistIdx] = useState(-1)
  const draft = useRef('')
  useEffect(() => {
    void getFilterHistory().then(setHistory)
  }, [])
  const remember = useCallback((q: string) => {
    if (q.trim()) void addFilterHistory(q).then(setHistory)
  }, [])
  // Leaving the view keeps the last valid query in the history too.
  const lastValid = useRef('')
  lastValid.current = good.src
  useEffect(() => () => remember(lastValid.current), [remember])

  // Enter: run now and move to the first result once it is rendered.
  const [focusFirst, setFocusFirst] = useState(false)
  useEffect(() => {
    if (!focusFirst || debounced !== query || good.src !== query) return
    setFocusFirst(false)
    if (rows.length === 0) return
    setSelectedId(rows[0].id)
    listRef.current?.focus()
  }, [focusFirst, debounced, query, good, rows])

  function onInputKey(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      setDebounced(query)
      if (!tryParse(query).ok) return
      remember(query)
      setHistIdx(-1)
      setFocusFirst(true)
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const next = e.key === 'ArrowUp' ? Math.min(history.length - 1, histIdx + 1) : Math.max(-1, histIdx - 1)
      if (next === histIdx) return
      if (histIdx === -1) draft.current = query
      setHistIdx(next)
      setQuery(next === -1 ? draft.current : history[next])
    } else if (e.key === 'Escape') {
      e.stopPropagation()
    }
  }

  // ---- list keyboard navigation (only while focus is outside text fields) ----
  const keyRows = useMemo(() => rows.map((t) => ({ key: t.id, task: t })), [rows])
  const bulk = useBulkList(rows)
  useListKeys({
    rows: keyRows, selected: selectedId, setSelected: setSelectedId, openId, setOpenId, pickerFor, setPickerFor, bulk,
    paused: saving,
    onIdleEscape: () => {
      setSelectedId(null)
      inputRef.current?.focus()
    },
  })
  // `s` saves the query as a view (filter.save); the Filter list has no schedule action, so the key reaches this view scope.
  useShortcutScope('view', { 'filter.save': () => { if (!canSave) return false; setSaving(true) } }, { view: 'filter' })

  useEffect(() => {
    if (selectedId) document.querySelector(`[data-task-id="${selectedId}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  const error = parsed.ok ? null : parsed.error
  const warnings = !error && good.src === debounced ? result?.warnings ?? [] : []

  return (
    <PageBody width="list">
          <PageHeader title="Filter" meta={result ? rows.length : undefined} help="filter"
            actions={<Button variant="secondary" size="sm" disabled={!canSave} onClick={() => setSaving(true)}>Save filter</Button>} />
          <div className="mb-3 border-b border-default pb-2">
            <input
              ref={inputRef}
              className="ui-input font-mono"
              placeholder="@work & due <= tomorrow & p1"
              aria-label="Filter query"
              aria-invalid={!!error}
              aria-describedby="filter-message"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setHistIdx(-1)
              }}
              onKeyDown={onInputKey}
            />
            <div id="filter-message" className="min-h-5 px-1 pt-1 text-meta" aria-live="polite">
              {error ? (
                <p role="alert" className="text-danger">{error}</p>
              ) : warnings.length > 0 ? (
                <p className="text-warning">{warnings.join(' · ')}</p>
              ) : null}
            </div>
          </div>

          {!good.ast && <UsageHint />}
          {result && rows.length === 0 && <p className="px-2 py-8 text-center text-body text-faint">No task matches this filter.</p>}

          {bulk.render(selectedId)}
          <div ref={listRef} tabIndex={-1} className="outline-none" role="region" aria-label="Filter results">
            {groups.map((g) => (
              <section key={g.key} className="mb-4">
                <h2 className="mb-1 px-2 text-meta font-semibold uppercase tracking-wide text-faint">{g.heading}</h2>
                <ul>
                  {g.tasks.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      project={t.project_id ? projectMap.get(t.project_id) : undefined}
                      labels={resolveLabels(t.labels, labelMap)}
                      showProject={false}
                      selected={t.id === selectedId}
                      progress={progress.get(t.id)}
                      blockedBy={blocked.get(t.id)}
                      habit={habits.get(t.id)}
                      breadcrumb={t.parent_id ? breadcrumbOf(t, taskMap) : null}
                      onToggle={() => void setTaskCompleted(t.id, !t.completed_at)}
                      onOpen={() => {
                        setSelectedId(t.id)
                        setOpenId(t.id)
                      }}
                      {...bulk.rowProps(t.id)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
      {saving && (
        <NamePrompt title="Save filter" label="Filter name" hint="The filter is pinned to the sidebar under Filters."
          onCancel={() => setSaving(false)}
          onSubmit={async (name) => {
            const id = await createView({ name, query })
            remember(query)
            setSaving(false)
            navigate({ view: 'view', id })
          }} />
      )}
      {pickerFor && (
        <Dialog title="Labels" label="Labels for task" onClose={() => setPickerFor(null)}>
          <LabelPicker taskId={pickerFor} onClose={() => setPickerFor(null)} />
          <p className="mt-2 px-1 text-hint text-faint">Enter toggles or creates · Esc closes</p>
        </Dialog>
      )}
    </PageBody>
  )
}

const HINT: [string[], string][] = [
  [['@errand', '#Work', '##Work'], 'label, project, project with its sub-projects'],
  [['p1', 'p4'], 'priority'],
  [['due <= tomorrow', 'created > 7 days ago'], '< <= = >= > before after · today, tomorrow, yesterday, monday…, 2026-12-01, 3 days, 3 days ago'],
  [['due = this week', 'completed >= last month'], 'periods: this, last or next week or month, 2 weeks ago, 3 months ago · = means within'],
  [['overdue', 'today', 'tomorrow', 'no date', 'no time'], 'due date keywords'],
  [['no project', 'no labels', 'subtask'], 'Inbox, unlabelled, has a parent task'],
  [['completed', 'open', 'completed = last week'], 'open tasks only unless one of these, or a completion date, appears'],
  [['search: "oat milk"'], 'title or notes contain the text'],
  [['&', '|', '!', '( )'], 'and, or, not, grouping · quote names with spaces: @"follow up"'],
]

function UsageHint() {
  return (
    <div className="rounded-control border border-dashed border-input p-4 text-body text-muted">
      <p className="mb-2">Type a query to list matching tasks. Enter jumps to the results, Esc comes back, ↑ / ↓ recall recent queries.</p>
      <dl className="text-meta">
        {HINT.map(([terms, d]) => (
          <div key={terms[0]} className="flex flex-col gap-1 border-t border-default py-1.5 sm:flex-row sm:gap-3">
            <dt className="flex flex-wrap gap-1 sm:w-64 sm:shrink-0">
              {terms.map((t) => <code key={t} className="ui-kbd text-muted">{t}</code>)}
            </dt>
            <dd>{d}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
