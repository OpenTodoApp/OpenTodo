// A saved list view (OpenSpec `custom-views`): its query in an editable input, the
// grouping and sort options in the header, and live results from the view runner.
// A dashboard is rendered by DashboardView instead.
import { blockedMap } from '../lib/dependencies'
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { parse } from '../lib/filter'
import { resolveLabels } from '../lib/labels'
import { setTaskCompleted } from '../lib/ops'
import { breadcrumbOf, progressMap } from '../lib/subtasks'
import { GROUP_BY_OPTIONS, SORT_BY_OPTIONS, type GroupBy, type SortBy, type SortDir, type View } from '../lib/types'
import { runView, setPinned, updateView, viewOptions } from '../lib/views'
import { DashboardView } from './DashboardView'
import { LabelPicker } from './LabelPicker'
import { setPanelTaskId, usePanelTaskId } from './panel'
import { TaskRow } from './TaskRow'
import { ViewMenu } from './ViewsView'
import { useListKeys } from './useListKeys'
import { useBulkList } from './bulk/useBulkList'
import { placeInDay } from './signals'
import { todayISO } from '../lib/dates'
import { useViewData, type ViewData } from './useViews'
import { Dialog } from './overlay'

const GROUP_LABEL: Record<GroupBy, string> = { project: 'Project', due: 'Due date', priority: 'Priority', label: 'Label', none: 'None' }
const SORT_LABEL: Record<SortBy, string> = { due: 'Due date', priority: 'Priority', position: 'Manual order', created: 'Created', title: 'Title' }

function parseError(src: string): string | null {
  if (!src.trim()) return 'The query must not be empty'
  try {
    parse(src)
    return null
  } catch (e) {
    return (e as Error).message
  }
}

export function SavedViewRoute({ id }: { id: string }) {
  const data = useViewData()
  const view = data.views.find((v) => v.id === id)
  if (!view) {
    return <p className="px-4 py-10 text-center text-sm text-faint">This view does not exist (it may have been deleted on another device).</p>
  }
  return view.kind === 'dashboard' ? <DashboardView key={id} dashboard={view} data={data} /> : <SavedViewView key={id} view={view} data={data} />
}

export function SavedViewView({ view, data }: { view: View; data: ViewData }) {
  const { projects, labels, tasks, ctx } = data
  const opts = viewOptions(view)
  const result = useMemo(() => runView(view, ctx), [view, ctx])
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const labelMap = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels])
  const taskMap = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])
  const progress = useMemo(() => progressMap(tasks), [tasks])
  const blocked = useMemo(() => blockedMap(tasks), [tasks])

  // ---- query editing: the input holds a draft; Enter (or Save) confirms it ----
  const [draft, setDraft] = useState(view.query)
  const [draftError, setDraftError] = useState<string | null>(null)
  const lastSaved = useRef(view.query)
  // A remote edit of the query replaces the draft unless the user is mid-edit.
  useEffect(() => {
    if (draft === lastSaved.current) setDraft(view.query)
    lastSaved.current = view.query
  }, [view.query])
  const dirty = draft.trim() !== view.query
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  async function saveQuery() {
    const err = parseError(draft)
    setDraftError(err)
    if (err) return
    await updateView(view.id, { query: draft })
    listRef.current?.focus()
  }
  function onInputKey(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (dirty) void saveQuery()
      else listRef.current?.focus()
    } else if (e.key === 'Escape') {
      e.stopPropagation()
      setDraft(view.query)
      setDraftError(null)
    }
  }

  // ---- results and keyboard navigation (a task can appear under several labels) ----
  const groups = result.ok ? result.groups : []
  const rows = useMemo(() => groups.flatMap((g) => g.tasks.map((t) => ({ key: `${g.key}:${t.id}`, task: t }))), [groups])
  const [selected, setSelected] = useState<string | null>(null)
  const openId = usePanelTaskId()
  const setOpenId = setPanelTaskId
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const bulkTasks = useMemo(() => rows.map((r) => r.task), [rows])
  const bulk = useBulkList(bulkTasks)

  useListKeys({
    rows, selected, setSelected, openId, setOpenId, pickerFor, setPickerFor, bulk,
    onIdleEscape: () => setSelected(null),
    extra: (e, row) => {
      if (e.key === 's' && row && !row.completed_at) {
        e.preventDefault()
        placeInDay(row, todayISO())
        return true
      }
      if (e.key !== '/') return false
      e.preventDefault()
      inputRef.current?.focus()
      return true
    },
  })

  useEffect(() => {
    if (!selected) return
    const i = selected.lastIndexOf(':')
    document.querySelector(`[data-group="${CSS.escape(selected.slice(0, i))}"] [data-task-id="${CSS.escape(selected.slice(i + 1))}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const message = draftError ?? (!dirty && !result.ok ? result.error : null)
  const count = result.ok ? result.tasks.length : null

  return (
    <div className="min-w-0 px-4 py-5 md:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: view.color }} aria-hidden />
            <h1 className="truncate text-xl font-semibold">{view.name}</h1>
            {count !== null && <span className="text-sm text-faint">{count}</span>}
            <span className="flex-1" />
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => void setPinned(view.id, !view.pinned)}>{view.pinned ? 'Unpin' : 'Pin'}</button>
            <ViewMenu view={view} />
          </div>

          <div className="mb-3 border-b border-default pb-2">
            <div className="flex gap-2">
              <input ref={inputRef} className="input font-mono" aria-label="View query" aria-invalid={!!message} aria-describedby="view-message"
                autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
                value={draft} onChange={(e) => { setDraft(e.target.value); setDraftError(null) }} onKeyDown={onInputKey} />
              {dirty && <button className="btn-primary shrink-0 text-xs" onClick={() => void saveQuery()}>Save</button>}
            </div>
            <div id="view-message" className="min-h-5 px-1 pt-1 text-xs" aria-live="polite">
              {message ? (
                <p role="alert" className="text-danger">{message}</p>
              ) : dirty ? (
                <p className="text-faint">Enter saves the query for every device · Esc discards the change</p>
              ) : result.ok && result.warnings.length > 0 ? (
                <p className="text-warning">{result.warnings.join(' · ')}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
              <label className="flex items-center gap-1.5">Group
                <select className="input w-auto py-1 text-xs" aria-label="Group by" value={opts.groupBy}
                  onChange={(e) => void updateView(view.id, { group_by: e.target.value as GroupBy })}>
                  {GROUP_BY_OPTIONS.map((g) => <option key={g} value={g}>{GROUP_LABEL[g]}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1.5">Sort
                <select className="input w-auto py-1 text-xs" aria-label="Sort by" value={opts.sortBy}
                  onChange={(e) => void updateView(view.id, { sort_by: e.target.value as SortBy })}>
                  {SORT_BY_OPTIONS.map((s) => <option key={s} value={s}>{SORT_LABEL[s]}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1.5">Direction
                <select className="input w-auto py-1 text-xs" aria-label="Sort direction" value={opts.sortDir}
                  onChange={(e) => void updateView(view.id, { sort_dir: e.target.value as SortDir })}>
                  <option value="asc">{opts.sortBy === 'priority' ? 'Ascending (p4 first)' : 'Ascending'}</option>
                  <option value="desc">{opts.sortBy === 'priority' ? 'Descending (p1 first)' : 'Descending'}</option>
                </select>
              </label>
            </div>
          </div>

          {result.ok && rows.length === 0 && <p className="px-2 py-8 text-center text-sm text-faint">No task matches this view.</p>}

          {bulk.render(rows.find((r) => r.key === selected)?.task.id ?? null)}
          <div ref={listRef} tabIndex={-1} className="outline-none" role="region" aria-label="View results">
            {groups.map((g) => (
              <section key={g.key} data-group={g.key} className="mb-4">
                {g.heading && <h2 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-faint">{g.heading}</h2>}
                <ul>
                  {g.tasks.map((t) => {
                    const key = `${g.key}:${t.id}`
                    return (
                        <TaskRow
                          key={key}
                          task={t}
                          project={t.project_id ? projectMap.get(t.project_id) : undefined}
                          labels={resolveLabels(t.labels, labelMap)}
                          showProject={opts.groupBy !== 'project'}
                          selected={key === selected}
                          progress={progress.get(t.id)}
                          blockedBy={blocked.get(t.id)}
                          breadcrumb={t.parent_id ? breadcrumbOf(t, taskMap) : null}
                          onToggle={() => void setTaskCompleted(t.id, !t.completed_at)}
                          onOpen={() => { setSelected(key); setOpenId(t.id) }}
                          {...bulk.rowProps(t.id)}
                        />
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>
      {pickerFor && (
        <Dialog title="Labels" label="Labels for task" onClose={() => setPickerFor(null)}>
          <LabelPicker taskId={pickerFor} onClose={() => setPickerFor(null)} />
        </Dialog>
      )}
    </div>
  )
}
