// Filter view (OpenSpec change `filter-query-language`): a query input over the
// local store. Parsing and evaluation are pure (lib/filter); results are a live
// query, so local edits and synced ops update them without a reload, offline too.
import { useLiveQuery } from 'dexie-react-hooks'
import { type KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../lib/db'
import { compareDueThenPriority } from '../lib/ordering'
import { addFilterHistory, compile, getFilterHistory, parse, type Node } from '../lib/filter'
import { resolveLabels } from '../lib/labels'
import { setTaskCompleted } from '../lib/ops'
import { buildProjectTree } from '../lib/projects'
import { breadcrumbOf, progressMap } from '../lib/subtasks'
import { createView } from '../lib/views'
import { ancestors, flattenTree } from '../lib/tree'
import type { Label, Project, Task } from '../lib/types'
import { LabelPicker } from './LabelPicker'
import { NamePrompt } from './NamePrompt'
import { navigate } from './router'
import { useListKeys } from './useListKeys'
import { useToday, useViewerZone } from './useViews'
import { TaskDetail } from './TaskDetail'
import { TaskRow } from './TaskRow'
import { visibleTasks } from '../lib/trash'

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

export function FilterView() {
  const today = useToday()
  const zone = useViewerZone()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
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

  // A syntax error keeps the last valid query (and so the previous results) on screen.
  const parsed = useMemo(() => tryParse(debounced), [debounced])
  const [good, setGood] = useState<{ src: string; ast: Node | null }>({ src: '', ast: null })
  if (parsed.ok && good.src !== debounced) setGood({ src: debounced, ast: parsed.ast })

  const result = useMemo(() => {
    if (!good.ast) return null
    // Like the other cross-project views, tasks of archived projects stay out.
    const archived = new Set(projects.filter((p) => p.archived).map((p) => p.id))
    const { test, warnings } = compile(good.ast, { today, labels, projects })
    const tasks = allTasks.filter((t) => !(t.project_id && archived.has(t.project_id)) && test(t))
    return { tasks, warnings }
  }, [good, allTasks, labels, projects, today, zone])

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
  const [openId, setOpenId] = useState<string | null>(null)
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
  useListKeys({
    rows: keyRows, selected: selectedId, setSelected: setSelectedId, openId, setOpenId, pickerFor, setPickerFor,
    paused: saving,
    onIdleEscape: () => {
      setSelectedId(null)
      inputRef.current?.focus()
    },
    extra: (e) => {
      if (e.key !== 's' || !canSave) return false
      e.preventDefault()
      setSaving(true)
      return true
    },
  })

  useEffect(() => {
    if (selectedId) document.querySelector(`[data-task-id="${selectedId}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  const error = parsed.ok ? null : parsed.error
  const warnings = !error && good.src === debounced ? result?.warnings ?? [] : []

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1 px-4 py-5 md:px-8">
        <div className="mx-auto max-w-3xl">
          <h1 className="mb-4 flex items-center gap-2 text-xl font-semibold">
            Filter
            {result && <span className="text-sm font-normal text-slate-400">{rows.length}</span>}
            <span className="flex-1" />
            <button className="btn-ghost border border-slate-300 text-xs font-normal dark:border-slate-700" disabled={!canSave}
              onClick={() => setSaving(true)} title="Save this query as a view (s in the results)">
              Save view
            </button>
          </h1>
          <div className="mb-3 border-b border-slate-200 pb-2 dark:border-slate-800">
            <input
              ref={inputRef}
              className="input font-mono"
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
            <div id="filter-message" className="min-h-5 px-1 pt-1 text-xs" aria-live="polite">
              {error ? (
                <p role="alert" className="text-red-600 dark:text-red-400">{error}</p>
              ) : warnings.length > 0 ? (
                <p className="text-amber-700 dark:text-amber-400">{warnings.join(' · ')}</p>
              ) : null}
            </div>
          </div>

          {!good.ast && <UsageHint />}
          {result && rows.length === 0 && <p className="px-2 py-8 text-center text-sm text-slate-400">No task matches this filter.</p>}

          <div ref={listRef} tabIndex={-1} className="outline-none" aria-label="Filter results">
            {groups.map((g) => (
              <section key={g.key} className="mb-4">
                <h2 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{g.heading}</h2>
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
                      breadcrumb={t.parent_id ? breadcrumbOf(t, taskMap) : null}
                      onToggle={() => void setTaskCompleted(t.id, !t.completed_at)}
                      onOpen={() => {
                        setSelectedId(t.id)
                        setOpenId(t.id)
                      }}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </div>
      {openId && (
        <TaskDetail
          key={openId}
          taskId={openId}
          projects={projects}
          labelMap={labelMap}
          onClose={() => setOpenId(null)}
          onOpen={(id) => { setSelectedId(id); setOpenId(id) }}
          onToggleComplete={(t) => void setTaskCompleted(t.id, !t.completed_at)}
        />
      )}
      {saving && (
        <NamePrompt title="Save view" label="View name" hint="The view is pinned to the sidebar under Views."
          onCancel={() => setSaving(false)}
          onSubmit={async (name) => {
            const id = await createView({ name, query })
            remember(query)
            setSaving(false)
            navigate({ view: 'view', id })
          }} />
      )}
      {pickerFor && (
        <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/30 p-4 pt-24" onClick={() => setPickerFor(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-3 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Labels for task">
            <LabelPicker taskId={pickerFor} onClose={() => setPickerFor(null)} />
            <p className="mt-2 px-1 text-[11px] text-slate-400">Enter toggles or creates · Esc closes</p>
          </div>
        </div>
      )}
    </div>
  )
}

const HINT: [string[], string][] = [
  [['@errand', '#Work', '##Work'], 'label, project, project with its sub-projects'],
  [['p1', 'p4'], 'priority'],
  [['due <= tomorrow', 'created > 7 days ago'], '< <= = >= > before after · today, tomorrow, yesterday, monday…, 2026-12-01, 3 days, 3 days ago'],
  [['overdue', 'today', 'tomorrow', 'no date', 'no time'], 'due date keywords'],
  [['no project', 'no labels', 'subtask'], 'Inbox, unlabelled, has a parent task'],
  [['completed', 'open'], 'open tasks only unless one of these appears'],
  [['search: "oat milk"'], 'title or notes contain the text'],
  [['&', '|', '!', '( )'], 'and, or, not, grouping · quote names with spaces: @"follow up"'],
]

function UsageHint() {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">
      <p className="mb-2">Type a query to list matching tasks. Enter jumps to the results, Esc comes back, ↑ / ↓ recall recent queries.</p>
      <dl className="text-xs">
        {HINT.map(([terms, d]) => (
          <div key={terms[0]} className="flex flex-col gap-1 border-t border-slate-100 py-1.5 sm:flex-row sm:gap-3 dark:border-slate-800">
            <dt className="flex flex-wrap gap-1 sm:w-64 sm:shrink-0">
              {terms.map((t) => <code key={t} className="kbd text-slate-700 dark:text-slate-300">{t}</code>)}
            </dt>
            <dd>{d}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
