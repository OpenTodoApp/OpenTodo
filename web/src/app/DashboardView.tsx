// A dashboard (OpenSpec `custom-views`): a saved view of kind `dashboard` whose
// `panels` are other saved list views. Each panel shows the view's open-task count and
// first tasks; all panels are evaluated in one pass. Tab / Shift+Tab move between
// panels, j / k move inside one.
import { useEffect, useMemo, useRef, useState } from 'react'
import { resolveLabels } from '../lib/labels'
import { setTaskCompleted } from '../lib/ops'
import type { Label, Project, View } from '../lib/types'
import { MAX_PANELS, addPanel, dashboardPanels, evaluateViews, isDashboard, movePanel, removePanel, setPinned, type PanelState } from '../lib/views'
import { TaskDetail } from './TaskDetail'
import { TaskRow } from './TaskRow'
import { navigate } from './router'
import { ViewMenu } from './ViewsView'
import { isTyping, type ViewData } from './useViews'

export function DashboardView({ dashboard, data }: { dashboard: View; data: ViewData }) {
  const { views, projects, labels, ctx } = data
  const panelViews = useMemo(() => views.filter((v) => dashboard.panels.includes(v.id)), [views, dashboard.panels])
  const summaries = useMemo(() => evaluateViews(panelViews, ctx), [panelViews, ctx])
  const panels = useMemo(() => dashboardPanels(dashboard, views, summaries), [dashboard, views, summaries])
  const candidates = views.filter((v) => !isDashboard(v) && !dashboard.panels.includes(v.id))
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const labelMap = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels])
  const nameOf = (id: string) => views.find((v) => v.id === id)?.name ?? 'View removed'

  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [focusIdx, setFocusIdx] = useState<number | null>(null)
  const [selected, setSelected] = useState<{ panel: number; task: number } | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  const run = (fn: () => Promise<void>) => {
    setError(null)
    fn().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }
  const focusPanel = (i: number) => gridRef.current?.querySelector<HTMLElement>(`[data-panel-index="${i}"]`)?.focus()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e) || openId || document.querySelector('[role="dialog"]')) {
        if (e.key === 'Escape' && openId) setOpenId(null)
        return
      }
      const active = document.activeElement as HTMLElement | null
      const inGrid = !!active && !!gridRef.current?.contains(active)
      const onPage = !active || active === document.body
      if (e.key === 'Tab' && (inGrid || onPage) && panels.length > 0) {
        e.preventDefault()
        const cur = focusIdx ?? (e.shiftKey ? panels.length : -1)
        focusPanel((cur + (e.shiftKey ? panels.length - 1 : 1)) % panels.length)
        return
      }
      if (focusIdx === null || !inGrid) return
      const panel = panels[focusIdx]
      const tasks = panel?.kind === 'view' && panel.summary.ok ? panel.summary.tasks : []
      const cur = selected?.panel === focusIdx ? selected.task : -1
      switch (e.key) {
        case 'j':
        case 'ArrowDown':
          e.preventDefault()
          if (tasks.length) setSelected({ panel: focusIdx, task: Math.min(tasks.length - 1, cur + 1) })
          break
        case 'k':
        case 'ArrowUp':
          e.preventDefault()
          if (tasks.length) setSelected({ panel: focusIdx, task: Math.max(0, cur - 1) })
          break
        case 'Enter':
          e.preventDefault()
          if (cur >= 0 && tasks[cur]) setOpenId(tasks[cur].id)
          else if (panel?.kind === 'view') navigate({ view: 'view', id: panel.id })
          break
        case 'o':
          if (panel?.kind === 'view') navigate({ view: 'view', id: panel.id })
          break
        case 'c':
          if (cur >= 0 && tasks[cur]) void setTaskCompleted(tasks[cur].id, !tasks[cur].completed_at)
          break
        case 'Escape':
          setSelected(null)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panels, focusIdx, selected, openId])

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1 px-4 py-5 md:px-8">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-faint" aria-hidden>▦</span>
          <h1 className="truncate text-xl font-semibold">{dashboard.name}</h1>
          <span className="text-sm text-faint">{panels.length}/{MAX_PANELS}</span>
          <span className="flex-1" />
          <select className="input w-auto py-1 text-xs" aria-label="Add panel" value="" disabled={panels.length >= MAX_PANELS || candidates.length === 0}
            onChange={(e) => { const id = e.target.value; if (id) run(() => addPanel(dashboard.id, id)) }}>
            <option value="">{panels.length >= MAX_PANELS ? 'Six panels at most' : candidates.length === 0 ? 'No view to add' : '+ Add panel…'}</option>
            {candidates.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <button className="btn-ghost px-2 py-1 text-xs" aria-expanded={editing} onClick={() => setEditing((x) => !x)}>{editing ? 'Done' : 'Arrange'}</button>
          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => void setPinned(dashboard.id, !dashboard.pinned)}>{dashboard.pinned ? 'Unpin' : 'Pin'}</button>
          <ViewMenu view={dashboard} />
        </div>
        {error && <p role="alert" className="mb-3 text-xs text-red-600 dark:text-red-400">{error}</p>}
        {editing && (
          <ol className="mb-4 space-y-1 rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-800" aria-label="Arrange panels">
            {dashboard.panels.map((id, i) => (
              <li key={id} className="flex items-center gap-2">
                <span className="w-5 text-right text-xs text-faint">{i + 1}</span>
                <span className="flex-1 truncate">{nameOf(id)}</span>
                <button className="btn-ghost px-2 py-0.5 text-xs" disabled={i === 0} aria-label={`Move ${nameOf(id)} earlier`} onClick={() => run(() => movePanel(dashboard.id, id, -1))}>↑</button>
                <button className="btn-ghost px-2 py-0.5 text-xs" disabled={i === dashboard.panels.length - 1} aria-label={`Move ${nameOf(id)} later`} onClick={() => run(() => movePanel(dashboard.id, id, 1))}>↓</button>
                <button className="btn-danger px-2 py-0.5 text-xs" aria-label={`Remove ${nameOf(id)} from the dashboard`} onClick={() => run(() => removePanel(dashboard.id, id))}>Remove</button>
              </li>
            ))}
            {dashboard.panels.length === 0 && <li className="text-xs text-faint">No panels yet.</li>}
          </ol>
        )}
        {panels.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-muted dark:border-slate-700">
            Add up to six saved views with “Add panel”.
          </p>
        ) : (
          <div ref={gridRef} className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {panels.map((p, i) => (
              <Panel key={p.id} index={i} panel={p} selectedTask={selected?.panel === i ? selected.task : -1}
                projectMap={projectMap} labelMap={labelMap}
                onFocus={() => setFocusIdx(i)} onBlur={() => setFocusIdx((x) => (x === i ? null : x))}
                onOpenTask={(id) => setOpenId(id)} onRemove={() => run(() => removePanel(dashboard.id, p.id))} />
            ))}
          </div>
        )}
      </div>
      {openId && (
        <TaskDetail key={openId} taskId={openId} projects={projects} labelMap={labelMap} onClose={() => setOpenId(null)}
          onOpen={(id) => setOpenId(id)} onToggleComplete={(t) => void setTaskCompleted(t.id, !t.completed_at)} />
      )}
    </div>
  )
}

function Panel({ index, panel, selectedTask, projectMap, labelMap, onFocus, onBlur, onOpenTask, onRemove }: {
  index: number
  panel: PanelState
  selectedTask: number
  projectMap: Map<string, Project>
  labelMap: Map<string, Label>
  onFocus: () => void
  onBlur: () => void
  onOpenTask: (id: string) => void
  onRemove: () => void
}) {
  const ring = 'rounded-xl border border-slate-200 p-3 outline-none focus-within:ring-2 focus-within:ring-emerald-500/60 dark:border-slate-800'
  if (panel.kind === 'removed') {
    return (
      <section data-panel-index={index} tabIndex={0} onFocus={onFocus} onBlur={onBlur} aria-label="Removed view" className={`${ring} border-dashed`}>
        <p className="text-sm font-medium text-muted">View removed</p>
        <p className="mt-1 text-xs text-faint">The saved view shown here was deleted.</p>
        <button className="btn-ghost mt-2 border border-slate-300 text-xs dark:border-slate-700" tabIndex={-1} onClick={onRemove}>Remove panel</button>
      </section>
    )
  }
  const { view, summary } = panel
  return (
    <section data-panel-index={index} tabIndex={0} onFocus={onFocus} onBlur={onBlur} aria-label={view.name} className={ring}>
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: view.color }} aria-hidden />
        <h2 className="truncate text-sm font-semibold">{view.name}</h2>
        {summary.ok && <span className="text-sm text-faint" aria-label={`${summary.count} open tasks`}>{summary.count}</span>}
        <span className="flex-1" />
        <button className="btn-ghost px-2 py-0.5 text-xs" tabIndex={-1} onClick={() => navigate({ view: 'view', id: view.id })}>Open view</button>
      </div>
      {!summary.ok ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">{summary.error}</p>
      ) : summary.tasks.length === 0 ? (
        <p className="px-2 py-3 text-xs text-faint">Nothing here.</p>
      ) : (
        <ul>
          {summary.tasks.map((t, i) => (
            <TaskRow key={t.id} task={t} project={t.project_id ? projectMap.get(t.project_id) : undefined} labels={resolveLabels(t.labels, labelMap)}
              showProject selected={i === selectedTask} onToggle={() => void setTaskCompleted(t.id, !t.completed_at)} onOpen={() => onOpenTask(t.id)} />
          ))}
        </ul>
      )}
    </section>
  )
}
