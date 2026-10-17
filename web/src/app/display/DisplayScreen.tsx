// Display mode (OpenSpec change display-mode): one view without the shell, in
// large type, for a tablet on the fridge or an e-ink panel. It reads the device's
// local copy like every list (useLiveQuery), so it follows other devices over the
// live channel and keeps working offline; the lists come from lib/dayLists, the
// same functions the list screen uses. Presentation options come from the URL;
// high contrast and no motion are attributes on the document root, set while
// the display is shown and removed when it leaves (design D4).
import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useMemo } from 'react'
import { Icon, MenuItem } from '../../ui'
import { db } from '../../lib/db'
import { completedOn, groupToday, nextDays, projectOpenList, todayList, withoutArchived } from '../../lib/dayLists'
import { describeDue, formatTime, localDueOf, todayISO } from '../../lib/dates'
import { blockedMap } from '../../lib/dependencies'
import { setTaskCompleted } from '../../lib/ops'
import { groupBySection } from '../../lib/sections'
import { canEditTask, memberName } from '../../lib/sharing'
import { breadcrumbOf, buildTaskTree } from '../../lib/subtasks'
import { useSyncStatus } from '../../lib/sync'
import { visibleTasks } from '../../lib/trash'
import { flattenTree, type TreeNode } from '../../lib/tree'
import type { Label, Membership, Project, Section, Task, View } from '../../lib/types'
import { inLater, isDashboard, runView, setStartView } from '../../lib/views'
import { useOnline } from '../../lib/online'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import { Menu } from '../overlay/Menu'
import { navigate, routePath, type Route } from '../router'
import { useStartView, useViewerZone } from '../useViews'
import { Clock, useNow } from './Clock'
import { DisplayColumn, type DisplayRowData } from './DisplayColumn'
import { defaultDays, type DisplayTarget } from './displayOptions'
import { useDisplayKeys, useRootPresentation, useWakeLock } from './displayHooks'
import { t } from '../../lib/i18n'
import { act } from '../actionError'

export type DisplayRoute = Extract<Route, { view: 'display' }>

interface Group {
  id: string
  heading?: string | null
  rows: DisplayRowData[]
  empty?: string
}

interface Content {
  title: string
  /** The project or view is gone (or the display cannot show it). */
  missing?: { message: string }
  groups: Group[]
  columns: Group[]
}

/** The normal app route for a display's target (Escape and Exit go there). */
export function normalRoute(target: DisplayTarget): Route {
  switch (target.kind) {
    case 'today':
    case 'upcoming':
      return { view: target.kind }
    case 'project':
      return { view: 'project', id: target.id }
    case 'view':
      return { view: 'view', id: target.id }
  }
}

/** "Last synced 5 min ago", from the sync snapshot and the clock. */
export function lastSyncedLabel(lastSyncedAt: number | null, now: number): string {
  if (lastSyncedAt === null) return t('Not synced since this screen opened')
  const min = Math.floor(Math.max(0, now - lastSyncedAt) / 60_000)
  if (min < 1) return t('Last synced just now')
  if (min < 60) return t('Last synced {m} min ago', { m: min })
  return t('Last synced {h} h ago', { h: Math.floor(min / 60) })
}

export function DisplayScreen({ route }: { route: DisplayRoute }) {
  const { target, options } = route
  const now = useNow(options.seconds)
  const today = todayISO(new Date(now))
  const zone = useViewerZone()
  const dt = useDateTimeFormat()
  useRootPresentation(options)
  useWakeLock()

  const projects = useLiveQuery(() => db.projects.toArray(), [], undefined as Project[] | undefined)
  const tasks = useLiveQuery(() => visibleTasks(), [], [] as Task[])
  const memberships = useLiveQuery(() => db.memberships.toArray(), [], [] as Membership[])
  const labels = useLiveQuery(() => db.labels.toArray(), [], [] as Label[])
  const views = useLiveQuery(() => db.views.toArray(), [], undefined as View[] | undefined)
  const projectId = target.kind === 'project' ? target.id : null
  const sections = useLiveQuery(
    () => (projectId ? db.sections.where('project_id').equals(projectId).toArray() : Promise.resolve([] as Section[])), [projectId], [] as Section[],
  )
  const memberMap = useMemo(() => new Map(memberships.map((m) => [m.projectId, m])), [memberships])
  const taskMap = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks])
  const blocked = useMemo(() => blockedMap(tasks), [tasks])

  const content = useMemo<Content | null>(() => {
    if (!projects) return null
    const live = projects.filter((p) => !p.deleted_at)
    const all = withoutArchived(tasks, live, projectId ?? undefined)

    /** A due label without what the heading already says (today in Today, the column's day). */
    const dueLabel = (tk: Task, day?: string): string | null => {
      if (!tk.due) return null
      const local = localDueOf(tk.due)
      if (local.date === (day ?? today)) return local.time ? formatTime(local.time, dt.resolved) : null
      return describeDue(tk.due, today, undefined, dt.resolved)?.label ?? null
    }
    const toRow = (task: Task, group: string, o: { day?: string; depth?: number } = {}): DisplayRowData => {
      const shared = !!task.project_id && memberMap.has(task.project_id)
      const assignee = shared && task.assignee_id ? memberName(task.assignee_id, memberMap) : null
      const parent = !o.depth && task.parent_id ? breadcrumbOf(task, taskMap) : null
      const due = dueLabel(task, o.day)
      return {
        key: `${group}:${task.id}`, id: task.id, title: task.title, done: task.completed_at !== null, priority: task.priority, due,
        overdue: !!task.due && localDueOf(task.due).date < today, context: [parent, assignee].filter(Boolean).join(' · ') || null,
        depth: o.depth, editable: canEditTask(task, memberMap),
      }
    }
    const columns = (days: number): Group[] => nextDays(all, today, days).map(({ date, tasks: list }) => ({
      id: date, heading: dt.formatDate(date, 'heading'), rows: list.map((task) => toRow(task, date, { day: date })), empty: t('Nothing planned'),
    }))

    switch (target.kind) {
      case 'today': {
        const g = groupToday(todayList(all, today), today, blocked)
        const groups: Group[] = [
          { id: 'overdue', heading: t('Overdue'), rows: g.overdue.map((task) => toRow(task, 'overdue')) },
          { id: 'today', heading: t('Today'), rows: g.day.map((task) => toRow(task, 'today')), empty: g.overdue.length || g.evening.length ? undefined : t('Nothing left for today') },
          { id: 'evening', heading: t('This Evening'), rows: g.evening.map((task) => toRow(task, 'evening')) },
          { id: 'blocked', heading: t('Blocked'), rows: g.blocked.map((task) => toRow(task, 'blocked')) },
          { id: 'done', heading: t('Done today'), rows: completedOn(all, today).map((task) => toRow(task, 'done')) },
        ]
        return { title: t('Today'), groups, columns: columns(options.days ?? defaultDays(target)) }
      }
      case 'upcoming':
        return { title: t('Upcoming'), groups: [], columns: columns(options.days ?? defaultDays(target)) }
      case 'project': {
        const project = live.find((p) => p.id === target.id)
        if (!project) return { title: t('Project'), missing: { message: t('This project no longer exists.') }, groups: [], columns: [] }
        const open = projectOpenList(all, project.id)
        const later = open.filter((task) => inLater(task, today))
        const tree = buildTaskTree(later.length ? open.filter((task) => !inLater(task, today)) : open)
        const byId = new Map(tree.roots.map((n) => [n.id, n]))
        const groups: Group[] = groupBySection(project.id, tree.roots.map((n) => n.item), sections)
          .filter((s) => s.tasks.length > 0)
          .map((s) => ({
            id: `section:${s.key}`, heading: s.section?.name ?? null,
            rows: flattenTree(s.tasks.map((task) => byId.get(task.id) as TreeNode<Task>)).map((n) => toRow(n.item, `section:${s.key}`, { depth: n.depth })),
          }))
        if (later.length) groups.push({ id: 'later', heading: t('Later'), rows: later.map((task) => toRow(task, 'later')) })
        if (groups.length === 0) groups.push({ id: 'empty', rows: [], empty: t('Nothing left to do in this project') })
        return { title: project.name, groups, columns: [] }
      }
      case 'view': {
        if (!views) return null
        const view = views.find((v) => v.id === target.id && !v.deleted_at)
        if (!view) return { title: t('View'), missing: { message: t('This view no longer exists.') }, groups: [], columns: [] }
        if (isDashboard(view)) return { title: view.name, missing: { message: t('A dashboard cannot be shown in display mode. Open one of its views instead.') }, groups: [], columns: [] }
        const result = runView(view, { today, labels, projects: live, tasks: all })
        if (!result.ok) return { title: view.name, missing: { message: t('This view’s query has an error: {error}', { error: result.error }) }, groups: [], columns: [] }
        const groups: Group[] = result.groups.map((g) => ({ id: g.key, heading: g.heading || null, rows: g.tasks.map((task) => toRow(task, g.key)) }))
        if (groups.length === 0) groups.push({ id: 'empty', rows: [], empty: t('No task matches this view') })
        return { title: view.name, groups, columns: [] }
      }
    }
  }, [projects, tasks, views, labels, sections, memberMap, taskMap, blocked, target, projectId, today, zone, dt, options.days])

  // ---- keyboard and focus (design D5): one roving focus across groups and columns ----
  const rows = useMemo(() => (content ? [...content.groups, ...content.columns].flatMap((g) => g.rows) : []), [content])
  const toggle = useCallback((row: DisplayRowData) => {
    if (row.editable) act(setTaskCompleted(row.id, !row.done))
  }, [])
  const exit = useCallback(() => navigate(normalRoute(target)), [target])
  const { focusKey: current, setFocusKey } = useDisplayKeys(rows, toggle, exit)

  const sync = useSyncStatus()
  const online = useOnline()
  const start = useStartView()
  const path = routePath(route)
  const isStart = start === `display:${path}`

  return (
    <main className="display-root" data-screen="display" data-size={options.size} data-display-target={target.kind}>
      <div className="mx-auto flex w-full max-w-screen-2xl flex-1 flex-col gap-6 px-4 py-4 md:px-8 md:py-6">
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <Clock now={now} seconds={options.seconds} />
          <h1 className="display-title user-text min-w-0">{content?.title ?? ''}</h1>
        </header>

        {content?.missing ? (
          <div className="display-task space-y-3" role="alert" data-display-missing>
            <p>{content.missing.message}</p>
            <button type="button" className="ui-btn ui-btn--secondary ui-btn--lg" onClick={() => navigate({ view: 'inbox' })}>{t('Go to Inbox')}</button>
          </div>
        ) : content ? (
          <div className="display-board" data-split={content.groups.length > 0 && content.columns.length > 0 ? '' : undefined}>
            {content.groups.length > 0 && (
              <div className="space-y-6" data-display-main>
                {content.groups.map((g) => (
                  <DisplayColumn key={g.id} id={g.id} heading={g.heading} rows={g.rows} empty={g.empty} focusKey={current} onFocusRow={setFocusKey} onToggle={toggle} />
                ))}
              </div>
            )}
            {content.columns.length > 0 && (
              <div className="display-columns" data-display-columns>
                {content.columns.map((g) => (
                  <DisplayColumn key={g.id} id={g.id} heading={g.heading} rows={g.rows} empty={g.empty} focusKey={current} onFocusRow={setFocusKey} onToggle={toggle} />
                ))}
              </div>
            )}
          </div>
        ) : null}

        <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
          <p role="status" className="display-meta" data-display-synced>
            {online ? lastSyncedLabel(sync.lastSyncedAt, now) : `${t('Offline')} · ${lastSyncedLabel(sync.lastSyncedAt, now)}`}
          </p>
          <div className="flex items-center gap-1 text-faint">
            <Menu kind="menu" label={t('Display options')} trigger={<Icon name="ellipsis" size="md" />} triggerClassName="ui-btn ui-btn--ghost ui-btn--md min-h-11 min-w-11 px-2" width="sm:w-72">
              <MenuItem label={t('Make this the start view on this device')} icon="house" checked={isStart} onSelect={() => act(setStartView(`display:${path}`))} />
              <MenuItem label={t('Exit display mode')} icon="log-out" onSelect={exit} />
            </Menu>
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--md min-h-11 min-w-11 px-3" onClick={exit} data-display-exit>
              <Icon name="log-out" size="md" />{t('Exit')}
            </button>
          </div>
        </footer>
      </div>
    </main>
  )
}
