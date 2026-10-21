import { useLiveQuery } from 'dexie-react-hooks'
import { Tooltip } from '../ui'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { describeEvent, fetchActivity, guestActorLabel, isPending, KIND_FILTERS, mergeOlder, pendingOpIds, projectActivity } from '../lib/activity'
import { isNetworkError } from '../lib/api'
import { useAllProjects, useProjectTaskRows } from '../lib/localData'
import { markSeen } from '../lib/feed'
import { useOnline } from '../lib/online'
import { currentUserId, memberName, membershipMap } from '../lib/sharing'
import type { ActivityEvent, Membership, Project } from '../lib/types'
import { openTask } from './signals'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { useFieldDefs } from './useFields'
import { t } from '../lib/i18n'

/**
 * A project's activity (OpenSpec `comments-and-activity`; ux-overhaul): every
 * member's changes to its tasks, comments and the project itself, newest first,
 * built from local storage (works offline) and extended from the server on
 * demand. Shown in the shell's panel slot from the project header's menu or
 * Shift+H; both filters are ordinary selects, so they are reachable with Tab.
 */
export function ProjectActivity({ project }: { project: Project }) {
  useFieldDefs() // "changed Cost" rather than fields.<id> (custom-fields)
  return <ActivityList project={project} />
}

function ActivityList({ project }: { project: Project }) {
  const dt = useDateTimeFormat()
  const online = useOnline()
  const me = useLiveQuery(() => currentUserId(), [], null)
  const memberships = useLiveQuery(() => membershipMap(), [], new Map<string, Membership>())
  const local = useLiveQuery(() => projectActivity(project.id), [project.id], [] as ActivityEvent[])
  const pending = useLiveQuery(() => pendingOpIds(), [], new Set<string>())
  const tasks = useProjectTaskRows(project.id)
  const projects = useAllProjects()
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
  const name = useCallback((id: string) => (id && id === me ? t('You') : memberName(id, memberships) ?? names.get(id) ?? t('Someone')), [me, memberships, names])
  const projectName = useCallback((id: string | null) => (id ? projects.find((p) => p.id === id)?.name ?? t('another project') : t('Inbox')), [projects])
  const titles = useMemo(() => {
    const m = new Map(tasks.map((task) => [task.id, task.title]))
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
    <div className="space-y-2 text-body" data-project-activity>
      <div className="flex flex-wrap gap-2">
        <label className="flex items-center gap-1 text-meta text-muted">
          {t('Person')}
          <select className="ui-input py-0.5 text-meta" value={actor} onChange={(e) => setActor(e.target.value)} aria-label={t('Filter activity by person')}>
            <option value="">{t('Everyone')}</option>
            {actors.map((a) => <option key={a} value={a}>{name(a)}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1 text-meta text-muted">
          {t('Kind')}
          <select className="ui-input py-0.5 text-meta" value={kind} onChange={(e) => setKind(e.target.value)} aria-label={t('Filter activity by kind')}>
            <option value="">{t('All changes')}</option>
            {KIND_FILTERS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </label>
      </div>
      {shown.length === 0 && <p className="text-meta text-faint">{actor || kind ? t('No activity matches these filters.') : t('No activity on this device yet.')}</p>}
      <ol className="space-y-1" aria-label={t('Activity')}>
        {shown.map((e) => {
          const title = e.taskId ? titles.get(e.taskId) || e.taskTitle || t('a task') : null
          return (
            <li key={e.id} className="flex items-baseline gap-2 text-meta text-muted" data-event={e.kind} data-actor={e.actor}>
              <span className="min-w-0 flex-1">
                <strong className="font-medium text-muted">{guestActorLabel(e) ?? name(e.actor)}</strong>{' '}
                {describeEvent(e, name, projectName)}
                {title && e.entity !== 'project' && (
                  <> {e.entity === 'comment' ? t('on', { context: 'comment' }) : '·'}{' '}
                    <button type="button" className="text-muted underline decoration-dotted" onClick={() => e.taskId && openTask.request(e.taskId)}>
                      {title}
                    </button>
                  </>
                )}
                {isPending(e, pending) && <Tooltip label={t('Not yet synced')}><span className="ml-1 rounded-chip italic text-warning" tabIndex={0}>{t('(pending)')}</span></Tooltip>}
              </span>
              <time className="shrink-0 text-faint" dateTime={new Date(e.ts).toISOString()}>{dt.formatInstant(e.ts, 'datetime')}</time>
            </li>
          )
        })}
      </ol>
      {more && online && (
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm text-meta" disabled={state === 'loading'} onClick={() => void loadOlder()}>
          {state === 'loading' ? t('Fetching older activity…') : t('Load older activity')}
        </button>
      )}
      {state === 'error' && <p className="text-meta text-danger">{t('Older activity could not be loaded.')}</p>}
    </div>
  )
}
