// Today's sessions (OpenSpec change focus-redesign, design D5): the Focus screen's
// menu opens this sheet over today's time entries that the Focus screen wrote (a set
// `focus_mode`), newest first, with the count and the total on top. Local rows only,
// nothing written; its own lazy chunk.
import { useMemo } from 'react'
import { Dialog } from '../../ui'
import { formatClock } from '../../lib/dates'
import { formatMinutes } from '../../lib/duration'
import { FOCUS_MODES, modeName, type FocusMode } from '../../lib/focus/prefs'
import { entryDay, minutesOf } from '../../lib/time'
import { useLiveEntries, useMe, useMinuteNow } from '../../lib/timeEntries'
import { useLiveTasks } from '../../lib/liveTasks'
import type { Task, TimeEntry } from '../../lib/types'
import { t } from '../../lib/i18n'
import { useToday } from '../useViews'

export interface FocusSession {
  id: string
  startedAt: number
  title: string
  mode: FocusMode
  minutes: number
}

/** Today's focus sessions of `me`, newest first: entries with a known `focus_mode` started on the logical `today`. */
export function todaysSessions(entries: readonly TimeEntry[], tasks: readonly Task[], me: string | null, today: string, now: number, dayOf: (ms: number) => string = (ms) => entryDay(ms)): FocusSession[] {
  if (!me) return []
  const byId = new Map(tasks.map((x) => [x.id, x]))
  return entries
    .filter((e) => !e.deleted_at && e.user_id === me && (FOCUS_MODES as readonly string[]).includes(e.focus_mode ?? '') && dayOf(e.started_at) === today)
    .sort((a, b) => b.started_at - a.started_at || (a.id < b.id ? 1 : -1))
    .map((e) => ({ id: e.id, startedAt: e.started_at, title: byId.get(e.task_id)?.title || t('Untitled'), mode: e.focus_mode as FocusMode, minutes: minutesOf(e, now) }))
}

/** "3 sessions · 1h 30m". */
export function sessionsSummary(list: readonly FocusSession[]): string {
  const total = list.reduce((sum, s) => sum + s.minutes, 0)
  return [t('{n, plural, one {# session} other {# sessions}}', { n: list.length }), formatMinutes(total)].join(' · ')
}

export default function FocusSessions({ onClose }: { onClose: () => void }) {
  const entries = useLiveEntries()
  const tasks = useLiveTasks()
  const me = useMe()
  const today = useToday()
  const live = entries.some((e) => e.ended_at === null && e.user_id === me)
  const now = useMinuteNow(live)
  const list = useMemo(() => todaysSessions(entries, tasks ?? [], me, today, now), [entries, tasks, me, today, now])
  return (
    <Dialog title={t('Today’s sessions')} onClose={onClose} size="sm" placement="sheet" testId="focus-sessions">
      {list.length === 0
        ? <p className="py-2 text-body text-muted" data-focus-sessions-empty>{t('No focus sessions today.')}</p>
        : (
          <>
            <p className="text-meta font-medium text-default tabular-nums" data-focus-sessions-summary>{sessionsSummary(list)}</p>
            <ul className="mt-3 divide-y divide-soft" data-focus-sessions>
              {list.map((s) => (
                <li key={s.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-3 py-2" data-focus-session={s.id}>
                  <span className="text-meta text-muted tabular-nums">{formatClock(s.startedAt, false)}</span>
                  <span className="min-w-0">
                    <span className="block truncate user-text text-body text-default">{s.title}</span>
                    <span className="block text-meta text-muted">{modeName(s.mode)}</span>
                  </span>
                  <span className="text-meta text-default tabular-nums">{formatMinutes(s.minutes)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
    </Dialog>
  )
}
