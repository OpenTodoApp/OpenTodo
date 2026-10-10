import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError, auditExportUrl, isNetworkError } from '../lib/api'
import { useOnline } from '../lib/online'
import { AUDIT_EVENT_NAMES, type AuditEvent, type AuditFilters, type AuditSettings } from '../lib/types'
import { AUDIT_LABELS, EMPTY_FORM, eventAccount, eventSummary, type FilterForm, shortAgent, toFilters } from './auditFormat'

export type LogStatus = 'loading' | 'ready' | 'offline' | 'error'

const PAGE = 50

/** Shown instead of events when there is no connection: stale security data is worse than none. */
export function NeedsConnection({ what }: { what: string }) {
  return (
    <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200" role="status">
      You are offline. The {what} lives on the server and needs a connection; nothing is shown until you are back online.
    </p>
  )
}

/**
 * Owner-only Settings section: the server audit log with filters, a paginated
 * table, NDJSON export and the retention and address-logging settings. Data is
 * fetched live and kept in component state only, never in browser storage.
 */
export function AuditPanel() {
  const online = useOnline()
  const [form, setForm] = useState<FilterForm>(EMPTY_FORM)
  const [applied, setApplied] = useState<AuditFilters>({})
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [cursor, setCursor] = useState<number | null>(null)
  const [status, setStatus] = useState<LogStatus>('loading')
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<AuditSettings | null>(null)
  const [retention, setRetention] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const exportLink = useRef<HTMLAnchorElement>(null)

  const fail = useCallback((err: unknown) => {
    if (isNetworkError(err)) {
      setStatus('offline')
      setEvents([])
      setCursor(null)
    } else {
      setStatus('error')
      setError((err as ApiError).message)
    }
  }, [])

  const load = useCallback(async (filters: AuditFilters) => {
    setError(null)
    setStatus('loading')
    try {
      const res = await api.listAudit(filters, null, PAGE)
      setEvents(res.events)
      setCursor(res.cursor)
      setStatus('ready')
    } catch (err) {
      fail(err)
    }
  }, [fail])

  const loadSettings = useCallback(async () => {
    try {
      const s = await api.getAuditSettings()
      setSettings(s)
      setRetention(String(s.retentionDays))
    } catch (err) {
      fail(err)
    }
  }, [fail])

  useEffect(() => {
    if (!online) {
      setStatus('offline')
      setEvents([])
      setCursor(null)
      return
    }
    void load(applied)
  }, [online, applied, load])

  useEffect(() => {
    if (online) void loadSettings()
  }, [online, loadSettings])

  function update(patch: Partial<FilterForm>) {
    const next = { ...form, ...patch }
    setForm(next)
    setApplied(toFilters(next))
  }

  /** The account field applies on Enter or when it loses focus, not on every keystroke. */
  function applyAccount() {
    const next = toFilters(form)
    if (next.actor !== applied.actor) setApplied(next)
  }

  async function loadMore() {
    if (!cursor) return
    setLoadingMore(true)
    try {
      const res = await api.listAudit(applied, cursor, PAGE)
      setEvents((prev) => [...prev, ...res.events])
      setCursor(res.cursor)
    } catch (err) {
      fail(err)
    } finally {
      setLoadingMore(false)
    }
  }

  async function saveSettings(patch: Partial<AuditSettings>) {
    setError(null)
    setNotice(null)
    try {
      const s = await api.updateAuditSettings(patch)
      setSettings(s)
      setRetention(String(s.retentionDays))
      setNotice('Saved.')
      await load(applied)
    } catch (err) {
      if (isNetworkError(err)) fail(err)
      else setError((err as ApiError).message)
    }
  }

  function toggleAddresses(on: boolean) {
    if (!on && !window.confirm('Turn off address logging? Every stored client address will be erased from the audit log.')) return
    void saveSettings({ logIp: on })
  }

  function onTableKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'e' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault()
      exportLink.current?.click()
    }
  }

  const accounts = useMemo(() => [...new Set(events.flatMap((ev) => [ev.actorEmail, ev.targetEmail]).filter(Boolean) as string[])].sort(), [events])
  const offline = !online || status === 'offline'
  const exportHref = auditExportUrl(applied)

  return (
    <section className="space-y-3" aria-labelledby="audit-heading">
      <h2 id="audit-heading" className="font-semibold">Audit log</h2>
      <p className="text-sm text-slate-500">
        Sign-ins, tokens, invitations, exports and setting changes on this server. Task content is never recorded.
      </p>

      {offline ? (
        <NeedsConnection what="audit log" />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2" role="group" aria-label="Audit log filters">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600 dark:text-slate-300">Event</span>
              <select className="input w-48" aria-label="Event filter" value={form.name} onChange={(e) => update({ name: e.target.value as FilterForm['name'] })}>
                <option value="">All events</option>
                {AUDIT_EVENT_NAMES.map((n) => <option key={n} value={n}>{AUDIT_LABELS[n]} ({n})</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600 dark:text-slate-300">Account</span>
              <input className="input w-52" type="search" aria-label="Account filter" list="audit-accounts" placeholder="email" value={form.actor}
                onChange={(e) => (e.target.value === '' ? update({ actor: '' }) : setForm({ ...form, actor: e.target.value }))} onBlur={applyAccount}
                onKeyDown={(e) => { if (e.key === 'Enter') applyAccount() }} autoComplete="off" />
              <datalist id="audit-accounts">{accounts.map((a) => <option key={a} value={a} />)}</datalist>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600 dark:text-slate-300">Outcome</span>
              <select className="input w-32" aria-label="Outcome filter" value={form.outcome} onChange={(e) => update({ outcome: e.target.value as FilterForm['outcome'] })}>
                <option value="">Any</option>
                <option value="success">Success</option>
                <option value="failure">Failure</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600 dark:text-slate-300">When</span>
              <select className="input w-36" aria-label="Time range" value={form.range} onChange={(e) => update({ range: e.target.value as FilterForm['range'] })}>
                <option value="any">Any time</option>
                <option value="1d">Last 24 hours</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="custom">Custom…</option>
              </select>
            </label>
            {form.range === 'custom' && (
              <>
                <label className="block text-sm">
                  <span className="mb-1 block text-slate-600 dark:text-slate-300">From</span>
                  <input className="input w-40" type="date" value={form.fromDate} onChange={(e) => update({ fromDate: e.target.value })} />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-slate-600 dark:text-slate-300">To</span>
                  <input className="input w-40" type="date" value={form.toDate} onChange={(e) => update({ toDate: e.target.value })} />
                </label>
              </>
            )}
            <a ref={exportLink} className="btn-ghost border border-slate-300 dark:border-slate-700" href={exportHref} download>
              Export (NDJSON)
            </a>
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}
          <AuditTable status={status} events={events} onKeyDown={onTableKey} />
          {cursor && status === 'ready' && (
            <button type="button" className="btn-ghost border border-slate-300 text-sm dark:border-slate-700" onClick={() => void loadMore()} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
          <p className="text-xs text-slate-400">Keyboard: focus the table and press <span className="kbd">e</span> to export with the current filters.</p>

          {settings && (
            <div className="space-y-2 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">
              <h3 className="font-medium">Audit settings</h3>
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  void saveSettings({ retentionDays: Number(retention) })
                }}
              >
                <label className="block">
                  <span className="mb-1 block text-slate-600 dark:text-slate-300">Keep events for (days, 7–3650)</span>
                  <input className="input w-28" type="number" min={7} max={3650} step={1} required value={retention} onChange={(e) => setRetention(e.target.value)} />
                </label>
                <button className="btn-primary" disabled={retention === String(settings.retentionDays)}>Save retention</button>
              </form>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={settings.logIp} onChange={(e) => toggleAddresses(e.target.checked)} />
                <span>Record client addresses (IP)</span>
              </label>
              <p className="text-xs text-slate-400">
                Off by default. Turning it off erases every stored address. Behind a reverse proxy the address comes from <code>X-Forwarded-For</code>.
              </p>
              {notice && <p className="text-xs text-emerald-700 dark:text-emerald-400" role="status">{notice}</p>}
            </div>
          )}
        </>
      )}
    </section>
  )
}

/** The event table. Pure, so tests can render every state. */
export function AuditTable({ status, events, onKeyDown }: { status: LogStatus; events: AuditEvent[]; onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void }) {
  if (status === 'offline') return <NeedsConnection what="audit log" />
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200 focus-visible:outline-2 focus-visible:outline-emerald-500 dark:border-slate-800"
      tabIndex={0} onKeyDown={onKeyDown} aria-label="Audit events (press e to export)">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-900">
          <tr>
            <th className="px-2 py-1.5 font-medium">Time</th>
            <th className="px-2 py-1.5 font-medium">Event</th>
            <th className="px-2 py-1.5 font-medium">Account</th>
            <th className="px-2 py-1.5 font-medium">Details</th>
            <th className="px-2 py-1.5 font-medium">Client</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
          {events.map((ev) => (
            <tr key={ev.id} tabIndex={0} className="align-top focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-500" data-event={ev.name}>
              <td className="whitespace-nowrap px-2 py-1.5 text-xs text-slate-500">{new Date(ev.ts).toLocaleString()}</td>
              <td className="px-2 py-1.5">
                <span className={ev.outcome === 'failure' ? 'text-red-700 dark:text-red-400' : ''}>{AUDIT_LABELS[ev.name] ?? ev.name}</span>
                {ev.outcome === 'failure' && <span className="ml-1 rounded bg-red-100 px-1 text-xs text-red-700 dark:bg-red-900/40 dark:text-red-200">failure</span>}
              </td>
              <td className="px-2 py-1.5">{eventAccount(ev)}</td>
              <td className="px-2 py-1.5 text-slate-600 dark:text-slate-300">{eventSummary(ev)}</td>
              <td className="px-2 py-1.5 text-xs text-slate-500" title={ev.userAgent}>
                {shortAgent(ev.userAgent)}{ev.ip ? ` · ${ev.ip}` : ''}
              </td>
            </tr>
          ))}
          {status === 'ready' && events.length === 0 && (
            <tr><td colSpan={5} className="px-2 py-3 text-slate-400">No events match these filters.</td></tr>
          )}
          {status === 'loading' && events.length === 0 && (
            <tr><td colSpan={5} className="px-2 py-3 text-slate-400">Loading…</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
