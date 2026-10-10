import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, isNetworkError } from '../lib/api'
import { useOnline } from '../lib/online'
import type { AuditEvent, User } from '../lib/types'
import { AuditPanel, type LogStatus, NeedsConnection } from './AuditPanel'
import { AUDIT_LABELS, eventSummary, shortAgent } from './auditFormat'

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

/** Pure view of the activity list, so tests can render every state. */
export function ActivityView({ status, events, error }: { status: LogStatus; events: AuditEvent[]; error?: string | null }) {
  return (
    <div className="space-y-2">
      <h3 id="activity-heading" className="font-medium">Recent activity</h3>
      <p className="text-sm text-slate-500">Sign-ins and token changes on your account over the last 90 days. If you see one you do not recognise, revoke your API tokens and tell the owner of this server.</p>
      {status === 'offline' ? (
        <NeedsConnection what="activity log" />
      ) : (
        <ul className="divide-y divide-slate-200 dark:divide-slate-800" aria-label="Recent activity">
          {events.map((ev) => (
            <li key={ev.id} tabIndex={0} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500">
              <span className={`min-w-0 flex-1 ${ev.outcome === 'failure' ? 'text-red-700 dark:text-red-400' : ''}`}>
                {AUDIT_LABELS[ev.name] ?? ev.name}
                {eventSummary(ev) && <span className="text-slate-500"> · {eventSummary(ev)}</span>}
              </span>
              <span className="text-xs text-slate-400" title={ev.userAgent}>
                {new Date(ev.ts).toLocaleString()} · {shortAgent(ev.userAgent)}{ev.ip ? ` · ${ev.ip}` : ''}
              </span>
            </li>
          ))}
          {status === 'ready' && events.length === 0 && <li className="py-2 text-sm text-slate-400">No recent activity.</li>}
          {status === 'loading' && events.length === 0 && <li className="py-2 text-sm text-slate-400">Loading…</li>}
          {status === 'error' && <li className="py-2 text-sm text-red-600" role="alert">{error}</li>}
        </ul>
      )}
    </div>
  )
}

/** Settings → Security: personal activity for everyone, the audit log for the owner. */
export function SecuritySettings({ user }: { user: User }) {
  return (
    <>
      <section className="space-y-2" aria-labelledby="security-heading">
        <h2 id="security-heading" className="font-semibold">Security</h2>
        <ActivityPanel />
      </section>
      {user.role === 'owner' && <AuditPanel />}
    </>
  )
}
