// Display mode (OpenSpec change display-mode, design D3–D5): one view, full
// screen, large type and a clock, for a tablet on the fridge or a wall panel.
// It replaces the shell (no sidebar, quick add, panel or shell shortcuts) while
// sync keeps running, renders from the device's copy through the same selections
// as the lists (lib/dayLists.ts, runView), and writes only the completions the
// account may make. Presentation options live in the URL and never in settings.
import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button, hueFor, Icon, MenuItem } from '../../ui'
import { completedToday, groupToday, nextDays, projectTasks, todayTasks, unarchivedTasks } from '../../lib/dayLists'
import { formatDate, formatTime } from '../../lib/dates'
import { db } from '../../lib/db'
import { blockedMap } from '../../lib/dependencies'
import { DISPLAY_SCALE, type DisplayOptions, type DisplayTarget, targetPath, displayQuery } from '../../lib/display'
import { setTaskCompleted } from '../../lib/ops'
import { groupBySection } from '../../lib/sections'
import { canEditTasks, roleOf } from '../../lib/sharing'
import { useSyncStatus } from '../../lib/sync'
import { buildTree, flattenTree } from '../../lib/tree'
import { visibleTasks } from '../../lib/trash'
import type { Membership, Project, Section, Task } from '../../lib/types'
import { runView, setStartView } from '../../lib/views'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import { Menu } from '../overlay/Menu'
import { navigate, type Route } from '../router'
import { useToday, useViewData } from '../useViews'

export interface DisplayRowData {
  task: Task
  depth: number
  /** Parent title next to a subtask in a flat list. */
  context?: string
}

export interface DisplayColumnData {
  key: string
  heading: string | null
  rows: DisplayRowData[]
  tone?: 'danger' | 'muted'
}

/** The normal route of a display target (Escape and Exit). */
export function normalRoute(t: DisplayTarget): Route {
  switch (t.kind) {
    case 'today': return { view: 'today' }
    case 'upcoming': return { view: 'upcoming' }
    case 'project': return { view: 'project', id: t.id }
    case 'view': return { view: 'view', id: t.id }
  }
}

/** The clock: hours and minutes, seconds unless turned off; re-rendered each second or minute. */
export function useClock(seconds: boolean): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const tick = () => setNow(new Date())
    const id = setInterval(tick, seconds ? 1000 : 60_000 - (Date.now() % 60_000))
    // Without seconds, align to the minute after the first tick.
    if (seconds) return () => clearInterval(id)
    let every: ReturnType<typeof setInterval> | undefined
    const first = setTimeout(() => { tick(); every = setInterval(tick, 60_000) }, 60_000 - (Date.now() % 60_000))
    clearInterval(id)
    return () => { clearTimeout(first); if (every) clearInterval(every) }
  }, [seconds])
  return now
}

export function Clock({ seconds }: { seconds: boolean }) {
  const now = useClock(seconds)
  const { resolved } = useDateTimeFormat()
  const text = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}), hour12: resolved.hour12 }).format(now)
  return <time data-display-clock dateTime={now.toISOString()} className="display-clock font-semibold tabular-nums text-strong">{text}</time>
}

function ago(ms: number, now: number): string {
  const m = Math.max(0, Math.round((now - ms) / 60000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`
}

export function DisplayColumn({ column, focusedId, editable, onFocus, onToggle }: {
  column: DisplayColumnData
  focusedId: string | null
  editable: (t: Task) => boolean
  onFocus: (id: string) => void
  onToggle: (t: Task) => void
}) {
  return (
    <section aria-label={column.heading ?? 'Tasks'} className="min-w-0" data-display-column={column.key}>
      {column.heading && <h2 className={`display-heading mb-2 font-semibold ${column.tone === 'danger' ? 'text-danger' : column.tone === 'muted' ? 'text-muted' : 'text-strong'}`}>{column.heading}</h2>}
      {column.rows.length === 0 ? <p className="display-text text-faint">Nothing here.</p> : (
        <ul className="divide-y divide-default rounded-card border border-default bg-surface">
          {column.rows.map((r) => <DisplayRow key={r.task.id} row={r} focused={focusedId === r.task.id} editable={editable(r.task)} onFocus={onFocus} onToggle={onToggle} />)}
        </ul>
      )}
    </section>
  )
}

function DisplayRow({ row, focused, editable, onFocus, onToggle }: {
  row: DisplayRowData
  focused: boolean
  editable: boolean
  onFocus: (id: string) => void
  onToggle: (t: Task) => void
}) {
  const t = row.task
  const done = !!t.completed_at
  const due = t.due ? `${formatDate(t.due.date, 'compact')}${t.due.time ? ` ${formatTime(t.due.time)}` : ''}` : null
  return (
    <li data-display-row={t.id} data-done={done || undefined} tabIndex={focused ? 0 : -1} aria-label={`${t.title || 'Untitled'}${due ? `, due ${due}` : ''}${t.priority < 4 ? `, priority ${t.priority}` : ''}${done ? ', done' : ''}${editable ? '' : ', read-only'}`}
      onFocus={() => onFocus(t.id)}
      className="display-row flex items-center gap-3 px-3 outline-none focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-focus"
      style={{ paddingLeft: `calc(0.75rem + ${row.depth} * 1.5em)` }}>
      {editable && (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center">
          <input type="checkbox" tabIndex={-1} className="display-check accent-(--ot-accent)" checked={done}
            aria-label={`${done ? 'Reopen' : 'Complete'} ${t.title || 'Untitled'}`} onChange={() => onToggle(t)} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={`display-text user-text block break-words ${done ? 'text-faint line-through' : 'text-default'}`}>{t.title || 'Untitled'}</span>
        {row.context && <span className="display-meta user-text block truncate text-muted">{row.context}</span>}
      </span>
      {due && <span className="display-meta shrink-0 tabular-nums text-muted">{due}</span>}
      {t.priority < 4 && <span className="display-meta shrink-0 font-semibold text-muted" data-priority={t.priority}>P{t.priority}</span>}
    </li>
  )
}

/** The display of one target with its options. */
export function DisplayScreen({ target, options }: { target: DisplayTarget; options: DisplayOptions }) {
  const today = useToday()
  const { resolved } = useDateTimeFormat()
  const sync = useSyncStatus()
  const now = useClock(false).getTime()
  const data = useViewData()
  const allTasks = useLiveQuery(() => visibleTasks(), [], [] as Task[])
  const projects = useLiveQuery(() => db.projects.filter((p) => !p.deleted_at).toArray(), [], [] as Project[])
  const sections = useLiveQuery(() => db.sections.toArray(), [], [] as Section[])
  const memberships = useLiveQuery(() => db.memberships.toArray(), [], [] as Membership[])
  const memberMap = useMemo(() => new Map(memberships.map((m) => [m.projectId, m])), [memberships])
  const loaded = useLiveQuery(() => db.projects.count().then(() => true), [], false)
  // A viewer of a shared project gets no checkboxes; the server refuses their writes anyway (D1).
  const editable = useCallback((t: Task) => canEditTasks(roleOf(t.project_id, memberMap)), [memberMap])
  const byId = useMemo(() => new Map(allTasks.map((t) => [t.id, t])), [allTasks])
  const ctx = (t: Task) => (t.parent_id ? byId.get(t.parent_id)?.title : undefined)

  // Root attributes for high contrast and no motion: on while shown, never stored.
  useLayoutEffect(() => {
    const root = document.documentElement
    if (options.contrast === 'high') root.setAttribute('data-contrast', 'high')
    if (options.motion === 'none') root.setAttribute('data-motion', 'none')
    root.setAttribute('data-display', '')
    return () => { root.removeAttribute('data-contrast'); root.removeAttribute('data-motion'); root.removeAttribute('data-display') }
  }, [options.contrast, options.motion])

  const project = target.kind === 'project' ? projects.find((p) => p.id === target.id) : undefined
  const view = target.kind === 'view' ? data.views.find((v) => v.id === target.id && !v.deleted_at) : undefined
  const flat = (t: Task): DisplayRowData => ({ task: t, depth: 0, context: ctx(t) })

  const { title, columns } = useMemo((): { title: string; columns: DisplayColumnData[] } => {
    const day = (iso: string) => formatDate(iso, 'heading', resolved, today)
    if (target.kind === 'today' || target.kind === 'upcoming') {
      const all = unarchivedTasks(allTasks, projects)
      const later = nextDays(all, today, options.days).map((d) => ({ key: d.date, heading: day(d.date), rows: d.tasks.map(flat) }))
      if (target.kind === 'upcoming') return { title: 'Upcoming', columns: later }
      const g = groupToday(todayTasks(all, today), today, blockedMap(allTasks))
      const main: DisplayColumnData[] = []
      if (g.overdue.length) main.push({ key: 'overdue', heading: 'Overdue', tone: 'danger', rows: g.overdue.map(flat) })
      main.push({ key: 'today', heading: 'Today', rows: [...g.day, ...g.evening, ...g.blocked].map(flat) })
      const done = completedToday(all, today)
      if (done.length) main.push({ key: 'done', heading: 'Done today', tone: 'muted', rows: done.map(flat) })
      return { title: day(today), columns: [...main, ...later] }
    }
    if (target.kind === 'project') {
      if (!project) return { title: '', columns: [] }
      // Sections in position order, each with its top-level tasks and their subtasks under them.
      const tree = buildTree(projectTasks(allTasks, project.id))
      const nodes = new Map(tree.roots.map((n) => [n.id, n]))
      const groups = groupBySection(project.id, tree.roots.map((n) => n.item), sections)
      const rowsOf = (t: Task): DisplayRowData[] => [{ task: t, depth: 0 }, ...flattenTree(nodes.get(t.id)?.children ?? []).map((c) => ({ task: c.item, depth: c.depth }))]
      const shown = groups.filter((g) => g.section || g.tasks.length)
      return {
        title: project.name,
        columns: shown.map((g) => ({ key: g.key || 'none', heading: g.section ? g.section.name : shown.length > 1 ? 'No section' : null, rows: g.tasks.flatMap(rowsOf) })),
      }
    }
    if (!view || view.kind === 'dashboard') return { title: view?.name ?? '', columns: [] }
    const res = runView(view, data.ctx)
    if (!res.ok) return { title: view.name, columns: [{ key: 'error', heading: null, rows: [] }] }
    return { title: view.name, columns: res.groups.map((g) => ({ key: g.key, heading: res.groups.length > 1 ? g.heading : null, rows: g.tasks.map(flat) })) }
  }, [target, allTasks, projects, sections, today, options.days, resolved, project, view, data.ctx]) // eslint-disable-line react-hooks/exhaustive-deps

  const order = useMemo(() => columns.flatMap((c) => c.rows.map((r) => r.task.id)), [columns])
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const focus = focusedId && order.includes(focusedId) ? focusedId : order[0] ?? null
  const rootRef = useRef<HTMLDivElement>(null)

  const toggle = useCallback((t: Task) => {
    if (!editable(t)) return
    void setTaskCompleted(t.id, !t.completed_at)
  }, [editable])

  // Keyboard (D5): rows by arrows, j / k, Home, End; Space or Enter toggles; Escape leaves.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (document.querySelector('[role="dialog"], [role="menu"]')) return
      const idx = focus ? order.indexOf(focus) : -1
      let next: string | null | undefined
      switch (e.key) {
        case 'ArrowDown': case 'ArrowRight': case 'j': next = order[Math.min(order.length - 1, idx + 1)]; break
        case 'ArrowUp': case 'ArrowLeft': case 'k': next = order[Math.max(0, idx - 1)]; break
        case 'Home': next = order[0]; break
        case 'End': next = order[order.length - 1]; break
        case ' ': case 'Enter': {
          const t = focus ? byId.get(focus) : undefined
          if (t) { e.preventDefault(); toggle(t) }
          return
        }
        case 'Escape':
          e.preventDefault()
          navigate(normalRoute(target))
          return
        default:
          return
      }
      e.preventDefault()
      if (next) {
        setFocusedId(next)
        rootRef.current?.querySelector<HTMLElement>(`[data-display-row="${next}"]`)?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [order, focus, byId, toggle, target])

  const missing = loaded && ((target.kind === 'project' && !project) || (target.kind === 'view' && (!view || view.kind === 'dashboard')))
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false
  const exit = () => navigate(normalRoute(target))
  const pin = () => void setStartView(`display:${targetPath(target)}${displayQuery(options, target)}`)

  return (
    <div ref={rootRef} data-display-screen={target.kind} className="display-root min-h-full bg-canvas text-default"
      style={{ ['--display-scale' as string]: DISPLAY_SCALE[options.size] }}>
      <div className="mx-auto w-full max-w-7xl px-4 py-5 md:px-8">
        {missing ? (
          <div className="space-y-3 py-10 text-center">
            <p className="display-heading font-semibold text-strong">{target.kind === 'project' ? 'This project no longer exists' : 'This view no longer exists'}</p>
            <Button variant="secondary" onClick={() => navigate({ view: 'inbox' })}>Go to the Inbox</Button>
          </div>
        ) : (
          <>
            <header className="mb-5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <h1 className="display-title user-text min-w-0 font-semibold text-strong">
                {project && <span className="mr-2 inline-block h-[0.6em] w-[0.6em] rounded-full bg-hue-solid align-middle" data-hue={hueFor(project.color)} aria-hidden />}
                {title}
              </h1>
              <Clock seconds={options.seconds} />
            </header>
            <div className="grid gap-5 md:grid-cols-[repeat(auto-fit,minmax(16rem,1fr))]">
              {columns.map((c) => <DisplayColumn key={c.key} column={c} focusedId={focus} editable={editable} onFocus={setFocusedId} onToggle={toggle} />)}
            </div>
            <p className="display-meta mt-5 text-faint" role="status" data-display-synced>
              {offline || sync.state === 'offline' ? `Offline. Last synced ${sync.lastSyncedAt ? ago(sync.lastSyncedAt, now) : 'not yet'}.` : sync.lastSyncedAt ? `Last synced ${ago(sync.lastSyncedAt, now)}` : ''}
            </p>
          </>
        )}
      </div>
      <div className="fixed bottom-3 right-3 flex items-center gap-1 opacity-60 hover:opacity-100 focus-within:opacity-100">
        <Button variant="ghost" size="sm" className="min-h-11 min-w-11" onClick={exit} data-display-exit>
          <Icon name="x" size="sm" />Exit
        </Button>
        <Menu kind="menu" label="Display options" title="Display" align="end"
          trigger={<Icon name="ellipsis" />} triggerClassName="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon min-h-11 min-w-11">
          <MenuItem label="Make this the start view on this device" icon="pin" onSelect={pin} />
        </Menu>
      </div>
    </div>
  )
}
