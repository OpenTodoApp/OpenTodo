import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { describeEvent, isPending, mergeOlder, pendingOpIds } from '../lib/activity'
import { isNetworkError } from '../lib/api'
import { db } from '../lib/db'
import { dayOf, FEED_KINDS, feedEvents, fetchFeed, filterFeed, groupByDay, markEventsSeen, seenTimes, sharedProjectIds, type FeedKind } from '../lib/feed'
import { useOnline } from '../lib/online'
import { currentUserId, memberName, membershipMap } from '../lib/sharing'
import type { ActivityEvent, Membership, Project, Task } from '../lib/types'
import { navigate } from './router'
import { isGPending, openTaskInList } from './signals'
import { isTyping } from './useViews'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { hueFor, PageBody, PageHeader } from '../ui'

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
  const projects = useLiveQuery(() => db.projects.toArray(), [], [] as Project[])
  const taskIds = useMemo(() => [...new Set((local ?? []).map((e) => e.taskId).filter((id): id is string => !!id))], [local])
  const tasks = useLiveQuery(async () => (await db.tasks.bulkGet(taskIds)).filter((t): t is Task => !!t), [taskIds], [] as Task[])
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
  const name = useCallback((id: string) => (id && id === me ? 'You' : memberName(id, memberships) ?? names.get(id) ?? 'Someone'), [me, memberships, names])
  const projectName = useCallback(
    (id: string | null | undefined, fallback?: string) => (id ? projectById.get(id)?.name ?? fallback ?? 'a shared project' : 'Inbox'),
    [projectById],
  )
  const titles = useMemo(() => {
    const m = new Map(tasks.map((t) => [t.id, t.title]))
    for (const e of older) if (e.taskId && e.taskTitle && !m.has(e.taskId)) m.set(e.taskId, e.taskTitle)
    return m
  }, [tasks, older])
  const actors = useMemo(() => [...new Set(all.map((e) => e.actor))].sort((a, b) => name(a).localeCompare(name(b))), [all, name])

  const open = useCallback((e: ActivityEvent) => {
    if (e.taskId) openTaskInList({ id: e.taskId, project_id: e.projectId ?? null })
    else if (e.projectId) navigate({ view: 'project', id: e.projectId })
  }, [])

  const keys = useRef({ shown, selected, open })
  keys.current = { shown, selected, open }
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e) || isGPending()) return
      if (document.querySelector('[role="dialog"]')) return
      const { shown, selected, open } = keys.current
      const idx = shown.findIndex((x) => x.id === selected)
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault()
        setSelected(shown[Math.min(shown.length - 1, idx + 1)]?.id ?? null)
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault()
        setSelected(shown[Math.max(0, idx - 1)]?.id ?? null)
      } else if (e.key === 'Enter' && idx >= 0) {
        e.preventDefault()
        open(shown[idx])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
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
  const dayLabel = (d: string) => (d === today ? 'Today' : d === yesterday ? 'Yesterday' : dt.formatDate(d, d.slice(0, 4) === today.slice(0, 4) ? 'heading' : 'long'))
  const isNew = (e: ActivityEvent) => !!seenAtOpen && !!e.projectId && e.actor !== me && e.ts > (seenAtOpen.get(e.projectId) ?? Number.POSITIVE_INFINITY)

  return (
    <PageBody width="list">
      <PageHeader title="Updates" meta="What changed in your shared projects" help="updates">
        <label className="flex items-center gap-1 text-xs text-muted">
          Project
          <select className="input py-0.5 text-xs" value={project} onChange={(e) => setProject(e.target.value)} aria-label="Filter feed by project">
            <option value="">All shared projects</option>
            {(shared ?? []).map((id) => <option key={id} value={id}>{projectName(id)}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1 text-xs text-muted">
          Person
          <select className="input py-0.5 text-xs" value={actor} onChange={(e) => setActor(e.target.value)} aria-label="Filter feed by person">
            <option value="">Everyone</option>
            {actors.map((a) => <option key={a} value={a}>{name(a)}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1 text-xs text-muted">
          Kind
          <select className="input py-0.5 text-xs" value={kind} onChange={(e) => setKind(e.target.value as FeedKind | '')} aria-label="Filter feed by kind">
            <option value="">All changes</option>
            {FEED_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </label>
      </PageHeader>
      {shared && shared.length === 0 ? (
        <p className="py-12 text-center text-sm text-faint">Share a project to see what others change here.</p>
      ) : shown.length === 0 && local ? (
        <p className="py-12 text-center text-sm text-faint">No activity{project || actor || kind ? ' matches these filters' : ' on this device yet'}.</p>
      ) : null}
      <div className="space-y-4">
        {groups.map((g) => (
          <section key={g.day} aria-label={dayLabel(g.day)}>
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">{dayLabel(g.day)}</h2>
            <ol className="divide-y divide-(--ot-border)" aria-label="Activity">
              {g.events.map((e) => {
                const title = e.taskId ? titles.get(e.taskId) || e.taskTitle || 'a task' : null
                const p = e.projectId ? projectById.get(e.projectId) : undefined
                const fresh = isNew(e)
                return (
                  <li key={e.id} data-feed-id={e.id} data-event={e.kind} data-actor={e.actor} data-unread={fresh || undefined}
                    onClick={() => setSelected(e.id)} onDoubleClick={() => open(e)}
                    className={`flex items-baseline gap-2 px-2 py-1.5 text-sm ${e.id === selected ? 'bg-accent-soft' : ''}`}>
                    <span className={`h-2 w-2 shrink-0 self-center rounded-full ${fresh ? 'bg-accent' : 'bg-transparent'}`} aria-label={fresh ? 'New' : undefined} />
                    <span className="min-w-0 flex-1">
                      <strong className="font-medium text-default">{name(e.actor)}</strong>{' '}
                      <span className="text-muted">{describeEvent(e, name, (id) => projectName(id))}</span>
                      {title && e.entity !== 'project' && (
                        <> {e.entity === 'comment' ? 'on' : '·'}{' '}
                          <button type="button" className="text-default underline decoration-dotted" onClick={() => open(e)}>{title}</button>
                        </>
                      )}
                      {isPending(e, pending) && <span className="ml-1 text-xs italic text-warning" title="Not yet synced">(pending)</span>}
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-faint">
                        <span className="inline-block h-2 w-2 rounded-full bg-hue-solid" data-hue={hueFor(p?.color)} aria-hidden />
                        <button type="button" className="hover:underline" onClick={() => e.projectId && navigate({ view: 'project', id: e.projectId })}>
                          {projectName(e.projectId, e.projectName)}
                        </button>
                      </span>
                    </span>
                    <time className="shrink-0 text-xs text-faint" dateTime={new Date(e.ts).toISOString()}>
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
        <button type="button" className="btn-ghost mt-3 text-xs" disabled={state === 'loading'} onClick={() => void loadOlder()}>
          {state === 'loading' ? 'Loading…' : 'Load older updates'}
        </button>
      )}
      {state === 'error' && <p className="mt-2 text-xs text-danger">Older updates could not be loaded.</p>}
    </PageBody>
  )
}
