import { Icon } from '../ui/Icon'
import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { describeEvent, fetchActivity, isPending, KIND_FILTERS, mergeOlder, pendingOpIds, projectActivity } from '../lib/activity'
import { isNetworkError } from '../lib/api'
import { db } from '../lib/db'
import { markSeen } from '../lib/feed'
import { useOnline } from '../lib/online'
import { currentUserId, memberName, membershipMap } from '../lib/sharing'
import type { ActivityEvent, Membership, Project, Task } from '../lib/types'
import { openTask } from './signals'
import { useDateTimeFormat } from './DateTimePrefsProvider'

/**
 * A project's activity (OpenSpec `comments-and-activity`): every member's
 * changes to its tasks, comments and the project itself, newest first, built
 * from local storage (works offline) and extended from the server on demand.
 * Shift+H shows or hides it; both filters are ordinary selects, so they are
 * reachable with Tab.
 */
export function ProjectActivity({ project }: { project: Project }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'H' || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      e.preventDefault()
      setOpen((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <section className="pt-2" aria-label="Project activity">
      <button type="button" className="btn-ghost px-2 py-0.5 text-xs" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon name="chevron-right" size="xs" className={`transition-transform duration-(--duration-ui) ${open ? 'rotate-90' : ''}`} />Activity <span className="kbd ml-1">H</span>
      </button>
      {open && <ActivityList project={project} />}
    </section>
  )
}

function ActivityList({ project }: { project: Project }) {
  const dt = useDateTimeFormat()
  const online = useOnline()
  const me = useLiveQuery(() => currentUserId(), [], null)
  const memberships = useLiveQuery(() => membershipMap(), [], new Map<string, Membership>())
  const local = useLiveQuery(() => projectActivity(project.id), [project.id], [] as ActivityEvent[])
  const pending = useLiveQuery(() => pendingOpIds(), [], new Set<string>())
  const tasks = useLiveQuery(() => db.tasks.where('project_id').equals(project.id).toArray(), [project.id], [] as Task[])
  const projects = useLiveQuery(() => db.projects.toArray(), [], [] as Project[])
  const [older, setOlder] = useState<ActivityEvent[]>([])
  const [cursor, setCursor] = useState<string | undefined>()
  const [more, setMore] = useState(true)
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [actor, setActor] = useState('')
  const [kind, setKind] = useState('')

  useEffect(() => {
    setOlder([])
    setCursor(undefined)
    setMore(true)
  }, [project.id])

  // Opening a shared project's activity marks it seen up to its newest event
  // (activity-feed); markSeen debounces and never moves the mark backwards.
  const shared = memberships.has(project.id)
  useEffect(() => {
    if (shared && local.length > 0) markSeen(project.id, local[0].ts)
  }, [shared, local, project.id])

  const events = useMemo(() => mergeOlder(local, older), [local, older])
  const names = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of older) if (e.actorName) m.set(e.actor, e.actorName)
    return m
  }, [older])
  const name = useCallback((id: string) => (id && id === me ? 'You' : memberName(id, memberships) ?? names.get(id) ?? 'Someone'), [me, memberships, names])
  const projectName = useCallback((id: string | null) => (id ? projects.find((p) => p.id === id)?.name ?? 'another project' : 'Inbox'), [projects])
  const titles = useMemo(() => {
    const m = new Map(tasks.map((t) => [t.id, t.title]))
    for (const e of older) if (e.taskId && e.taskTitle && !m.has(e.taskId)) m.set(e.taskId, e.taskTitle)
    return m
  }, [tasks, older])
  const actors = useMemo(() => [...new Set(events.map((e) => e.actor))].sort((a, b) => name(a).localeCompare(name(b))), [events, name])
  const kinds = KIND_FILTERS.find((k) => k.value === kind)?.kinds
  const shown = events.filter((e) => (!actor || e.actor === actor) && (!kinds || kinds.includes(e.kind)))

  async function loadOlder() {
    setState('loading')
    try {
      const page = await fetchActivity('project', project.id, cursor)
      setOlder((prev) => [...prev, ...page.events])
      setCursor(page.cursor)
      setMore(page.more)
      setState('idle')
    } catch (err) {
      setState(isNetworkError(err) ? 'idle' : 'error')
      if ((err as { status?: number }).status === 404) setMore(false)
    }
  }

  return (
    <div className="mt-2 space-y-2 text-sm">
      <div className="flex flex-wrap gap-2">
        <label className="flex items-center gap-1 text-xs text-muted">
          Person
          <select className="input py-0.5 text-xs" value={actor} onChange={(e) => setActor(e.target.value)} aria-label="Filter activity by person">
            <option value="">Everyone</option>
            {actors.map((a) => <option key={a} value={a}>{name(a)}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1 text-xs text-muted">
          Kind
          <select className="input py-0.5 text-xs" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Filter activity by kind">
            <option value="">All changes</option>
            {KIND_FILTERS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </label>
      </div>
      {shown.length === 0 && <p className="text-xs text-faint">No activity{actor || kind ? ' matches these filters' : ' on this device yet'}.</p>}
      <ol className="space-y-1" aria-label="Activity">
        {shown.map((e) => {
          const title = e.taskId ? titles.get(e.taskId) || e.taskTitle || 'a task' : null
          return (
            <li key={e.id} className="flex items-baseline gap-2 text-xs text-muted" data-event={e.kind} data-actor={e.actor}>
              <span className="min-w-0 flex-1">
                <strong className="font-medium text-slate-700 dark:text-slate-200">{name(e.actor)}</strong>{' '}
                {describeEvent(e, name, projectName)}
                {title && e.entity !== 'project' && (
                  <> {e.entity === 'comment' ? 'on' : '·'}{' '}
                    <button type="button" className="text-slate-700 underline decoration-dotted dark:text-slate-300" onClick={() => e.taskId && openTask.request(e.taskId)}>
                      {title}
                    </button>
                  </>
                )}
                {isPending(e, pending) && <span className="ml-1 italic text-amber-700 dark:text-amber-400" title="Not yet synced">(pending)</span>}
              </span>
              <time className="shrink-0 text-faint" dateTime={new Date(e.ts).toISOString()}>{dt.formatInstant(e.ts, 'datetime')}</time>
            </li>
          )
        })}
      </ol>
      {more && online && (
        <button type="button" className="btn-ghost text-xs" disabled={state === 'loading'} onClick={() => void loadOlder()}>
          {state === 'loading' ? 'Loading…' : 'Load older activity'}
        </button>
      )}
      {state === 'error' && <p className="text-xs text-red-600 dark:text-red-400">Older activity could not be loaded.</p>}
    </div>
  )
}
