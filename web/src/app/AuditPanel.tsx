import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Skeleton } from '../ui'
import { Tooltip } from '../ui'
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
import { relativeTime } from './SecurityPanel'
import { t } from '../lib/i18n'
import { cardCopy, noticeCopy, rowCopy } from '../lib/settingsCopy'

export type LogStatus = 'loading' | 'ready' | 'offline' | 'error'

const PAGE = 50

/** Shown instead of events when there is no connection: stale security data is worse than none. */
export function NeedsConnection({ what }: { what: string }) {
  return (
    <Notice tone="warning">
      {noticeCopy('audit', 'offline', { values: { what } })}
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
  const [filtersOpen, setFiltersOpen] = useState(false)
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
      setNotice(t('Saved.'))
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
    <>
      <SettingsSection {...cardCopy('audit')} testId="audit-panel">
        {offline ? (
          <NeedsConnection what={t('audit log')} />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm" icon="filter" className="md:hidden" aria-expanded={filtersOpen} aria-controls="audit-filters"
                onClick={() => setFiltersOpen(!filtersOpen)} data-audit-filters-toggle>{t('Filters')}</Button>
              <ActiveFilterChips form={form} onRemove={update} />
              <a ref={exportLink} className="ui-btn ui-btn--secondary ui-btn--sm ml-auto" href={exportHref} download data-audit-export>
                <Icon name="download" /> {t('Export')}
              </a>
            </div>
            <AuditFilters id="audit-filters" open={filtersOpen} form={form} accounts={accounts} onUpdate={update} onForm={setForm} onApplyAccount={applyAccount} />
            {error && <Notice tone="danger">{error}</Notice>}
            <AuditTable status={status} events={events} onKeyDown={onTableKey} />
            {cursor && status === 'ready' && (
              <Button variant="secondary" size="sm" onClick={() => void loadMore()} busy={loadingMore}>
                {loadingMore ? t('Fetching more…') : t('Load more')}
              </Button>
            )}
            <p className="text-meta text-muted">{t.rich('Keyboard: export with the current filters by pressing {kbd} while the table has focus.', { kbd: <Kbd k="e" /> })}</p>
          </div>
        )}
      </SettingsSection>
      {!offline && settings && (
        <SettingsSection {...cardCopy('audit-settings')} testId="audit-settings">
          <SettingRow
            {...rowCopy('audit', 'retention')}
            control={
              <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void saveSettings({ retentionDays: Number(retention) }) }}>
                <Field label={t('Days to keep audit events')} hideLabel>
                  <Input className="w-28" type="number" min={7} max={3650} step={1} required value={retention} onChange={(e) => setRetention(e.target.value)} />
                </Field>
                <Button type="submit" variant="primary" size="md" disabled={retention === String(settings.retentionDays)}>{t('Save retention')}</Button>
              </form>
            }
          />
          <SettingRow {...rowCopy('audit', 'addresses')}
            control={<Switch checked={settings.logIp} onChange={toggleAddresses} label={t('Record client addresses (IP)')} hideLabel />} />
          {notice && <Notice tone="success">{notice}</Notice>}
        </SettingsSection>
      )}
      {confirmErase && (
        <ConfirmDialog
          title={t('Turn off address logging?')}
          consequence={t('Every stored client address will be erased from the audit log. This cannot be undone.')}
          confirmLabel={t('Turn off and erase')}
          onConfirm={() => { setConfirmErase(false); return saveSettings({ logIp: false }) }}
          onCancel={() => setConfirmErase(false)}
        />
      )}
    </>
  )
}

const RANGE_LABELS = (): Record<FilterForm['range'], string> => ({
  any: t('Any time'), '1d': t('Last 24 hours'), '7d': t('Last 7 days'), '30d': t('Last 30 days'), custom: t('Custom range'),
})

/** The active filters as chips that remove themselves (audit-log "Audit log card"). */
export function ActiveFilterChips({ form, onRemove }: { form: FilterForm; onRemove: (patch: Partial<FilterForm>) => void }) {
  const chips: { key: string; label: string; clear: Partial<FilterForm> }[] = []
  if (form.name) chips.push({ key: 'name', label: AUDIT_LABELS[form.name] ?? form.name, clear: { name: '' } })
  if (form.actor.trim()) chips.push({ key: 'actor', label: form.actor.trim(), clear: { actor: '' } })
  if (form.outcome) chips.push({ key: 'outcome', label: form.outcome === 'failure' ? t('Failure') : t('Success'), clear: { outcome: '' } })
  if (form.range !== 'any') chips.push({ key: 'range', label: RANGE_LABELS()[form.range], clear: { range: 'any', fromDate: '', toDate: '' } })
  if (chips.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={t('Active filters')} data-audit-chips>
      {chips.map((c) => (
        <li key={c.key}>
          <button type="button" onClick={() => onRemove(c.clear)} aria-label={t('Remove filter: {name}', { name: c.label })} data-audit-chip={c.key}
            className="inline-flex items-center gap-1 rounded-chip border border-default bg-sunken px-2 py-0.5 text-meta text-default hover:bg-raised">
            {c.label}<Icon name="x" size="xs" />
          </button>
        </li>
      ))}
    </ul>
  )
}

interface AuditFiltersProps {
  id: string
  /** Below 768 px the row is behind "Filters"; from 768 px it is always shown. */
  open: boolean
  form: FilterForm
  accounts: string[]
  onUpdate: (patch: Partial<FilterForm>) => void
  onForm: (form: FilterForm) => void
  onApplyAccount: () => void
}

/** The filters in one row from 768 px, and a disclosure below it. */
function AuditFilters({ id, open, form, accounts, onUpdate, onForm, onApplyAccount }: AuditFiltersProps) {
  return (
    <div id={id} className={`${open ? 'flex' : 'hidden'} flex-col gap-3 md:flex md:flex-row md:flex-wrap md:items-end`} role="group" aria-label={t('Audit log filters')}>
      <Field label={t('Event')}>
        <Select className="w-full md:w-48" value={form.name} onChange={(e) => onUpdate({ name: e.target.value as FilterForm['name'] })}>
          <option value="">{t('All events')}</option>
          {AUDIT_EVENT_NAMES.map((n) => <option key={n} value={n}>{AUDIT_LABELS[n]} ({n})</option>)}
        </Select>
      </Field>
      <Field label={t('Account')}>
        <Input className="w-full md:w-52" type="search" list="audit-accounts" placeholder={t('email')} value={form.actor}
          onChange={(e) => (e.target.value === '' ? onUpdate({ actor: '' }) : onForm({ ...form, actor: e.target.value }))} onBlur={onApplyAccount}
          onKeyDown={(e) => { if (e.key === 'Enter') onApplyAccount() }} autoComplete="off" />
      </Field>
      <datalist id="audit-accounts">{accounts.map((a) => <option key={a} value={a} />)}</datalist>
      <Field label={t('Outcome')}>
        <Select className="w-full md:w-32" value={form.outcome} onChange={(e) => onUpdate({ outcome: e.target.value as FilterForm['outcome'] })}>
          <option value="">{t('Any')}</option>
          <option value="success">{t('Success')}</option>
          <option value="failure">{t('Failure')}</option>
        </Select>
      </Field>
      <Field label={t('When')}>
        <Select className="w-full md:w-36" value={form.range} onChange={(e) => onUpdate({ range: e.target.value as FilterForm['range'] })}>
          <option value="any">{t('Any time')}</option>
          <option value="1d">{t('Last 24 hours')}</option>
          <option value="7d">{t('Last 7 days')}</option>
          <option value="30d">{t('Last 30 days')}</option>
          <option value="custom">{t('Custom…')}</option>
        </Select>
      </Field>
      {form.range === 'custom' && (
        <>
          <Field label={t('From')}><Input className="w-full md:w-40" type="date" value={form.fromDate} onChange={(e) => onUpdate({ fromDate: e.target.value })} /></Field>
          <Field label={t('To')}><Input className="w-full md:w-40" type="date" value={form.toDate} onChange={(e) => onUpdate({ toDate: e.target.value })} /></Field>
        </>
      )}
    </div>
  )
}

/** The events as a compact list, one line each; a line opens its details in place. Pure, so tests can render every state. */
export function AuditTable({ status, events, onKeyDown }: { status: LogStatus; events: AuditEvent[]; onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void }) {
  const dt = useDateTimeFormat()
  const [open, setOpen] = useState<number | null>(null)
  if (status === 'offline') return <NeedsConnection what={t('audit log')} />
  const now = Date.now()
  return (
    <div className="rounded-control border border-default focus-visible:outline-2 focus-visible:outline-focus"
      tabIndex={0} onKeyDown={onKeyDown} role="region" aria-label={t('Audit events (press e to export)')}>
      <ul className="divide-y divide-(--ot-border)" data-audit-list>
        {events.map((ev) => {
          const failed = ev.outcome === 'failure'
          const summary = eventSummary(ev)
          const expanded = open === ev.id
          return (
            <li key={ev.id} data-event={ev.name}>
              <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : ev.id)}
                className="flex w-full min-w-0 items-center gap-2 px-2 py-1.5 text-left text-body hover:bg-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus">
                <Icon name={failed ? 'x' : 'history'} size="sm" className={failed ? 'text-danger' : 'text-muted'} />
                <span className={`shrink-0 ${failed ? 'text-danger' : 'text-default'}`}>{AUDIT_LABELS[ev.name] ?? ev.name}</span>
                <span className="min-w-0 truncate text-muted">{eventAccount(ev)}</span>
                <span className="ml-auto hidden shrink-0 truncate text-meta text-muted sm:inline">{shortAgent(ev.userAgent)}</span>
                <time dateTime={new Date(ev.ts).toISOString()} className="shrink-0 text-meta tabular-nums text-muted">
                  {now - ev.ts < 86_400_000 ? relativeTime(ev.ts, now) : dt.formatInstant(ev.ts, 'date')}
                </time>
              </button>
              {expanded && (
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 px-8 pb-2 text-meta" data-audit-details>
                  <dt className="text-muted">{t('Time')}</dt><dd>{dt.formatInstant(ev.ts, 'datetime')}</dd>
                  {summary && <><dt className="text-muted">{t('Details')}</dt><dd className="break-words">{summary}</dd></>}
                  <dt className="text-muted">{t('Client')}</dt>
                  <dd className="break-words">{ev.userAgent ? <Tooltip label={ev.userAgent}><span tabIndex={0} className="rounded-chip">{shortAgent(ev.userAgent)}</span></Tooltip> : shortAgent(ev.userAgent)}{ev.ip ? ` · ${ev.ip}` : ''}</dd>
                  {failed && <><dt className="text-muted">{t('Outcome')}</dt><dd><Badge hue="red">{t('failure')}</Badge></dd></>}
                </dl>
              )}
            </li>
          )
        })}
        {status === 'ready' && events.length === 0 && <li className="px-2 py-3 text-muted">{t('No events match these filters.')}</li>}
        {status === 'loading' && events.length === 0 && <li className="px-2 py-3"><Skeleton shape="line" count={4} label={t('Loading events')} /></li>}
      </ul>
    </div>
  )
}
