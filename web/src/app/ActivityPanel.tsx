import { useCallback, useEffect, useState } from 'react'
import { Badge } from '../ui'
import { Icon, type IconName } from '../ui'
import { EmptyState } from '../ui'
import { ListRow } from '../ui'
import { Notice } from '../ui'
import { SettingsSection } from '../ui'
import { api, ApiError, isNetworkError } from '../lib/api'
import { useOnline } from '../lib/online'
import type { AuditEvent, User } from '../lib/types'
import { AuditPanel, type LogStatus, NeedsConnection } from './AuditPanel'
import { AUDIT_LABELS, eventSummary, shortAgent } from './auditFormat'
import { relativeTime } from './SecurityPanel'
import { useDateTimeFormat } from './DateTimePrefsProvider'

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

/** Pure view of the activity list, so tests can render every state. */
export function ActivityView({ status, events, error, now = Date.now() }: { status: LogStatus; events: AuditEvent[]; error?: string | null; now?: number }) {
  const dt = useDateTimeFormat()
  return (
    <SettingsSection
      title="Recent activity"
      headingId="activity-heading"
      testId="activity-panel"
      description="Sign-ins and token changes on your account over the last 90 days. If you see one you do not recognise, revoke your API tokens and tell the owner of this server."
    >
      {status === 'offline' ? (
        <NeedsConnection what="activity log" />
      ) : (
        <>
          {status === 'error' && <Notice tone="danger">{error}</Notice>}
          {status === 'loading' && events.length === 0 && <p className="text-sm text-muted" role="status">Loading…</p>}
          {status === 'ready' && events.length === 0 && (
            <EmptyState icon="history" title="No recent activity." body="Sign-ins and token changes on your account will show up here." />
          )}
          {events.length > 0 && (
            <div className="-mx-3 space-y-0.5" role="list" aria-label="Recent activity">
              {events.map((ev) => {
                const failed = ev.outcome === 'failure'
                const summary = eventSummary(ev)
                return (
                  <div key={ev.id} role="listitem" data-event={ev.name}>
                    <ListRow
                      leading={<Icon name={activityIcon(ev)} className={failed ? 'text-danger' : undefined} />}
                      label={<span className={failed ? 'text-danger' : undefined}>{AUDIT_LABELS[ev.name] ?? ev.name}{summary && <span className="text-muted"> · {summary}</span>}</span>}
                      meta={
                        <span title={ev.userAgent}>
                          <time dateTime={new Date(ev.ts).toISOString()} title={dt.formatInstant(ev.ts, 'datetime')}>{relativeTime(ev.ts, now)}</time>
                          {' · '}{shortAgent(ev.userAgent)}{ev.ip ? ` · ${ev.ip}` : ''}
                        </span>
                      }
                      badges={failed ? <Badge hue="red">Failed</Badge> : undefined}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </SettingsSection>
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
