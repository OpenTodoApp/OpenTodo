import { useCallback, useEffect, useState } from 'react'
import { Button, EmptyState, Icon, type IconName, Notice, SettingsSection, Skeleton, Tooltip } from '../ui'
import { api, ApiError, isNetworkError } from '../lib/api'
import { todayISO } from '../lib/dates'
import { useOnline } from '../lib/online'
import type { AuditEvent, User } from '../lib/types'
import { AuditPanel, type LogStatus, NeedsConnection } from './AuditPanel'
import { type ActivityDay, activityDayHeading, AUDIT_LABELS, eventSummary, firstLines, groupActivity, lineCount, shortAgent } from './auditFormat'
import { relativeTime } from './SecurityPanel'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { t } from '../lib/i18n'
import { cardCopy } from '../lib/settingsCopy'

/**
 * Every user's own recent access events (sign-ins, failed sign-ins against the
 * account, sign-outs, tokens) from the last 90 days, so they can notice access
 * they did not perform. Fetched live; nothing is kept in browser storage.
 */
export function ActivityPanel() {
  const online = useOnline()
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [status, setStatus] = useState<LogStatus>('loading')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      setEvents((await api.myActivity()).events)
      setStatus('ready')
    } catch (err) {
      if (isNetworkError(err)) {
        setEvents([])
        setStatus('offline')
      } else {
        setError((err as ApiError).message)
        setStatus('error')
      }
    }
  }, [])

  useEffect(() => {
    if (online) void load()
    else {
      setEvents([])
      setStatus('offline')
    }
  }, [online, load])

  return <ActivityView status={online ? status : 'offline'} events={events} error={error} />
}

/** The icon for an event kind: sign-ins, sign-outs, credentials, linked identities. */
export function activityIcon(ev: AuditEvent): IconName {
  if (ev.outcome === 'failure') return 'x'
  if (ev.name === 'logout') return 'log-out'
  if (ev.name.startsWith('login.')) return 'user-check'
  if (ev.name.startsWith('token.') || ev.name.startsWith('app_password.')) return 'key-round'
  if (ev.name.startsWith('mfa.') || ev.name.startsWith('passkey.')) return 'shield-check'
  if (ev.name.startsWith('identity.')) return 'link'
  return 'history'
}

/** Lines shown before "Show all" (settings-refresh D4). */
export const ACTIVITY_LINES = 10

/** Pure view of the activity list, so tests can render every state. */
export function ActivityView({ status, events, error, now = Date.now() }: { status: LogStatus; events: AuditEvent[]; error?: string | null; now?: number }) {
  const [all, setAll] = useState(false)
  const days = groupActivity(events)
  const total = lineCount(days)
  const shown = all ? days : firstLines(days, ACTIVITY_LINES)
  return (
    <SettingsSection {...cardCopy('activity')} testId="activity-panel">
      {status === 'offline' ? (
        <NeedsConnection what={t('activity log')} />
      ) : (
        <>
          {status === 'error' && <Notice tone="danger">{error}</Notice>}
          {status === 'loading' && events.length === 0 && <Skeleton shape="line" count={4} label={t('Loading activity')} />}
          {status === 'ready' && events.length === 0 && (
            <EmptyState icon="history" title={t('No recent activity.')} body={t('Sign-ins and token changes on your account will show up here.')} />
          )}
          {shown.map((d) => <ActivityDayList key={d.day} day={d} now={now} />)}
          {total > ACTIVITY_LINES && (
            <Button variant="ghost" size="sm" className="mt-2" aria-expanded={all} onClick={() => setAll(!all)} data-activity-show-all>
              {all ? t('Show less') : t('Show all ({n})', { n: total })}
            </Button>
          )}
        </>
      )}
    </SettingsSection>
  )
}

/** One day: its heading ("Today", "Yesterday", the date) and one line per event or folded sign-ins. */
function ActivityDayList({ day, now }: { day: ActivityDay; now: number }) {
  const dt = useDateTimeFormat()
  const heading = activityDayHeading(day.day, todayISO(new Date(now)), (iso) => dt.formatDate(iso, 'compact'))
  return (
    <section className="pt-3 first:pt-0" data-activity-day={day.day}>
      <h3 className="text-meta font-medium text-muted">{heading}</h3>
      <ul className="mt-1" aria-label={heading}>
        {day.lines.map(({ event: ev, count, warn }) => {
          const summary = eventSummary(ev)
          const what = AUDIT_LABELS[ev.name] ?? ev.name
          return (
            <li key={ev.id} data-event={ev.name} data-activity-warn={warn || undefined}
              className="flex min-w-0 items-center gap-2 py-1 text-body">
              <Icon name={activityIcon(ev)} size="sm" className={`${warn ? 'text-warning' : 'text-muted'}`} />
              <span className={`min-w-0 truncate ${warn ? 'text-warning' : 'text-default'}`} data-activity-line>
                {count > 1 ? t('{what} ×{n}', { what, n: count }) : what}
                {summary && <span className="text-muted"> · {summary}</span>}
                <span className="text-muted"> · {ev.userAgent ? <Tooltip label={ev.userAgent}><span tabIndex={0} className="rounded-chip">{shortAgent(ev.userAgent)}</span></Tooltip> : shortAgent(ev.userAgent)}</span>
              </span>
              <Tooltip label={[dt.formatInstant(ev.ts, 'datetime'), ev.ip].filter(Boolean).join(' · ')}>
                <time dateTime={new Date(ev.ts).toISOString()} tabIndex={0} className="ml-auto shrink-0 rounded-chip text-meta tabular-nums text-muted">
                  {now - ev.ts < 3_600_000 ? relativeTime(ev.ts, now) : dt.formatInstant(ev.ts, 'time')}
                </time>
              </Tooltip>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Recent activity for everyone and the audit log for the owner (Settings → Account). */
export function SecuritySettings({ user }: { user: User }) {
  return (
    <>
      <ActivityPanel />
      {user.role === 'owner' && <AuditPanel />}
    </>
  )
}
