// A workspace's Activity page (OpenSpec change workspace-activity): opened
// from the workspace menu, it lists every actor's events in the workspace's
// projects and Inbox, newest first and grouped by day, filtered by a date
// range, several kinds, a project and a person. The filters are remembered on
// this device for the workspace. Offline it shows the retained events; online
// it pages the server and merges without duplicates. It marks nothing seen.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { describeEvent, guestActorLabel, isPending, mergeOlder, usePendingOpIds } from '../lib/activity'
import { isNetworkError } from '../lib/api'
import { dayOf, groupByDay } from '../lib/feed'
import { t } from '../lib/i18n'
import { useMembershipMap, useProjectsOfEveryWorkspace, useTasksByIdRead, useWorkspaceState } from '../lib/localData'
import { useOnline } from '../lib/online'
import { memberName, useCurrentUserId } from '../lib/sharing'
import type { ActivityEvent } from '../lib/types'
import { fetchWorkspaceActivity, filterWorkspace, NO_FILTER, useWorkspaceEvents, readFilter, writeFilter, type WorkspaceFilter } from '../lib/workspaceActivity'
import { Partition } from '../lib/workspaces'
import { Input, PageBody, PageHeader, Skeleton, Tooltip } from '../ui'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { KindsMenu } from './KindsMenu'
import { navigate } from './router'
import { openTaskInList } from './signals'
import { workspaceLabel } from './workspaceNav'

export default function WorkspaceActivity({ id }: { id: string }) {
  const dt = useDateTimeFormat()
  const online = useOnline()
  const me = useCurrentUserId() ?? null
  const state = useWorkspaceState()
  const workspace = state.list.find((w) => w.id === id)
  const memberships = useMembershipMap()
  const everyProject = useProjectsOfEveryWorkspace()
  const pending = usePendingOpIds()
  const local = useWorkspaceEvents(id, state)

  const [filter, setFilterState] = useState<WorkspaceFilter>(() => readFilter(id))
  useEffect(() => setFilterState(readFilter(id)), [id])
  const setFilter = useCallback((patch: Partial<WorkspaceFilter>) => {
    setFilterState((f) => {
      const next = { ...f, ...patch }
      writeFilter(id, next)
      return next
    })
  }, [id])

  const [older, setOlder] = useState<ActivityEvent[]>([])
  const [cursor, setCursor] = useState<string | undefined>()
  const [more, setMore] = useState(true)
  const [state_, setLoad] = useState<'idle' | 'loading' | 'error'>('idle')
  const load = useCallback(async (from?: string, reset = false) => {
    setLoad('loading')
    try {
      const page = await fetchWorkspaceActivity(id, filter, from)
      setOlder((prev) => (reset ? page.events : [...prev, ...page.events]))
      setCursor(page.cursor)
      setMore(page.more)
      setLoad('idle')
    } catch (err) {
      // The automatic first page fails quietly: the device's events stay listed.
      setLoad(reset || isNetworkError(err) ? 'idle' : 'error')
      if ((err as { status?: number }).status === 404) setMore(false)
    }
  }, [id, filter])
  // Server pages carry the filters: a change starts over, online.
  useEffect(() => {
    setOlder([])
    setCursor(undefined)
    setMore(true)
    if (online) void load(undefined, true)
  }, [load, online])

  const projects = useMemo(() => {
    const p = new Partition(state.defaultId, state.list.map((w) => w.id), everyProject)
    return everyProject.filter((x) => p.project(x.id) === id)
  }, [everyProject, state, id])
  const projectById = useMemo(() => new Map(everyProject.map((p) => [p.id, p])), [everyProject])
  const all = useMemo(() => mergeOlder(local ?? [], older), [local, older])
  const shown = useMemo(() => filterWorkspace(all, filter), [all, filter])
  const groups = useMemo(() => groupByDay(shown), [shown])
  const taskIds = useMemo(() => [...new Set(shown.map((e) => e.taskId).filter((x): x is string => !!x))], [shown])
  const { tasks } = useTasksByIdRead(taskIds)

  const names = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of older) if (e.actorName) m.set(e.actor, e.actorName)
    return m
  }, [older])
  const name = useCallback((a: string) => (a && a === me ? t('You') : memberName(a, memberships) ?? names.get(a) ?? t('Someone')), [me, memberships, names])
  const projectName = useCallback((pid: string | null | undefined, fallback?: string) => (pid ? projectById.get(pid)?.name ?? fallback ?? t('another project') : t('Inbox')), [projectById])
  const titles = useMemo(() => {
    const m = new Map(tasks.map((tk) => [tk.id, tk.title]))
    for (const e of older) if (e.taskId && e.taskTitle && !m.has(e.taskId)) m.set(e.taskId, e.taskTitle)
    return m
  }, [tasks, older])
  const actors = useMemo(() => [...new Set(all.map((e) => e.actor))].sort((a, b) => name(a).localeCompare(name(b))), [all, name])
  const open = (e: ActivityEvent) => {
    if (e.taskId) openTaskInList({ id: e.taskId, project_id: e.projectId ?? null })
    else if (e.projectId) navigate({ view: 'project', id: e.projectId })
  }

  const today = dayOf(Date.now())
  const yesterday = dayOf(Date.now() - 86_400_000)
  const dayLabel = (d: string) => (d === today ? t('Today') : d === yesterday ? t('Yesterday') : dt.formatDate(d, d.slice(0, 4) === today.slice(0, 4) ? 'heading' : 'long'))
  const filtered = JSON.stringify(filter) !== JSON.stringify(NO_FILTER)
  const title = workspace ? t('{name} activity', { name: workspaceLabel(workspace.name, workspace.default) }) : t('Activity')

  return (
    <PageBody width="list">
      <PageHeader title={title}>
        <label className="flex items-center gap-1 text-meta text-muted">
          {t('From')}
          <Input type="date" className="w-36 py-0.5 text-meta" value={filter.from} max={filter.to || undefined} onChange={(e) => setFilter({ from: e.target.value })} data-range-from />
        </label>
        <label className="flex items-center gap-1 text-meta text-muted">
          {t('To')}
          <Input type="date" className="w-36 py-0.5 text-meta" value={filter.to} min={filter.from || undefined} onChange={(e) => setFilter({ to: e.target.value })} data-range-to />
        </label>
        <span className="flex items-center gap-1 text-meta text-muted">
          {t('Kind')}
          <KindsMenu kinds={filter.kinds} onChange={(kinds) => setFilter({ kinds })} label={t('Kind')} />
        </span>
        <label className="flex items-center gap-1 text-meta text-muted">
          {t('Project')}
          <select className="ui-input w-40 py-0.5 text-meta" value={filter.project} onChange={(e) => setFilter({ project: e.target.value })} aria-label={t('Filter activity by project')}>
            <option value="">{t('All projects')}</option>
            <option value="inbox">{t('Inbox')}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1 text-meta text-muted">
          {t('Person')}
          <select className="ui-input w-40 py-0.5 text-meta" value={filter.actor} onChange={(e) => setFilter({ actor: e.target.value })} aria-label={t('Filter activity by person')}>
            <option value="">{t('Everyone')}</option>
            {actors.map((a) => <option key={a} value={a}>{name(a)}</option>)}
          </select>
        </label>
      </PageHeader>
      {local === undefined ? <Skeleton shape="row" count={6} label={t('Loading activity')} /> : shown.length === 0 && state_ !== 'loading' ? (
        <p className="py-12 text-center text-body text-faint">{filtered ? t('No activity matches these filters.') : t('No activity on this device yet.')}</p>
      ) : null}
      <div className="space-y-4" data-workspace-activity>
        {groups.map((g) => (
          <section key={g.day} aria-label={dayLabel(g.day)}>
            <h2 className="mb-1 text-meta font-semibold uppercase tracking-wide text-faint">{dayLabel(g.day)}</h2>
            <ol className="divide-y divide-(--ot-border)" aria-label={t('Activity')}>
              {g.events.map((e) => {
                const task = e.taskId ? titles.get(e.taskId) || e.taskTitle || t('a task') : null
                return (
                  <li key={e.id} data-event={e.kind} data-actor={e.actor} className="flex items-baseline gap-2 px-2 py-1.5 text-body">
                    <span className="user-text min-w-0 flex-1">
                      <strong className="font-medium text-default">{guestActorLabel(e) ?? name(e.actor)}</strong>{' '}
                      <span className="text-muted">{describeEvent(e, name, (pid) => projectName(pid))}</span>
                      {task && e.entity !== 'project' && (
                        <> {e.entity === 'comment' ? t('on', { context: 'comment' }) : '·'}{' '}
                          <button type="button" className="text-default underline decoration-dotted" onClick={() => open(e)}>{task}</button>
                        </>
                      )}
                      {isPending(e, pending) && <Tooltip label={t('Not yet synced')}><span className="ms-1 rounded-chip text-meta italic text-warning" tabIndex={0}>{t('(pending)')}</span></Tooltip>}
                      <span className="mt-0.5 block truncate text-meta text-faint">{projectName(e.projectId, e.projectName)}</span>
                    </span>
                    <time className="shrink-0 text-meta text-faint" dateTime={new Date(e.ts).toISOString()}>{dt.formatInstant(e.ts, 'time')}</time>
                  </li>
                )
              })}
            </ol>
          </section>
        ))}
      </div>
      {more && online && cursor && (
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm mt-3 text-meta" disabled={state_ === 'loading'} onClick={() => void load(cursor)}>
          {state_ === 'loading' ? t('Fetching older activity…') : t('Load older activity')}
        </button>
      )}
      {state_ === 'error' && <p className="mt-2 text-meta text-danger">{t('Older activity could not be loaded.')}</p>}
    </PageBody>
  )
}
