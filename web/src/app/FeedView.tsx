import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { describeEvent, guestActorLabel, isPending, mergeOlder, pendingOpIds } from '../lib/activity'
import { isNetworkError } from '../lib/api'
import { useAllProjects, useTasksById } from '../lib/localData'
import { dayOf, FEED_KINDS, feedEvents, fetchFeed, filterFeed, groupByDay, markEventsSeen, seenTimes, sharedProjectIds, type FeedKind } from '../lib/feed'
import { useOnline } from '../lib/online'
import { currentUserId, memberName, membershipMap } from '../lib/sharing'
import type { ActivityEvent, Membership } from '../lib/types'
import { navigate } from './router'
import { openTaskInList } from './signals'
import { isActivationTarget, useShortcutScope } from './shortcuts'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { hueFor, PageBody, PageHeader } from '../ui'
import { Tooltip } from '../ui'
import { t } from '../lib/i18n'

/**
 * The activity feed (OpenSpec `activity-feed`): every shared project's recent
 * activity, newest first, grouped by day, from local storage (works offline) and
 * extended from the server on demand. Opening it marks the listed projects seen
 * up to their newest event; entries that were unread when it opened carry a dot.
 * Keys: j / k select, Enter opens the task in its project; Tab reaches the filters.
 * It refreshes by itself: the live queries re-run whenever a sync writes ops,
 * including syncs started by the server's wake-up channel.
 */
export function FeedView() {
  const dt = useDateTimeFormat()
  const online = useOnline()
  const me = useLiveQuery(() => currentUserId(), [], null)
  const memberships = useLiveQuery(() => membershipMap(), [], new Map<string, Membership>())
  const shared = useLiveQuery(() => sharedProjectIds(), [], null as string[] | null)
  const local = useLiveQuery(() => feedEvents(), [], null as ActivityEvent[] | null)
  const pending = useLiveQuery(() => pendingOpIds(), [], new Set<string>())
  const projects = useAllProjects()
  const taskIds = useMemo(() => [...new Set((local ?? []).map((e) => e.taskId).filter((id): id is string => !!id))], [local])
  const tasks = useTasksById(taskIds)
  // Seen times as they were when the feed opened: those entries keep their dot.
  const [seenAtOpen, setSeenAtOpen] = useState<Map<string, number> | null>(null)
  useEffect(() => {
    void seenTimes().then(setSeenAtOpen)
  }, [])

  const [project, setProject] = useState('')
  const [actor, setActor] = useState('')
  const [kind, setKind] = useState<FeedKind | ''>('')
  const [older, setOlder] = useState<ActivityEvent[]>([])
  const [cursor, setCursor] = useState<string | undefined>()
  const [more, setMore] = useState(true)
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [selected, setSelected] = useState<string | null>(null)

  // Server pages are fetched with the filters, so a filter change starts over.
  useEffect(() => {
    setOlder([])
    setCursor(undefined)
    setMore(true)
  }, [project, actor, kind])

  // Opening the feed (and anything arriving while it is open) marks each listed
  // project seen up to its newest event; markSeen debounces and never goes back.
  useEffect(() => {
    if (local && seenAtOpen) markEventsSeen(local)
  }, [local, seenAtOpen])

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const all = useMemo(() => mergeOlder(local ?? [], older), [local, older])
  const filter = useMemo(() => ({ project, actor, kind }), [project, actor, kind])
  const shown = useMemo(() => filterFeed(all, filter), [all, filter])
  const groups = useMemo(() => groupByDay(shown), [shown])

  const names = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of older) if (e.actorName) m.set(e.actor, e.actorName)
    return m
  }, [older])
  const name = useCallback((id: string) => (id && id === me ? t('You') : memberName(id, memberships) ?? names.get(id) ?? t('Someone')), [me, memberships, names])
  const projectName = useCallback(
    (id: string | null | undefined, fallback?: string) => (id ? projectById.get(id)?.name ?? fallback ?? t('a shared project') : t('Inbox')),
    [projectById],
  )
  const titles = useMemo(() => {
    const m = new Map(tasks.map((tk) => [tk.id, tk.title]))
    for (const e of older) if (e.taskId && e.taskTitle && !m.has(e.taskId)) m.set(e.taskId, e.taskTitle)
    return m
  }, [tasks, older])
  const actors = useMemo(() => [...new Set(all.map((e) => e.actor))].sort((a, b) => name(a).localeCompare(name(b))), [all, name])

  const open = useCallback((e: ActivityEvent) => {
    if (e.taskId) openTaskInList({ id: e.taskId, project_id: e.projectId ?? null })
    else if (e.projectId) navigate({ view: 'project', id: e.projectId })
  }, [])

  const idx = shown.findIndex((x) => x.id === selected)
  useShortcutScope('view', {
    'feed.down': () => setSelected(shown[Math.min(shown.length - 1, idx + 1)]?.id ?? null),
    'feed.up': () => setSelected(shown[Math.max(0, idx - 1)]?.id ?? null),
    'feed.open': (e) => { if (idx < 0 || isActivationTarget(e.target)) return false; open(shown[idx]) },
  }, { view: 'feed' })
  useEffect(() => {
    if (selected) document.querySelector(`[data-feed-id="${CSS.escape(selected)}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  async function loadOlder() {
    setState('loading')
    try {
      const page = await fetchFeed({ cursor, project, actor, kind })
      setOlder((prev) => [...prev, ...page.events])
      setCursor(page.cursor)
      setMore(page.more)
      setState('idle')
    } catch (err) {
      setState(isNetworkError(err) ? 'idle' : 'error')
    }
  }

  const today = dayOf(Date.now())
  const yesterday = dayOf(Date.now() - 86_400_000)
  const dayLabel = (d: string) => (d === today ? t('Today') : d === yesterday ? t('Yesterday') : dt.formatDate(d, d.slice(0, 4) === today.slice(0, 4) ? 'heading' : 'long'))
  const isNew = (e: ActivityEvent) => !!seenAtOpen && !!e.projectId && e.actor !== me && e.ts > (seenAtOpen.get(e.projectId) ?? Number.POSITIVE_INFINITY)

  return (
    <PageBody width="list">
      <PageHeader title={t('Updates')} meta={t('What changed in your shared projects')} help="updates">
        <label className="flex items-center gap-1 text-meta text-muted">
          {t('Project')}
          <select className="ui-input py-0.5 text-meta" value={project} onChange={(e) => setProject(e.target.value)} aria-label={t('Filter feed by project')}>
            <option value="">{t('All shared projects')}</option>
            {(shared ?? []).map((id) => <option key={id} value={id}>{projectName(id)}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1 text-meta text-muted">
          {t('Person')}
          <select className="ui-input py-0.5 text-meta" value={actor} onChange={(e) => setActor(e.target.value)} aria-label={t('Filter feed by person')}>
            <option value="">{t('Everyone')}</option>
            {actors.map((a) => <option key={a} value={a}>{name(a)}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1 text-meta text-muted">
          {t('Kind')}
          <select className="ui-input py-0.5 text-meta" value={kind} onChange={(e) => setKind(e.target.value as FeedKind | '')} aria-label={t('Filter feed by kind')}>
            <option value="">{t('All changes')}</option>
            {FEED_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </label>
      </PageHeader>
      {shared && shared.length === 0 ? (
        <p className="py-12 text-center text-body text-faint">{t('Share a project to see what others change here.')}</p>
      ) : shown.length === 0 && local ? (
        <p className="py-12 text-center text-body text-faint">{project || actor || kind ? t('No activity matches these filters.') : t('No activity on this device yet.')}</p>
      ) : null}
      <div className="space-y-4">
        {groups.map((g) => (
          <section key={g.day} aria-label={dayLabel(g.day)}>
            <h2 className="mb-1 text-meta font-semibold uppercase tracking-wide text-faint">{dayLabel(g.day)}</h2>
            <ol className="divide-y divide-(--ot-border)" aria-label={t('Activity')}>
              {g.events.map((e) => {
                const title = e.taskId ? titles.get(e.taskId) || e.taskTitle || t('a task') : null
                const p = e.projectId ? projectById.get(e.projectId) : undefined
                const fresh = isNew(e)
                return (
                  <li key={e.id} data-feed-id={e.id} data-event={e.kind} data-actor={e.actor} data-unread={fresh || undefined}
                    onClick={() => setSelected(e.id)} onDoubleClick={() => open(e)}
                    className={`flex items-baseline gap-2 px-2 py-1.5 text-body ${e.id === selected ? 'bg-accent-soft' : ''}`}>
                    <span className={`h-2 w-2 shrink-0 self-center rounded-full ${fresh ? 'bg-accent' : 'bg-transparent'}`}>{fresh && <span className="sr-only">{t('New')}</span>}</span>
                    <span className="min-w-0 flex-1">
                      <strong className="font-medium text-default">{guestActorLabel(e) ?? name(e.actor)}</strong>{' '}
                      <span className="text-muted">{describeEvent(e, name, (id) => projectName(id))}</span>
                      {title && e.entity !== 'project' && (
                        <> {e.entity === 'comment' ? t('on', { context: 'comment' }) : '·'}{' '}
                          <button type="button" className="text-default underline decoration-dotted" onClick={() => open(e)}>{title}</button>
                        </>
                      )}
                      {isPending(e, pending) && <Tooltip label={t('Not yet synced')}><span className="ml-1 rounded-chip text-meta italic text-warning" tabIndex={0}>{t('(pending)')}</span></Tooltip>}
                      <span className="mt-0.5 flex items-center gap-1 text-meta text-faint">
                        <span className="inline-block h-2 w-2 rounded-full bg-hue-solid" data-hue={hueFor(p?.color)} aria-hidden />
                        <button type="button" className="hover:underline" onClick={() => e.projectId && navigate({ view: 'project', id: e.projectId })}>
                          {projectName(e.projectId, e.projectName)}
                        </button>
                      </span>
                    </span>
                    <time className="shrink-0 text-meta text-faint" dateTime={new Date(e.ts).toISOString()}>
                      {dt.formatInstant(e.ts, 'time')}
                    </time>
                  </li>
                )
              })}
            </ol>
          </section>
        ))}
      </div>
      {more && online && shared && shared.length > 0 && (
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm mt-3 text-meta" disabled={state === 'loading'} onClick={() => void loadOlder()}>
          {state === 'loading' ? t('Fetching older updates…') : t('Load older updates')}
        </button>
      )}
      {state === 'error' && <p className="mt-2 text-meta text-danger">{t('Older updates could not be loaded.')}</p>}
    </PageBody>
  )
}
