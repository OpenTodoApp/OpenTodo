// Activity tab of the task panel (OpenSpec task-detail-redesign D6; activity-log
// "Per-task activity", "Grouped activity runs"): derived events folded into runs
// of one person's changes, newest first. Built from local storage (offline, with
// unsent changes marked pending); "Load older" pages history from the server.
import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { describeEvent, fetchActivity, guestActorLabel, mergeOlder, pendingOpIds, taskActivity } from '../../lib/activity'
import { type ActivityRun, groupRuns, summarizeRun } from '../../lib/activityRuns'
import { isNetworkError } from '../../lib/api'
import { useAllProjects, useTasksById } from '../../lib/localData'
import { useOnline } from '../../lib/online'
import { currentUserId, membershipMap, memberName } from '../../lib/sharing'
import type { ActivityEvent, ActivityKind, Membership, Task } from '../../lib/types'
import { Avatar } from '../../ui'
import { Tooltip } from '../../ui'
import { Button } from '../../ui'
import { Icon, type IconName } from '../../ui'
import { EmptyState } from '../../ui'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import { useFieldDefs } from '../useFields'
import { RelativeTime } from './RelativeTime'
import { t } from '../../lib/i18n'

const KIND_ICON: Record<ActivityKind, IconName> = {
  created: 'plus', completed: 'circle-check-big', reopened: 'undo-2', deleted: 'trash-2', restored: 'rotate-ccw', rescheduled: 'calendar-days',
  assigned: 'user-check', unassigned: 'user-check', moved: 'folder', dependencies: 'lock', archived: 'folder', unarchived: 'folder', edited: 'pencil',
  commented: 'message-circle', comment_edited: 'message-circle', comment_deleted: 'message-circle',
}

export interface ActivityViewProps {
  runs: ActivityRun[]
  name: (id: string, ev?: ActivityEvent) => string
  project: (id: string | null) => string
  /** Titles of tasks named in events (what a task waits for), when known on this device. */
  task?: (id: string) => string | undefined
  /** Open the Comments tab at a comment. */
  onOpenComment: (commentId: string) => void
  /** Older events can be fetched (online and the server has more). */
  canLoadOlder: boolean
  loadState: 'idle' | 'loading' | 'error'
  onLoadOlder: () => void
  now?: number
  /** The task's created and completed times: the first entries of Activity (ux-overhaul). */
  times?: { created: number; completed: number | null }
}

function RunItem({ run, name, project, task, onOpenComment, now }: { run: ActivityRun } & Pick<ActivityViewProps, 'name' | 'project' | 'task' | 'onOpenComment' | 'now'>) {
  const [open, setOpen] = useState(false)
  const first = run.events[0]
  const actor = name(run.actor, first)
  const pending = run.pending && <Tooltip label={t('Not yet synced')}><span className="ml-1 rounded-chip text-meta italic text-warning" tabIndex={0}>{t('pending')}</span></Tooltip>
  if (run.type === 'comment') {
    return (
      <div className="flex items-center gap-3 text-meta text-muted" data-run="comment">
        <Avatar id={run.actor || 'unknown'} name={actor} size="sm" />
        <Icon name="message-circle" size="sm" className="shrink-0 text-faint" />
        <button type="button" className="min-w-0 flex-1 rounded-chip text-left hover:underline focus-visible:outline-2 focus-visible:outline-focus"
          onClick={() => onOpenComment(first.entityId)}>
          {summarizeRun(run, actor)}
        </button>
        {pending}
        <RelativeTime ts={run.ts} now={now} className="shrink-0" />
      </div>
    )
  }
  const many = run.events.length > 1
  return (
    <div data-run="changes">
      <div className="flex items-start gap-3 text-meta">
        <Avatar id={run.actor || 'unknown'} name={actor} size="sm" />
        <Icon name={KIND_ICON[first.kind] ?? 'pencil'} size="sm" className="mt-0.5 shrink-0 text-faint" />
        <div className="min-w-0 flex-1 text-default">
          {many ? (
            <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}
              className="inline-flex max-w-full items-start gap-1 rounded-chip text-left hover:underline focus-visible:outline-2 focus-visible:outline-focus">
              <Icon name="chevron-right" size="xs" className={`mt-1 shrink-0 transition-transform duration-(--duration-ui) ${open ? 'rotate-90' : ''}`} />
              <span className="user-text">{summarizeRun(run, actor)}</span>
            </button>
          ) : (
            <span className="user-text">{actor} {describeEvent(first, (id) => name(id), project, task)}</span>
          )}
          {pending}
        </div>
        <RelativeTime ts={run.ts} now={now} className="shrink-0" />
      </div>
      {many && open && (
        <ol className="ml-[3.25rem] mt-1.5 space-y-1 border-l-2 border-default pl-3" aria-label={t('Changes in this group')}>
          {run.events.map((ev) => (
            <li key={ev.id} className="flex items-baseline gap-2 text-meta text-muted" data-event={ev.kind}>
              <Icon name={KIND_ICON[ev.kind] ?? 'pencil'} size="xs" className="shrink-0 text-faint" />
              <span className="user-text min-w-0 flex-1">{describeEvent(ev, (id) => name(id), project, task)}</span>
              <RelativeTime ts={ev.ts} now={now} className="shrink-0" />
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export function ActivityView({ runs, name, project, task, onOpenComment, canLoadOlder, loadState, onLoadOlder, now, times }: ActivityViewProps) {
  const dt = useDateTimeFormat()
  return (
    <div className="space-y-3">
      {times && (
        <p className="text-meta text-faint" data-activity-times>
          {t('Created {instant}', { instant: dt.formatInstant(times.created, 'datetime') })}
          {times.completed && ` · ${t('Completed {instant}', { instant: dt.formatInstant(times.completed, 'datetime') })}`}
        </p>
      )}
      {runs.length === 0 ? (
        <EmptyState icon="history" title={t('No activity yet')} body={t('Changes to this task show up here, also while offline.')} />
      ) : (
        <ol className="space-y-3" aria-label={t('Activity')}>
          {runs.map((r) => <li key={r.id}><RunItem run={r} name={name} project={project} task={task} onOpenComment={onOpenComment} now={now} /></li>)}
        </ol>
      )}
      {canLoadOlder && (
        <Button variant="ghost" size="sm" busy={loadState === 'loading'} onClick={onLoadOlder}>{t('Load older activity')}</Button>
      )}
      {loadState === 'error' && <p role="alert" className="text-meta text-danger">{t('Older activity could not be loaded.')}</p>}
    </div>
  )
}

/** Container: local events, pending ops and server paging. */
export function ActivityTab({ task, userId, onOpenComment }: { task: Task; userId?: string; onOpenComment: (commentId: string) => void }) {
  const online = useOnline()
  useFieldDefs() // "changed Cost" rather than fields.<id> (custom-fields)
  const storedMe = useLiveQuery(() => currentUserId(), [], null)
  const me = userId ?? storedMe
  const memberships = useLiveQuery(() => membershipMap(), [], new Map<string, Membership>())
  const local = useLiveQuery(() => taskActivity(task.id), [task.id], [] as ActivityEvent[])
  const pending = useLiveQuery(() => pendingOpIds(), [], new Set<string>())
  const projects = useAllProjects()
  const [older, setOlder] = useState<ActivityEvent[]>([])
  const [cursor, setCursor] = useState<string | undefined>()
  const [more, setMore] = useState(true)
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'error'>('idle')

  useEffect(() => {
    setOlder([])
    setCursor(undefined)
    setMore(true)
    setLoadState('idle')
  }, [task.id])

  const name = useCallback((id: string, ev?: ActivityEvent) => {
    const guest = guestActorLabel(ev)
    if (guest) return guest
    if (id && id === me) return t('You')
    return memberName(id, memberships) ?? (ev?.actorName || older.find((e) => e.actor === id && e.actorName)?.actorName) ?? t('Someone')
  }, [me, memberships, older])
  const project = useCallback((id: string | null) => (id ? projects.find((p) => p.id === id)?.name ?? t('another project') : t('Inbox')), [projects])
  const runs = useMemo(() => groupRuns(mergeOlder(local, older), { pending }), [local, older, pending])
  // Titles for the tasks a dependencies event names (task-dependencies D8).
  const named = useMemo(() => [...new Set([...local, ...older].flatMap((e) => e.changes.filter((c) => c.field === 'blocked_by').flatMap((c) => (Array.isArray(c.to) ? c.to as string[] : []))))], [local, older])
  const namedTasks = useTasksById(named)
  const titles = useMemo(() => new Map(namedTasks.map((item) => [item.id, item.title])), [namedTasks])
  const taskTitle = useCallback((id: string) => titles.get(id), [titles])

  async function loadOlder() {
    setLoadState('loading')
    try {
      const page = await fetchActivity('task', task.id, cursor)
      setOlder((prev) => [...prev, ...page.events])
      setCursor(page.cursor)
      setMore(page.more)
      setLoadState('idle')
    } catch (err) {
      setLoadState(isNetworkError(err) ? 'idle' : 'error')
      if ((err as { status?: number }).status === 404) setMore(false)
    }
  }

  return (
    <ActivityView runs={runs} name={name} project={project} task={taskTitle} onOpenComment={onOpenComment}
      times={{ created: task.created_at, completed: task.completed_at }}
      canLoadOlder={more && online} loadState={loadState} onLoadOlder={() => void loadOlder()} />
  )
}
