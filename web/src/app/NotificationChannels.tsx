// Settings → Notifications → Delivery channels (OpenSpec change notification-channels,
// design D10): the owner's switch, the person's ntfy, Pushover, Gotify and webhook
// channels as rows with their last result, and the editor. The pure ChannelsView
// renders every state; NotificationChannelsCard loads and acts. Channels are server
// data: offline, the last loaded rows stay with every control off.
import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, ConfirmDialog, Icon, Input, Menu, MenuItem, Notice, SettingRow, SettingsSection, Switch, StatusIndicator, toneForHue } from '../ui'
import { ApiError, isNetworkError } from '../lib/api'
import { useEncryption } from '../lib/e2ee'
import { useOnline } from '../lib/online'
import { t } from '../lib/i18n'
import { cardCopy, noticeCopy, rowCopy } from '../lib/settingsCopy'
import { cacheChannels, cachedChannels, channelsApi, MAX_CHANNELS, type NotificationChannel } from '../lib/notificationChannels'
import { ago } from './CalendarFeedsPanel'
import {
  channelDraftBody, channelDraftError, channelDraftOf, KIND_ICON, kindName, newChannelDraft, NotificationChannelEditor,
  type ChannelDraft, type ChannelFieldError,
} from './NotificationChannelEditor'
import { useSettingsPending } from './settingsPending'

/** The row's second line: why it is off, the last error, or when it last delivered. */
export function channelStatus(c: NotificationChannel, now = Date.now()): string {
  if (!c.enabled && c.disabledReason === 'too_many_failures') return t('Turned off after 20 failed messages. Check its settings, then turn it on.')
  if (!c.enabled) return t('Off: nothing is sent.')
  if (c.lastError === 'token_missing') return t('No token is stored, for example after a restore. Enter it again.')
  if (c.lastError === 'private_target') return t('The address is on a private network the server owner has not allowed.')
  if (c.lastError) return t('Last error: {error}', { error: c.lastError })
  if (c.lastOkAt) return t('Last delivered {ago}', { ago: ago(c.lastOkAt, now) })
  return t('Nothing delivered yet')
}

export interface ChannelsViewProps {
  isOwner: boolean
  /** null while unknown (offline before the first load). */
  enabled: boolean | null
  connected: boolean
  encrypted: boolean
  channels: NotificationChannel[] | null
  busy: boolean
  error: string | null
  draft: ChannelDraft | null
  fieldError: ChannelFieldError | null
  /** A webhook's signing secret, shown once after creation or rotation. */
  secret: { name: string; value: string } | null
  /** The outcome of the last test per channel. */
  tests: Readonly<Record<string, string>>
  now?: number
  onToggle: (on: boolean) => void
  onDraftChange: (d: ChannelDraft | null) => void
  onSave: () => void
  onSetEnabled: (c: NotificationChannel, on: boolean) => void
  onTest: (c: NotificationChannel) => void
  onRotate: (c: NotificationChannel) => void
  onDelete: (c: NotificationChannel) => Promise<void> | void
  onSecretSeen: () => void
}

function ChannelRow({ c, p, disabled, onDelete }: { c: NotificationChannel; p: ChannelsViewProps; disabled: boolean; onDelete: () => void }) {
  const test = p.tests[c.id]
  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-2 py-3" data-channel={c.id}>
      <span className="mt-0.5 text-muted"><Icon name={KIND_ICON[c.kind]} /></span>
      <div className="min-w-0 flex-1 basis-48">
        <div className="flex flex-wrap items-center gap-2">
          <span className="user-text text-body font-medium text-default">{c.name}</span>
          <span className="text-meta text-faint">{kindName(c.kind)}</span>
          {c.includeTitles && !p.encrypted && <Badge hue="slate">{t('Titles')}</Badge>}
        </div>
        <p className="text-meta text-muted" data-channel-status>{channelStatus(c, p.now)}</p>
        {test && <p className="text-meta text-default" role="status" data-channel-test>{test}</p>}
      </div>
      <div className="flex items-center gap-1">
        <Switch checked={c.enabled} disabled={disabled} onChange={(on) => p.onSetEnabled(c, on)} label={t('Send to {name}', { name: c.name })} hideLabel />
        <Menu label={t('Actions for {name}', { name: c.name })} trigger={<Icon name="ellipsis" />} kind="menu" triggerClassName="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon">
          <MenuItem label={t('Send test')} icon="send" disabled={disabled} onSelect={() => p.onTest(c)} />
          <MenuItem label={t('Edit')} icon="pencil" disabled={disabled} onSelect={() => p.onDraftChange(channelDraftOf(c))} />
          {c.kind === 'webhook' && <MenuItem label={t('New signing secret')} icon="key-round" disabled={disabled} onSelect={() => p.onRotate(c)} />}
          <MenuItem label={t('Delete')} icon="trash-2" danger disabled={disabled} onSelect={onDelete} />
        </Menu>
      </div>
    </li>
  )
}

function SecretNotice({ secret, onSeen }: { secret: { name: string; value: string }; onSeen: () => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <Notice tone="success" action={<Button size="sm" onClick={onSeen}>{t('Done')}</Button>}>
      <span className="block">{t('Signing secret of {name}. Copy it now; it is never shown again.', { name: secret.name })}</span>
      <span className="mt-2 flex flex-wrap items-center gap-2">
        <Input aria-label={t('Signing secret')} readOnly value={secret.value} className="font-mono" onFocus={(e) => e.currentTarget.select()} />
        <Button size="sm" icon="copy" onClick={() => void navigator.clipboard?.writeText(secret.value).then(() => setCopied(true)).catch(() => undefined)}>
          {copied ? t('Copied') : t('Copy')}
        </Button>
      </span>
    </Notice>
  )
}

export function ChannelsView(p: ChannelsViewProps) {
  const [deleting, setDeleting] = useState<NotificationChannel | null>(null)
  const disabled = !p.connected || p.busy
  const on = p.enabled === true
  const list = p.channels ?? []
  return (
    <SettingsSection {...cardCopy('notification-channels')} testId="channels-panel">
      {!p.connected && <Notice>{noticeCopy('notification-channels', 'offline')}</Notice>}
      {p.enabled !== null && (p.isOwner || !on) && (
        <SettingRow label={rowCopy('notification-channels', 'server', { variant: 'owner' }).label}
          description={rowCopy('notification-channels', 'server', { variant: p.isOwner ? 'owner' : 'member' }).description}
          status={<StatusIndicator tone={toneForHue(on ? 'green' : 'slate')}>{on ? t('On') : t('Off')}</StatusIndicator>}
          control={p.isOwner && <Switch checked={on} disabled={disabled} onChange={p.onToggle} label={t('Allow delivery channels on this server')} hideLabel />} />
      )}
      {p.error && !p.draft && <Notice tone="danger">{p.error}</Notice>}
      {p.secret && <SecretNotice secret={p.secret} onSeen={p.onSecretSeen} />}
      {on && (
        <>
          <SettingRow {...rowCopy('notification-channels', 'channels')}
            status={p.channels ? <span className="text-muted">{t('{n} of {max}', { n: list.length, max: MAX_CHANNELS })}</span> : undefined}
            control={<Button size="sm" icon="plus" disabled={disabled || list.length >= MAX_CHANNELS} onClick={() => p.onDraftChange(newChannelDraft())}>{t('Add channel')}</Button>} />
          {p.encrypted && <Notice>{noticeCopy('notification-channels', 'encrypted')}</Notice>}
          {list.length > 0 && (
            <ul className="divide-y divide-(--ot-border)" data-testid="channel-list">
              {list.map((c) => <ChannelRow key={c.id} c={c} p={p} disabled={disabled} onDelete={() => setDeleting(c)} />)}
            </ul>
          )}
        </>
      )}
      {p.draft && (
        <NotificationChannelEditor draft={p.draft} busy={p.busy} connected={p.connected} encrypted={p.encrypted} error={p.fieldError}
          general={p.fieldError ? null : p.error} onChange={(d) => p.onDraftChange(d)} onSave={p.onSave} onClose={() => p.onDraftChange(null)} />
      )}
      {deleting && (
        <ConfirmDialog title={t('Delete {name}?', { name: deleting.name })} confirmLabel={t('Delete')}
          consequence={t('Its tokens are removed from the server and nothing more is sent to it.')}
          onConfirm={async () => { await p.onDelete(deleting); setDeleting(null) }} onCancel={() => setDeleting(null)} />
      )}
    </SettingsSection>
  )
}

function describe(err: unknown): string {
  if (err instanceof ApiError) return err.message.charAt(0).toUpperCase() + err.message.slice(1)
  if (isNetworkError(err)) return t('The server could not be reached.')
  return t('Something went wrong.')
}

function fieldErrorOf(err: unknown): ChannelFieldError | null {
  if (!(err instanceof ApiError)) return null
  if (err.field) return { field: err.field, message: err.serverMessage.replace(new RegExp(`^${err.field}: `), '') }
  return null
}

/** The outcome of Send test in words. */
export function testText(r: { delivered: boolean; statusCode?: number; error?: string }): string {
  if (r.delivered) return t('Test delivered.')
  return r.statusCode ? t('Test failed (status {status}): {error}', { status: r.statusCode, error: r.error ?? '' }) : t('Test failed: {error}', { error: r.error ?? '' })
}

export function NotificationChannelsCard({ isOwner }: { isOwner: boolean }) {
  const online = useOnline()
  const { enabled: encrypted } = useEncryption()
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [channels, setChannels] = useState<NotificationChannel[] | null>(null)
  useSettingsPending(enabled === null && online)
  const [unreachable, setUnreachable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<ChannelFieldError | null>(null)
  const [draft, setDraft] = useState<ChannelDraft | null>(null)
  const [secret, setSecret] = useState<{ name: string; value: string } | null>(null)
  const [tests, setTests] = useState<Record<string, string>>({})

  const keep = useCallback((list: NotificationChannel[]) => {
    setChannels(list)
    void cacheChannels(list).catch(() => undefined)
  }, [])
  const load = useCallback(async () => {
    try {
      const { enabled: on } = await channelsApi.getSetting()
      setEnabled(on)
      setUnreachable(false)
      if (on) keep((await channelsApi.list()).channels)
    } catch (err) {
      if (isNetworkError(err)) setUnreachable(true)
      else setError(describe(err))
    }
  }, [keep])
  useEffect(() => {
    void cachedChannels().then((cached) => {
      if (cached.length) {
        setChannels((cur) => cur ?? cached)
        setEnabled((cur) => cur ?? true)
      }
    }).catch(() => undefined)
  }, [])
  useEffect(() => {
    if (online) void load()
  }, [online, load])

  const connected = online && !unreachable
  const upsert = (c: NotificationChannel) => {
    const list = channels ?? []
    keep(list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? c : x)) : [...list, c])
  }
  async function act(action: () => Promise<void>) {
    setError(null)
    setFieldError(null)
    setBusy(true)
    try {
      await action()
    } catch (err) {
      if (isNetworkError(err)) setUnreachable(true)
      setError(describe(err))
      setFieldError(fieldErrorOf(err))
      throw err
    } finally {
      setBusy(false)
    }
  }
  const quiet = (action: () => Promise<void>) => act(action).catch(() => undefined)

  return (
    <ChannelsView isOwner={isOwner} enabled={enabled} connected={connected} encrypted={encrypted} channels={channels} busy={busy} error={error}
      draft={draft} fieldError={fieldError} secret={secret} tests={tests}
      onToggle={(on) => void quiet(async () => {
        await channelsApi.putSetting(on)
        setEnabled(on)
        if (on) await load()
      })}
      onDraftChange={(d) => { setDraft(d); setError(null); setFieldError(null) }}
      onSave={() => {
        if (!draft) return
        const local = channelDraftError(draft)
        if (local) {
          setFieldError(local)
          setError(local.message)
          return
        }
        void quiet(async () => {
          const body = channelDraftBody(draft)
          const res = draft.id ? await channelsApi.update(draft.id, body) : await channelsApi.create(body)
          upsert(res.channel)
          if (res.secret) setSecret({ name: res.channel.name, value: res.secret })
          setDraft(null)
        })
      }}
      onSetEnabled={(c, on) => void quiet(async () => { upsert((await channelsApi.update(c.id, { enabled: on })).channel) })}
      onTest={(c) => void quiet(async () => {
        const res = await channelsApi.test(c.id)
        setTests((cur) => ({ ...cur, [c.id]: testText(res) }))
        keep((await channelsApi.list()).channels)
      })}
      onRotate={(c) => void quiet(async () => {
        const res = await channelsApi.update(c.id, { rotateSecret: true })
        upsert(res.channel)
        if (res.secret) setSecret({ name: res.channel.name, value: res.secret })
      })}
      onDelete={(c) => act(async () => {
        await channelsApi.remove(c.id)
        keep((channels ?? []).filter((x) => x.id !== c.id))
      })}
      onSecretSeen={() => setSecret(null)} />
  )
}
