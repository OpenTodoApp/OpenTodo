import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Skeleton } from '../ui'
import { Kbd } from './shortcuts/Kbd'
import { api, ApiError, auditExportUrl, isNetworkError } from '../lib/api'
import { useOnline } from '../lib/online'
import { Button } from '../ui'
import { Badge } from '../ui'
import { Field, Input, Select } from '../ui'
import { Icon } from '../ui'
import { Switch } from '../ui'
import { ConfirmDialog } from '../ui'
import { Notice } from '../ui'
import { SettingRow, SettingsSection } from '../ui'
import { AUDIT_EVENT_NAMES, type AuditEvent, type AuditFilters, type AuditSettings } from '../lib/types'
import { AUDIT_LABELS, EMPTY_FORM, eventAccount, eventSummary, type FilterForm, shortAgent, toFilters } from './auditFormat'
import { useDateTimeFormat } from './DateTimePrefsProvider'

export type LogStatus = 'loading' | 'ready' | 'offline' | 'error'

const PAGE = 50

/** Shown instead of events when there is no connection: stale security data is worse than none. */
export function NeedsConnection({ what }: { what: string }) {
  return (
    <Notice tone="warning">
      You are offline. The {what} lives on the server and needs a connection; nothing is shown until you are back online.
    </Notice>
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
  const [confirmErase, setConfirmErase] = useState(false)
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
    if (!on) setConfirmErase(true)
    else void saveSettings({ logIp: true })
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
    <SettingsSection
      title="Audit log"
      headingId="audit-heading"
      testId="audit-panel"
      description="Sign-ins, tokens, invitations, exports and setting changes on this server. Task content is never recorded."
    >
      {offline ? (
        <NeedsConnection what="audit log" />
      ) : (
        <>
          <div className="space-y-3 pb-4">
            <div className="flex flex-wrap items-end gap-3" role="group" aria-label="Audit log filters">
              <Field label="Event">
                <Select className="w-48" value={form.name} onChange={(e) => update({ name: e.target.value as FilterForm['name'] })}>
                  <option value="">All events</option>
                  {AUDIT_EVENT_NAMES.map((n) => <option key={n} value={n}>{AUDIT_LABELS[n]} ({n})</option>)}
                </Select>
              </Field>
              <Field label="Account">
                <Input className="w-52" type="search" list="audit-accounts" placeholder="email" value={form.actor}
                  onChange={(e) => (e.target.value === '' ? update({ actor: '' }) : setForm({ ...form, actor: e.target.value }))} onBlur={applyAccount}
                  onKeyDown={(e) => { if (e.key === 'Enter') applyAccount() }} autoComplete="off" />
              </Field>
              <datalist id="audit-accounts">{accounts.map((a) => <option key={a} value={a} />)}</datalist>
              <Field label="Outcome">
                <Select className="w-32" value={form.outcome} onChange={(e) => update({ outcome: e.target.value as FilterForm['outcome'] })}>
                  <option value="">Any</option>
                  <option value="success">Success</option>
                  <option value="failure">Failure</option>
                </Select>
              </Field>
              <Field label="When">
                <Select className="w-36" value={form.range} onChange={(e) => update({ range: e.target.value as FilterForm['range'] })}>
                  <option value="any">Any time</option>
                  <option value="1d">Last 24 hours</option>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="custom">Custom…</option>
                </Select>
              </Field>
              {form.range === 'custom' && (
                <>
                  <Field label="From">
                    <Input className="w-40" type="date" value={form.fromDate} onChange={(e) => update({ fromDate: e.target.value })} />
                  </Field>
                  <Field label="To">
                    <Input className="w-40" type="date" value={form.toDate} onChange={(e) => update({ toDate: e.target.value })} />
                  </Field>
                </>
              )}
              <a ref={exportLink} className="ui-btn ui-btn--secondary ui-btn--md" href={exportHref} download>
                <Icon name="download" /> Export (NDJSON)
              </a>
            </div>

            {error && <Notice tone="danger">{error}</Notice>}
            <AuditTable status={status} events={events} onKeyDown={onTableKey} />
            {cursor && status === 'ready' && (
              <Button variant="secondary" size="sm" onClick={() => void loadMore()} busy={loadingMore}>
                {loadingMore ? 'Fetching more…' : 'Load more'}
              </Button>
            )}
            <p className="text-meta text-muted">Keyboard: export with the current filters by pressing <Kbd k="e" /> while the table has focus.</p>
          </div>

          {settings && (
            <div className="space-y-3 pt-4" data-testid="audit-settings">
              <h3 className="text-sm font-semibold text-default">Audit settings</h3>
              <SettingRow
                label="Keep events for"
                description="Between 7 and 3650 days. Older events are deleted."
                control={
                  <form
                    className="flex items-end gap-2"
                    onSubmit={(e) => {
                      e.preventDefault()
                      void saveSettings({ retentionDays: Number(retention) })
                    }}
                  >
                    <Field label="Days to keep audit events" hideLabel>
                      <Input className="w-28" type="number" min={7} max={3650} step={1} required value={retention} onChange={(e) => setRetention(e.target.value)} />
                    </Field>
                    <Button type="submit" variant="primary" size="md" disabled={retention === String(settings.retentionDays)}>Save retention</Button>
                  </form>
                }
              />
              <SettingRow
                label="Record client addresses (IP)"
                description={<>Off by default. Turning it off erases every stored address. Behind a reverse proxy the address comes from <code>X-Forwarded-For</code>.</>}
                control={<Switch checked={settings.logIp} onChange={toggleAddresses} label="Record client addresses (IP)" hideLabel />}
              />
              {notice && <Notice tone="success">{notice}</Notice>}
            </div>
          )}
        </>
      )}
      {confirmErase && (
        <ConfirmDialog
          title="Turn off address logging?"
          consequence="Every stored client address will be erased from the audit log. This cannot be undone."
          confirmLabel="Turn off and erase"
          onConfirm={() => { setConfirmErase(false); return saveSettings({ logIp: false }) }}
          onCancel={() => setConfirmErase(false)}
        />
      )}
    </SettingsSection>
  )
}

/** The event table. Pure, so tests can render every state. */
export function AuditTable({ status, events, onKeyDown }: { status: LogStatus; events: AuditEvent[]; onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void }) {
  const dt = useDateTimeFormat()
  if (status === 'offline') return <NeedsConnection what="audit log" />
  return (
    <div className="overflow-x-auto rounded-control border border-default focus-visible:outline-2 focus-visible:outline-focus"
      tabIndex={0} onKeyDown={onKeyDown} aria-label="Audit events (press e to export)" data-scroll-x>
      <table className="w-full text-left text-sm">
        <thead className="bg-sunken text-meta text-muted dark:bg-raised">
          <tr>
            <th className="px-2 py-1.5 font-medium">Time</th>
            <th className="px-2 py-1.5 font-medium">Event</th>
            <th className="px-2 py-1.5 font-medium">Account</th>
            <th className="px-2 py-1.5 font-medium">Details</th>
            <th className="px-2 py-1.5 font-medium">Client</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-(--ot-border)">
          {events.map((ev) => (
            <tr key={ev.id} tabIndex={0} className="align-top focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus" data-event={ev.name}>
              <td className="whitespace-nowrap px-2 py-1.5 text-meta text-muted">{dt.formatInstant(ev.ts, 'datetime')}</td>
              <td className="px-2 py-1.5">
                <span className={ev.outcome === 'failure' ? 'text-danger' : ''}>{AUDIT_LABELS[ev.name] ?? ev.name}</span>
                {ev.outcome === 'failure' && <> <Badge hue="red">failure</Badge></>}
              </td>
              <td className="px-2 py-1.5">{eventAccount(ev)}</td>
              <td className="px-2 py-1.5 text-muted">{eventSummary(ev)}</td>
              <td className="px-2 py-1.5 text-meta text-muted" title={ev.userAgent}>
                {shortAgent(ev.userAgent)}{ev.ip ? ` · ${ev.ip}` : ''}
              </td>
            </tr>
          ))}
          {status === 'ready' && events.length === 0 && (
            <tr><td colSpan={5} className="px-2 py-3 text-muted">No events match these filters.</td></tr>
          )}
          {status === 'loading' && events.length === 0 && (
            <tr><td colSpan={5} className="px-2 py-3"><Skeleton shape="line" count={4} label="Loading events" /></td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
