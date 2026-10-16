// A dashboard (OpenSpec `custom-views`): a saved view of kind `dashboard` whose
// `panels` are other saved list views. Each panel shows the view's open-task count and
// first tasks; all panels are evaluated in one pass. Tab / Shift+Tab move between
// panels, j / k move inside one.
import { blockedMap } from '../lib/dependencies'
import { Button, Icon, PageBody, PageHeader } from '../ui'
import { useMemo, useRef, useState } from 'react'
import { resolveLabels } from '../lib/labels'
import { setTaskCompleted } from '../lib/ops'
import type { Label, Project, View } from '../lib/types'
import { MAX_PANELS, addPanel, dashboardPanels, evaluateViews, isDashboard, movePanel, removePanel, type PanelState } from '../lib/views'
import { setPanelTaskId, usePanelTaskId } from './panel'
import { TaskRow } from './TaskRow'
import { navigate } from './router'
import { ViewMenu } from './ViewsView'
import type { ViewData } from './useViews'
import { isActivationTarget, useShortcutScope } from './shortcuts'

export function DashboardView({ dashboard, data }: { dashboard: View; data: ViewData }) {
  const { views, projects, labels, ctx } = data
  const panelViews = useMemo(() => views.filter((v) => dashboard.panels.includes(v.id)), [views, dashboard.panels])
  const summaries = useMemo(() => evaluateViews(panelViews, ctx), [panelViews, ctx])
  const panels = useMemo(() => dashboardPanels(dashboard, views, summaries), [dashboard, views, summaries])
  const candidates = views.filter((v) => !isDashboard(v) && !dashboard.panels.includes(v.id))
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const labelMap = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels])
  const blocked = useMemo(() => blockedMap(ctx.tasks), [ctx.tasks])
  const nameOf = (id: string) => views.find((v) => v.id === id)?.name ?? 'View removed'

  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [focusIdx, setFocusIdx] = useState<number | null>(null)
  const [selected, setSelected] = useState<{ panel: number; task: number } | null>(null)
  const openId = usePanelTaskId()
  const setOpenId = setPanelTaskId
  const gridRef = useRef<HTMLDivElement>(null)

  const run = (fn: () => Promise<void>) => {
    setError(null)
    fn().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }
  const focusPanel = (i: number) => gridRef.current?.querySelector<HTMLElement>(`[data-panel-index="${i}"]`)?.focus()

  // The dashboard's `view` scope: Tab moves between panels, j / k inside the focused
  // panel, Enter opens, o opens the view, c completes, Esc clears; nothing while a task is open.
  const grid = () => {
    const active = document.activeElement as HTMLElement | null
    return { inGrid: !!active && !!gridRef.current?.contains(active), onPage: !active || active === document.body }
  }
  const focused = () => {
    if (openId || focusIdx === null || !grid().inGrid) return null
    const panel = panels[focusIdx]
    const tasks = panel?.kind === 'view' && panel.summary.ok ? panel.summary.tasks : []
    return { panel, tasks, cur: selected?.panel === focusIdx ? selected.task : -1, at: focusIdx }
  }
  useShortcutScope('view', {
    'dashboard.panels': (e) => {
      const { inGrid, onPage } = grid()
      if (openId || !(inGrid || onPage) || panels.length === 0) return false
      const cur = focusIdx ?? (e.shiftKey ? panels.length : -1)
      focusPanel((cur + (e.shiftKey ? panels.length - 1 : 1)) % panels.length)
    },
    'dashboard.down': () => { const f = focused(); if (!f || !f.tasks.length) return false; setSelected({ panel: f.at, task: Math.min(f.tasks.length - 1, f.cur + 1) }) },
    'dashboard.up': () => { const f = focused(); if (!f || !f.tasks.length) return false; setSelected({ panel: f.at, task: Math.max(0, f.cur - 1) }) },
    'dashboard.open': (e) => {
      const f = focused()
      if (!f || isActivationTarget(e.target)) return false
      if (f.cur >= 0 && f.tasks[f.cur]) setOpenId(f.tasks[f.cur].id)
      else if (f.panel?.kind === 'view') navigate({ view: 'view', id: f.panel.id })
    },
    'dashboard.open-view': () => { const f = focused(); if (f?.panel?.kind !== 'view') return false; navigate({ view: 'view', id: f.panel.id }) },
    'dashboard.complete': () => { const f = focused(); if (!f || f.cur < 0 || !f.tasks[f.cur]) return false; void setTaskCompleted(f.tasks[f.cur].id, !f.tasks[f.cur].completed_at) },
    'dashboard.escape': () => {
      if (openId) { setOpenId(null); return }
      if (!focused()) return false
      setSelected(null)
    },
  }, { view: 'dashboard' })

  return (
    <PageBody width="full">
        <PageHeader title={dashboard.name} icon="kanban" meta={`${panels.length}/${MAX_PANELS}`} help="dashboard"
          actions={<>
            <select className="ui-input w-auto py-1 text-meta" aria-label="Add panel" value="" disabled={panels.length >= MAX_PANELS || candidates.length === 0}
              onChange={(e) => { const id = e.target.value; if (id) run(() => addPanel(dashboard.id, id)) }}>
              <option value="">{panels.length >= MAX_PANELS ? 'Six panels at most' : candidates.length === 0 ? 'No filter to add' : '+ Add panel…'}</option>
              {candidates.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <Button variant="ghost" size="sm" aria-expanded={editing} onClick={() => setEditing((x) => !x)}>{editing ? 'Done' : 'Arrange'}</Button>
          </>}
          menu={<ViewMenu view={dashboard} />} />
        {error && <p role="alert" className="mb-3 text-xs text-danger">{error}</p>}
        {editing && (
          <ol className="mb-4 space-y-1 rounded-lg border border-default p-2 text-sm" aria-label="Arrange panels">
            {dashboard.panels.map((id, i) => (
              <li key={id} className="flex items-center gap-2">
                <span className="w-5 text-right text-xs text-faint">{i + 1}</span>
                <span className="flex-1 truncate">{nameOf(id)}</span>
                <button className="btn-ghost px-2 py-0.5 text-xs" disabled={i === 0} aria-label={`Move ${nameOf(id)} earlier`} onClick={() => run(() => movePanel(dashboard.id, id, -1))}><Icon name="arrow-up" /></button>
                <button className="btn-ghost px-2 py-0.5 text-xs" disabled={i === dashboard.panels.length - 1} aria-label={`Move ${nameOf(id)} later`} onClick={() => run(() => movePanel(dashboard.id, id, 1))}><Icon name="arrow-down" /></button>
                <button className="btn-danger px-2 py-0.5 text-xs" aria-label={`Remove ${nameOf(id)} from the dashboard`} onClick={() => run(() => removePanel(dashboard.id, id))}>Remove</button>
              </li>
            ))}
            {dashboard.panels.length === 0 && <li className="text-xs text-faint">No panels yet.</li>}
          </ol>
        )}
        {panels.length === 0 ? (
          <p className="rounded-lg border border-dashed border-input p-6 text-center text-sm text-muted">
            Add up to six saved filters with “Add panel”.
          </p>
        ) : (
          <div ref={gridRef} className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {panels.map((p, i) => (
              <Panel key={p.id} index={i} panel={p} blocked={blocked} selectedTask={selected?.panel === i ? selected.task : -1}
                projectMap={projectMap} labelMap={labelMap}
                onFocus={() => setFocusIdx(i)} onBlur={() => setFocusIdx((x) => (x === i ? null : x))}
                onOpenTask={(id) => setOpenId(id)} onRemove={() => run(() => removePanel(dashboard.id, p.id))} />
            ))}
          </div>
        )}
    </PageBody>
  )
}

function Panel({ index, panel, selectedTask, projectMap, labelMap, blocked, onFocus, onBlur, onOpenTask, onRemove }: {
  blocked: Map<string, number>
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
  const ring = 'rounded-xl border border-default p-3 outline-none focus-within:ring-2 focus-within:ring-focus/60'
  if (panel.kind === 'removed') {
    return (
      <section data-panel-index={index} tabIndex={0} onFocus={onFocus} onBlur={onBlur} aria-label="Removed view" className={`${ring} border-dashed`}>
        <p className="text-sm font-medium text-muted">View removed</p>
        <p className="mt-1 text-xs text-faint">The saved view shown here was deleted.</p>
        <button className="btn-ghost mt-2 border border-input text-xs" tabIndex={-1} onClick={onRemove}>Remove panel</button>
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
        <p role="alert" className="text-xs text-danger">{summary.error}</p>
      ) : summary.tasks.length === 0 ? (
        <p className="px-2 py-3 text-xs text-faint">Nothing here.</p>
      ) : (
        <ul>
          {summary.tasks.map((t, i) => (
            <TaskRow key={t.id} task={t} project={t.project_id ? projectMap.get(t.project_id) : undefined} labels={resolveLabels(t.labels, labelMap)}
              showProject selected={i === selectedTask} blockedBy={blocked.get(t.id)} onToggle={() => void setTaskCompleted(t.id, !t.completed_at)} onOpen={() => onOpenTask(t.id)} />
          ))}
        </ul>
      )}
    </section>
  )
}
