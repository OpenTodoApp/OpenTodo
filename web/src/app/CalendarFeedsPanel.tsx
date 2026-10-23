import { useCallback, useEffect, useState } from 'react'
import { Button, ConfirmDialog, Field, HUES, hueFor, Icon, Input, ListRow, MenuItem, Notice, Select, SettingRow, SettingsSection, Switch, Dialog, Menu, StatusIndicator, toneForHue } from '../ui'
import { api, ApiError, isNetworkError } from '../lib/api'
import { refreshEvents } from '../lib/calendarFeeds'
import { cachedCalendarSubscriptions } from '../lib/localData'
import { useEncryption } from '../lib/e2ee'
import { useOnline } from '../lib/online'
import type { CalendarFeed, CalendarSubscription } from '../lib/types'
import { SecretReveal } from './TokensSection'
import { t } from '../lib/i18n'
import { cardCopy, noticeCopy, rowCopy } from '../lib/settingsCopy'
import { useSettingsPending } from './settingsPending'

// Settings → Integrations → Calendar feeds (OpenSpec change calendar-feeds, design
// D9): the owner's switch, the user's subscribed calendars, and the private task
// feed URL. The pure CalendarFeedsView renders every state; CalendarFeedsPanel
// loads and acts. Server data: offline, the last loaded state stays visible with
// actions disabled.

export interface SubscriptionDraft {
  id?: string
  url: string
  name: string
  color: string
}

export interface CalendarFeedsViewProps {
  isOwner: boolean
  /** null while unknown (offline before the first load). */
  enabled: boolean | null
  connected: boolean
  encrypted: boolean
  subscriptions: CalendarSubscription[] | null
  feed: CalendarFeed | null | undefined
  busy: boolean
  error: string | null
  draft: SubscriptionDraft | null
  /** The feed URL just created or rotated; shown once. */
  feedUrl: string | null
  now?: number
  onToggle: (on: boolean) => void
  onDraftChange: (d: SubscriptionDraft | null) => void
  onSave: () => void
  onRefresh: (s: CalendarSubscription) => void
  onSetEnabled: (s: CalendarSubscription, enabled: boolean) => void
  onDelete: (s: CalendarSubscription) => Promise<void> | void
  onCreateFeed: () => void
  onRotateFeed: () => Promise<void> | void
  onRevokeFeed: () => Promise<void> | void
  onDismissUrl: () => void
}

export function ago(ms: number, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - ms) / 60000))
  if (m < 1) return t('just now')
  if (m < 60) return t('{m} min ago', { m })
  const h = Math.round(m / 60)
  if (h < 24) return t('{h} h ago', { h })
  return t('{d} d ago', { d: Math.round(h / 24) })
}

/** One line of status for a subscription row. */
export function subscriptionStatus(s: CalendarSubscription, now = Date.now()): string {
  const last = s.lastSuccessAt ? t('last success {ago}', { ago: ago(s.lastSuccessAt, now) }) : t('never refreshed')
  if (!s.enabled) return s.stoppedReason ? t('Stopped: {reason}', { reason: s.stoppedReason }) : t('Disabled')
  if (s.lastError) return t('Failed: {error} · {last}', { error: s.lastError, last })
  return s.lastSuccessAt ? t('Refreshed {ago}', { ago: ago(s.lastSuccessAt, now) }) : t('Waiting for the first refresh')
}

const emptyDraft = (): SubscriptionDraft => ({ url: '', name: '', color: HUES[7].hex })
const hueLabel = (n: string) => n[0].toUpperCase() + n.slice(1)

export function CalendarFeedsView(p: CalendarFeedsViewProps) {
  const [deleting, setDeleting] = useState<CalendarSubscription | null>(null)
  const [confirmFeed, setConfirmFeed] = useState<'rotate' | 'revoke' | null>(null)
  const disabled = !p.connected || p.busy
  const now = p.now ?? Date.now()
  const on = p.enabled === true
  const subs = p.subscriptions ?? []
  return (
    <SettingsSection {...cardCopy('calendar-feeds')} testId="calendar-feeds-panel">
      {!p.connected && <Notice>{noticeCopy('calendar-feeds', 'offline')}</Notice>}
      {p.enabled !== null && (
        <SettingRow label={rowCopy('calendar-feeds', 'server', { variant: 'owner' }).label}
          description={p.isOwner || !on ? rowCopy('calendar-feeds', 'server', { variant: p.isOwner ? 'owner' : 'member' }).description : undefined}
          status={<StatusIndicator tone={toneForHue(on ? 'green' : 'slate')}>{on ? t('On') : t('Off')}</StatusIndicator>}
          control={p.isOwner && <Switch checked={on} disabled={disabled} onChange={p.onToggle} label={t('Allow calendar feeds on this server')} hideLabel />} />
      )}
      {p.error && <Notice tone="danger">{p.error}</Notice>}

      {on && (
        <>
          <div className="space-y-2 py-3" data-testid="calendar-subscriptions">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-body font-medium text-default">{t('Other calendars')}</h3>
                <p className="text-meta text-muted">{t('Read-only events next to your tasks in Day and Week. Paste a calendar\'s iCal (.ics) address.')}</p>
              </div>
              <Button size="sm" icon="plus" disabled={disabled} onClick={() => p.onDraftChange(emptyDraft())}>{t('Add calendar')}</Button>
            </div>
            {p.encrypted && <Notice>{noticeCopy('calendar-feeds', 'eventsPlain')}</Notice>}
            {p.subscriptions && subs.length === 0 && <p className="py-2 text-meta text-faint">{t('No calendars yet.')}</p>}
            <div className="-mx-3">
              {subs.map((s) => (
                <ListRow key={s.id}
                  leading={<span className="mx-1 block h-3 w-3 rounded-full bg-hue-solid" data-hue={hueFor(s.color)} aria-hidden />}
                  label={s.name}
                  meta={(
                    <span data-subscription-status={s.id}>
                      {subscriptionStatus(s, now)}
                      {s.warnings?.length ? <span className="block text-faint">{s.warnings.join(' · ')}</span> : null}
                    </span>
                  )}
                  badges={s.lastError && s.enabled ? <StatusIndicator tone="danger">{t('Failing')}</StatusIndicator> : !s.enabled ? <StatusIndicator tone="off">{t('Off')}</StatusIndicator> : undefined}
                  menu={(
                    <Menu label={t('Actions for {name}', { name: s.name })} trigger={<Icon name="ellipsis" />} kind="menu" triggerClassName="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon">
                      <MenuItem label={t('Edit')} icon="pencil" disabled={disabled} onSelect={() => p.onDraftChange({ id: s.id, url: s.url ?? '', name: s.name, color: s.color })} />
                      <MenuItem label={t('Refresh now')} icon="rotate-ccw" disabled={disabled || !s.enabled} onSelect={() => p.onRefresh(s)} />
                      <MenuItem label={s.enabled ? t('Disable') : t('Enable')} icon={s.enabled ? 'eye-off' : 'eye'} disabled={disabled} onSelect={() => p.onSetEnabled(s, !s.enabled)} />
                      <MenuItem label={t('Delete')} icon="trash-2" danger disabled={disabled} onSelect={() => setDeleting(s)} />
                    </Menu>
                  )} />
              ))}
            </div>
          </div>

          <div className="space-y-2 py-3" data-testid="calendar-task-feed">
            <h3 className="text-body font-medium text-default">{t('Your tasks as a calendar')}</h3>
            <p className="text-meta text-muted">{t('A private, read-only address that calendar apps can subscribe to. Anyone with the address can read your open dated tasks.')}</p>
            {p.encrypted && <Notice>{noticeCopy('calendar-feeds', 'titlesEncrypted')}</Notice>}
            {p.feed === undefined ? null : p.feed === null ? (
              <Button size="sm" icon="link" disabled={disabled} onClick={p.onCreateFeed}>{t('Create feed URL')}</Button>
            ) : (
              <SettingRow {...rowCopy('calendar-feeds', 'feed')}
                status={<span className="text-muted">{p.feed.lastUsedAt ? t('Created {ago} · last used {used}', { ago: ago(p.feed.createdAt, now), used: ago(p.feed.lastUsedAt, now) }) : t('Created {ago} · never used', { ago: ago(p.feed.createdAt, now) })}</span>}
                control={<>
                  <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setConfirmFeed('rotate')}>{t('Rotate')}</Button>
                  <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setConfirmFeed('revoke')}>{t('Revoke')}</Button>
                </>} />
            )}
          </div>
        </>
      )}

      {p.draft && (
        <Dialog title={p.draft.id ? t('Edit calendar') : t('Add calendar')} onClose={() => p.onDraftChange(null)} size="md">
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); p.onSave() }}>
            <Field label={t('Address')} description={t('The calendar\'s secret or public iCal address (https, ending in .ics on most services).')}>
              <Input aria-label={t('Calendar address')} type="url" required placeholder={t('https://…/basic.ics')} value={p.draft.url}
                onChange={(e) => p.onDraftChange({ ...p.draft!, url: e.target.value })} data-autofocus />
            </Field>
            <Field label={t('Name')} description={t('Optional; the calendar\'s own name is used otherwise.')}>
              <Input aria-label={t('Calendar name')} value={p.draft.name} maxLength={100} onChange={(e) => p.onDraftChange({ ...p.draft!, name: e.target.value })} />
            </Field>
            <Field label={t('Colour')}>
              <Select aria-label={t('Calendar colour')} value={hueFor(p.draft.color)}
                onChange={(e) => p.onDraftChange({ ...p.draft!, color: HUES.find((h) => h.name === e.target.value)?.hex ?? p.draft!.color })}>
                {HUES.map((h) => <option key={h.name} value={h.name}>{hueLabel(h.name)}</option>)}
              </Select>
            </Field>
            {p.error && <Notice tone="danger">{p.error}</Notice>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => p.onDraftChange(null)}>{t('Cancel')}</Button>
              <Button variant="primary" type="submit" busy={p.busy} disabled={!p.connected}>{p.draft.id ? t('Save') : t('Add calendar')}</Button>
            </div>
          </form>
        </Dialog>
      )}

      {p.feedUrl && (
        <Dialog title={t('Your task feed URL')} onClose={p.onDismissUrl} size="md">
          <div className="space-y-4" data-testid="calendar-feed-url">
            <SecretReveal what={t('address')} secret={p.feedUrl} />
            <ul className="list-disc space-y-1 pl-5 text-meta text-muted">
              <li>{t.rich('<strong>Google Calendar</strong>: Other calendars → From URL.', { strong: (chunks) => <strong className="text-default">{chunks}</strong> })}</li>
              <li>{t.rich('<strong>Outlook</strong>: Add calendar → Subscribe from web.', { strong: (chunks) => <strong className="text-default">{chunks}</strong> })}</li>
              <li>{t.rich('<strong>Apple Calendar</strong>: File → New Calendar Subscription.', { strong: (chunks) => <strong className="text-default">{chunks}</strong> })}</li>
            </ul>
            <p className="text-meta text-faint">{t('Calendar apps refresh subscriptions on their own schedule, from every few minutes to once a day.')}</p>
            <div className="flex justify-end"><Button variant="primary" onClick={p.onDismissUrl}>{t('Done')}</Button></div>
          </div>
        </Dialog>
      )}

      {deleting && (
        <ConfirmDialog title={t('Delete {name}?', { name: deleting.name })} confirmLabel={t('Delete')}
          consequence={t('Its events disappear from Day and Week on every device. The calendar itself is not changed.')}
          onConfirm={async () => { await p.onDelete(deleting); setDeleting(null) }} onCancel={() => setDeleting(null)} />
      )}
      {confirmFeed && (
        <ConfirmDialog title={confirmFeed === 'rotate' ? t('Rotate the feed URL?') : t('Revoke the feed URL?')}
          confirmLabel={confirmFeed === 'rotate' ? t('Rotate') : t('Revoke')}
          consequence={confirmFeed === 'rotate'
            ? t('The current address stops working at once. Calendar apps subscribed to it need the new one.')
            : t('The address stops working at once and calendar apps stop showing your tasks.')}
          onConfirm={async () => { await (confirmFeed === 'rotate' ? p.onRotateFeed() : p.onRevokeFeed()); setConfirmFeed(null) }}
          onCancel={() => setConfirmFeed(null)} />
      )}
    </SettingsSection>
  )
}

function describe(err: unknown): string {
  if (err instanceof ApiError) return err.message.charAt(0).toUpperCase() + err.message.slice(1)
  if (isNetworkError(err)) return t('The server could not be reached.')
  return t('Something went wrong.')
}

export function CalendarFeedsPanel({ isOwner }: { isOwner: boolean }) {
  const online = useOnline()
  const { enabled: encrypted } = useEncryption()
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [subscriptions, setSubscriptions] = useState<CalendarSubscription[] | null>(null)
  useSettingsPending(enabled === null || subscriptions === null)
  const [feed, setFeed] = useState<CalendarFeed | null | undefined>(undefined)
  const [unreachable, setUnreachable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<SubscriptionDraft | null>(null)
  const [feedUrl, setFeedUrl] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const { enabled: on } = await api.calendarFeedsSetting()
      setEnabled(on)
      setUnreachable(false)
      if (!on) return
      const [subs, f] = await Promise.all([api.calendarSubscriptions(), api.calendarFeed()])
      setSubscriptions(subs.subscriptions)
      setFeed(f.feed)
    } catch (err) {
      if (isNetworkError(err)) setUnreachable(true)
      else setError(describe(err))
    }
  }, [])

  // Offline: the subscriptions the device cached with the last event refresh.
  useEffect(() => {
    void cachedCalendarSubscriptions().then((cached) => {
      if (cached.length) {
        setSubscriptions((cur) => cur ?? cached)
        setEnabled((cur) => cur ?? true)
      }
    })
  }, [])
  useEffect(() => {
    if (online) void load()
  }, [online, load])

  const connected = online && !unreachable

  async function run(action: () => Promise<void>) {
    setError(null)
    setBusy(true)
    try {
      await action()
    } catch (err) {
      if (isNetworkError(err)) setUnreachable(true)
      setError(describe(err))
      throw err
    } finally {
      setBusy(false)
    }
  }
  const quiet = (action: () => Promise<void>) => run(action).catch(() => undefined)
  const upsert = (s: CalendarSubscription) => setSubscriptions((cur) => {
    const list = cur ?? []
    return list.some((x) => x.id === s.id) ? list.map((x) => (x.id === s.id ? s : x)) : [...list, s]
  })
  // Day and Week read the device cache: refresh it after every change.
  const changed = () => void refreshEvents()

  return (
    <CalendarFeedsView isOwner={isOwner} enabled={enabled} connected={connected} encrypted={encrypted}
      subscriptions={subscriptions} feed={feed} busy={busy} error={error} draft={draft} feedUrl={feedUrl}
      onToggle={(on) => void quiet(async () => {
        await api.setCalendarFeedsSetting(on)
        setEnabled(on)
        if (on) await load()
      })}
      onDraftChange={(d) => { setDraft(d); setError(null) }}
      onSave={() => void quiet(async () => {
        if (!draft) return
        const body = { url: draft.url.trim(), name: draft.name.trim() || undefined, color: draft.color }
        const res = draft.id ? await api.updateCalendarSubscription(draft.id, body) : await api.createCalendarSubscription(body)
        upsert(res.subscription)
        setDraft(null)
        changed()
      })}
      onRefresh={(s) => void quiet(async () => { upsert((await api.refreshCalendarSubscription(s.id)).subscription); changed() })}
      onSetEnabled={(s, on) => void quiet(async () => { upsert((await api.updateCalendarSubscription(s.id, { enabled: on })).subscription); changed() })}
      onDelete={(s) => run(async () => {
        await api.deleteCalendarSubscription(s.id)
        setSubscriptions((cur) => (cur ?? []).filter((x) => x.id !== s.id))
        changed()
      })}
      onCreateFeed={() => void quiet(async () => { const r = await api.rotateCalendarFeed(); setFeed(r.feed); setFeedUrl(r.url) })}
      onRotateFeed={() => run(async () => { const r = await api.rotateCalendarFeed(); setFeed(r.feed); setFeedUrl(r.url) })}
      onRevokeFeed={() => run(async () => { await api.revokeCalendarFeed(); setFeed(null) })}
      onDismissUrl={() => setFeedUrl(null)} />
  )
}
