// A dashboard (OpenSpec `custom-views`): a saved view of kind `dashboard` whose
// `panels` are other saved list views. Each panel shows the view's open-task count and
// first tasks; all panels are evaluated in one pass. Tab / Shift+Tab move between
// panels, j / k move inside one. A panel whose view has an on-drop rule (rule-boards)
// is a drop target: dragging a card onto it, or Shift+← / Shift+→, applies the rule.
import { blockedMap } from '../lib/dependencies'
import { beginDrag } from '../lib/dnd'
import { Badge, Button, Icon, PageBody, PageHeader, ReadAs, Tooltip } from '../ui'
import { useId, useMemo, useRef, useState } from 'react'
import { resolveLabels } from '../lib/labels'
import { hasTimeColumn } from '../lib/rowTime'
import { useLiveSections } from '../lib/localData'
import { setTaskCompleted } from '../lib/ops'
import { describeRule, type RuleNames } from '../lib/rules'
import type { Label, Project, Task, View } from '../lib/types'
import { MAX_PANELS, addPanel, dashboardPanels, evaluateViews, isDashboard, movePanel, removePanel, type PanelState } from '../lib/views'
import { RuleEditor } from './RuleEditor'
import { useBoardDrop } from './useBoardDrop'
import { setPanelTaskId, usePanelTaskId } from './panel'
import { TaskRow } from './TaskRow'
import { navigate } from './router'
import { ViewMenu } from './ViewsView'
import type { ViewData } from './useViews'
import { isActivationTarget, useShortcutScope } from './shortcuts'
import { t } from '../lib/i18n'
import { act } from './actionError'

export function DashboardView({ dashboard, data }: { dashboard: View; data: ViewData }) {
  const { views, projects, labels, ctx } = data
  const panelViews = useMemo(() => views.filter((v) => dashboard.panels.includes(v.id)), [views, dashboard.panels])
  const summaries = useMemo(() => evaluateViews(panelViews, ctx), [panelViews, ctx])
  const panels = useMemo(() => dashboardPanels(dashboard, views, summaries), [dashboard, views, summaries])
  const candidates = views.filter((v) => !isDashboard(v) && !dashboard.panels.includes(v.id))
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const labelMap = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels])
  const blocked = useMemo(() => blockedMap(ctx.tasks), [ctx.tasks])
  const nameOf = (id: string) => views.find((v) => v.id === id)?.name ?? t('View removed')
  const sections = useLiveSections()
  const names = useMemo<RuleNames>(() => ({ labels, projects, sections }), [labels, projects, sections])
  const { held, drop } = useBoardDrop(panels, ctx, sections)
  // A panel takes drops when its view's rule changes something (the same test the panel shows).
  const isTarget = (v: View) => !!describeRule(v.on_drop, names)
  // What each panel lists: its held card first (rule-boards D6), then its first tasks.
  const lists = useMemo(() => panels.map((p) => {
    if (p.kind !== 'view' || !p.summary.ok) return []
    const h = held.get(p.id)
    return h ? [h, ...p.summary.tasks] : p.summary.tasks
  }), [panels, held])

  const [editing, setEditing] = useState(false)
  const [ruleFor, setRuleFor] = useState<View | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [focusIdx, setFocusIdx] = useState<number | null>(null)
  // The selection is a task id within a panel, so a card moved by a rule stays selected.
  const [selected, setSelected] = useState<{ panel: number; id: string } | null>(null)
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
    const tasks = lists[focusIdx] ?? []
    return { panel, tasks, cur: selected?.panel === focusIdx ? tasks.findIndex((tk) => tk.id === selected.id) : -1, at: focusIdx }
  }
  // Drop a task on panel `to` (rule-boards D5); the card stays selected there.
  const dropOn = (taskId: string, to: number) => {
    const p = panels[to]
    if (p?.kind !== 'view' || !isTarget(p.view)) return
    run(async () => {
      const id = await drop(taskId, p.view)
      if (id) { setSelected({ panel: to, id }); focusPanel(to) }
    })
  }
  // Shift+← / Shift+→: the nearest panel in that direction whose view has a rule.
  const moveSelected = (dir: -1 | 1) => {
    const f = focused()
    if (!f || f.cur < 0 || !f.tasks[f.cur]) return false
    for (let j = f.at + dir; j >= 0 && j < panels.length; j += dir) {
      const p = panels[j]
      if (p.kind === 'view' && isTarget(p.view)) { dropOn(f.tasks[f.cur].id, j); return }
    }
  }
  useShortcutScope('view', {
    'dashboard.panels': (e) => {
      const { inGrid, onPage } = grid()
      if (openId || !(inGrid || onPage) || panels.length === 0) return false
      const cur = focusIdx ?? (e.shiftKey ? panels.length : -1)
      focusPanel((cur + (e.shiftKey ? panels.length - 1 : 1)) % panels.length)
    },
    'dashboard.down': () => { const f = focused(); if (!f || !f.tasks.length) return false; setSelected({ panel: f.at, id: f.tasks[Math.min(f.tasks.length - 1, f.cur + 1)].id }) },
    'dashboard.up': () => { const f = focused(); if (!f || !f.tasks.length) return false; setSelected({ panel: f.at, id: f.tasks[Math.max(0, f.cur - 1)].id }) },
    'dashboard.move-prev': () => moveSelected(-1),
    'dashboard.move-next': () => moveSelected(1),
    'dashboard.open': (e) => {
      const f = focused()
      if (!f || isActivationTarget(e.target)) return false
      if (f.cur >= 0 && f.tasks[f.cur]) setOpenId(f.tasks[f.cur].id)
      else if (f.panel?.kind === 'view') navigate({ view: 'view', id: f.panel.id })
    },
    'dashboard.open-view': () => { const f = focused(); if (f?.panel?.kind !== 'view') return false; navigate({ view: 'view', id: f.panel.id }) },
    'dashboard.complete': () => { const f = focused(); if (!f || f.cur < 0 || !f.tasks[f.cur]) return false; act(setTaskCompleted(f.tasks[f.cur].id, !f.tasks[f.cur].completed_at)) },
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
            <select className="ui-input w-auto py-1 text-meta" aria-label={t('Add panel')} value="" disabled={panels.length >= MAX_PANELS || candidates.length === 0}
              onChange={(e) => { const id = e.target.value; if (id) run(() => addPanel(dashboard.id, id)) }}>
              <option value="">{panels.length >= MAX_PANELS ? t('Six panels at most') : candidates.length === 0 ? t('No filter to add') : t('+ Add panel…')}</option>
              {candidates.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <Button variant="ghost" size="sm" aria-expanded={editing} onClick={() => setEditing((x) => !x)}>{editing ? t('Done') : t('Arrange')}</Button>
          </>}
          menu={<ViewMenu view={dashboard} />} />
        {error && <p role="alert" className="mb-3 text-meta text-danger">{error}</p>}
        {editing && (
          <ol className="mb-4 space-y-1 rounded-control border border-default p-2 text-body" aria-label={t('Arrange panels')}>
            {dashboard.panels.map((id, i) => (
              <li key={id} className="flex items-center gap-2">
                <span className="w-5 text-right text-meta text-faint">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{nameOf(id)}</span>
                <ArrangeRule view={views.find((v) => v.id === id && !v.deleted_at && !isDashboard(v))} names={names} onEdit={setRuleFor} />
                <button className="ui-btn ui-btn--ghost ui-btn--sm px-2 py-0.5 text-meta" disabled={i === 0} aria-label={t('Move {nameOf} earlier', { nameOf: nameOf(id) })} onClick={() => run(() => movePanel(dashboard.id, id, -1))}><Icon name="arrow-up" /></button>
                <button className="ui-btn ui-btn--ghost ui-btn--sm px-2 py-0.5 text-meta" disabled={i === dashboard.panels.length - 1} aria-label={t('Move {nameOf} later', { nameOf: nameOf(id) })} onClick={() => run(() => movePanel(dashboard.id, id, 1))}><Icon name="arrow-down" /></button>
                <button className="ui-btn ui-btn--danger ui-btn--sm px-2 py-0.5 text-meta" aria-label={t('Remove {nameOf} from the dashboard', { nameOf: nameOf(id) })} onClick={() => run(() => removePanel(dashboard.id, id))}>{t('Remove')}</button>
              </li>
            ))}
            {dashboard.panels.length === 0 && <li className="text-meta text-faint">{t('No panels yet.')}</li>}
          </ol>
        )}
        {ruleFor && <RuleEditor view={ruleFor} labels={labels} projects={projects} sections={sections} onClose={() => setRuleFor(null)} />}
        {panels.length === 0 ? (
          <p className="rounded-control border border-dashed border-input p-6 text-center text-body text-muted">
            {t('Add up to six saved filters with “Add panel”.')}
          </p>
        ) : (
          <div ref={gridRef} className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {panels.map((p, i) => (
              <Panel key={p.id} index={i} panel={p} blocked={blocked} selectedId={selected?.panel === i ? selected.id : null}
                tasks={lists[i]} held={held.get(p.id) ?? null} names={names} projectMap={projectMap} labelMap={labelMap}
                onDragTask={(task, e) => beginDrag(e, {
                  label: task.title,
                  onDrop: (target) => {
                    const to = panels.findIndex((x) => `panel:${x.id}` === target)
                    if (to >= 0 && to !== i) dropOn(task.id, to)
                  },
                })}
                onFocus={() => setFocusIdx(i)} onBlur={() => setFocusIdx((x) => (x === i ? null : x))}
                onOpenTask={(id) => setOpenId(id)} onRemove={() => run(() => removePanel(dashboard.id, p.id))} />
            ))}
          </div>
        )}
    </PageBody>
  )
}

/** The Arrange row's rule wording and its Rule button (rule-boards D7). */
function ArrangeRule({ view, names, onEdit }: { view: View | undefined; names: RuleNames; onEdit: (v: View) => void }) {
  if (!view) return null
  const text = describeRule(view.on_drop, names)
  return (
    <>
      {text && <span className="hidden max-w-56 truncate text-meta text-muted sm:inline">{text}</span>}
      <button className="ui-btn ui-btn--ghost ui-btn--sm px-2 py-0.5 text-meta" aria-label={t('Rule for {name}', { name: view.name })} onClick={() => onEdit(view)}>
        <Icon name="zap" />{t('Rule')}
      </button>
    </>
  )
}

function Panel({ index, panel, selectedId, tasks, held, names, projectMap, labelMap, blocked, onFocus, onBlur, onOpenTask, onRemove, onDragTask }: {
  blocked: Map<string, number>
  index: number
  panel: PanelState
  selectedId: string | null
  tasks: Task[]
  held: Task | null
  names: RuleNames
  onDragTask: (task: Task, e: React.PointerEvent<HTMLLIElement>) => void
  projectMap: Map<string, Project>
  labelMap: Map<string, Label>
  onFocus: () => void
  onBlur: () => void
  onOpenTask: (id: string) => void
  onRemove: () => void
}) {
  const ruleId = useId()
  const ring = 'rounded-card border border-default p-3 outline-none focus-within:ring-2 focus-within:ring-focus/60'
  if (panel.kind === 'removed') {
    return (
      <section data-panel-index={index} tabIndex={0} onFocus={onFocus} onBlur={onBlur} aria-label={t('Removed view')} className={`${ring} border-dashed`}>
        <p className="text-body font-medium text-muted">{t('View removed')}</p>
        <p className="mt-1 text-meta text-faint">{t('The saved view shown here was deleted.')}</p>
        <button className="ui-btn ui-btn--ghost ui-btn--sm mt-2 border border-input text-meta" tabIndex={-1} onClick={onRemove}>{t('Remove panel')}</button>
      </section>
    )
  }
  const { view, summary } = panel
  // A rule whose only parts name deleted labels changes nothing, so it makes no target either.
  const rule = describeRule(view.on_drop, names)
  const ruled = !!rule
  // The time column (rows-v2 D2): one fact of the panel's list.
  const timeColumn = hasTimeColumn(tasks)
  return (
    <section data-panel-index={index} tabIndex={0} onFocus={onFocus} onBlur={onBlur} aria-label={view.name} aria-describedby={ruled ? ruleId : undefined}
      data-drop-target={ruled ? `panel:${view.id}` : undefined} data-has-rule={ruled ? '' : undefined}
      className={`${ring} data-drop-active:ring-2 data-drop-active:ring-accent`}>
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: view.color }} aria-hidden />
        <h2 className="truncate text-body font-semibold">{view.name}</h2>
        {summary.ok && <span className="text-body text-faint"><ReadAs label={t('{count} open tasks', { count: summary.count })}>{summary.count}</ReadAs></span>}
        {rule && (
          <Tooltip label={t('On drop: {rule}', { rule })}>
            <span className="inline-flex text-faint" tabIndex={-1} data-rule-icon><Icon name="zap" /></span>
          </Tooltip>
        )}
        {rule && <span id={ruleId} className="sr-only">{t('On drop: {rule}', { rule })}</span>}
        <span className="flex-1" />
        <button className="ui-btn ui-btn--ghost ui-btn--sm px-2 py-0.5 text-meta" tabIndex={-1} onClick={() => navigate({ view: 'view', id: view.id })}>{t('Open view')}</button>
      </div>
      {!summary.ok ? (
        <p role="alert" className="text-meta text-danger">{summary.error}</p>
      ) : tasks.length === 0 ? (
        <p className="px-2 py-3 text-meta text-faint">{t('Nothing here.')}</p>
      ) : (
        <ul>
          {tasks.map((tk) => {
            const row = (
              <TaskRow key={tk.id} task={tk} project={tk.project_id ? projectMap.get(tk.project_id) : undefined} labels={resolveLabels(tk.labels, labelMap)}
                showProject selected={tk.id === selectedId} timeColumn={timeColumn} blockedBy={blocked.get(tk.id)} onToggle={() => act(setTaskCompleted(tk.id, !tk.completed_at))} onOpen={() => onOpenTask(tk.id)}
                onPointerDown={(e) => onDragTask(tk, e)} />
            )
            // A held card (rule-boards D6): shown first, marked, until it matches or changes again.
            return tk !== held ? row : (
              <li key={tk.id} data-held className="rounded-control border border-dashed border-input pt-1">
                <Badge hue="orange" className="ml-2">{t('Not matching')}</Badge>
                <ul>{row}</ul>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
