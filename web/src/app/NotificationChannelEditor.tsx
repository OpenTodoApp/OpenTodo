// The delivery channel editor (OpenSpec change notification-channels, design D10):
// the kind as four choices (fixed once saved), the name, the kind's fields with
// secrets as password inputs that are never prefilled, the events and Include task
// titles. The server's validation error is shown beside the field it names.
import { Button, Dialog, Field, Icon, Input, Notice, Switch, type IconName } from '../ui'
import { t } from '../lib/i18n'
import { CHANNEL_EVENTS, CHANNEL_KINDS, NTFY_DEFAULT, type ChannelEvent, type ChannelInput, type ChannelKind, type NotificationChannel } from '../lib/notificationChannels'

export interface ChannelDraft {
  id?: string
  kind: ChannelKind
  name: string
  url: string
  topic: string
  /** Typed in this dialog only; never filled from the server. */
  token: string
  userKey: string
  events: ChannelEvent[]
  includeTitles: boolean
  tokenSet: boolean
  userKeySet: boolean
}

export interface ChannelFieldError {
  field: string
  message: string
}

export const KIND_ICON: Record<ChannelKind, IconName> = { ntfy: 'bell', pushover: 'send', gotify: 'message-circle', webhook: 'webhook' }

export function kindName(kind: ChannelKind): string {
  return kind === 'ntfy' ? 'ntfy' : kind === 'pushover' ? 'Pushover' : kind === 'gotify' ? 'Gotify' : t('Webhook')
}

export function eventName(e: ChannelEvent): string {
  switch (e) {
    case 'reminder': return t('Reminders')
    case 'assigned': return t('Assigned to me')
    case 'mentioned': return t('Mentions')
    case 'unblocked': return t('Ready to start')
    case 'page': return t('Task page replies')
  }
}

export function newChannelDraft(kind: ChannelKind = 'ntfy'): ChannelDraft {
  return { kind, name: '', url: kind === 'ntfy' ? NTFY_DEFAULT : '', topic: '', token: '', userKey: '', events: ['reminder', 'assigned', 'mentioned'], includeTitles: false, tokenSet: false, userKeySet: false }
}

export function channelDraftOf(c: NotificationChannel): ChannelDraft {
  return { id: c.id, kind: c.kind, name: c.name, url: c.url ?? '', topic: c.topic ?? '', token: '', userKey: '', events: [...c.events],
    includeTitles: c.includeTitles, tokenSet: c.tokenSet, userKeySet: !!c.userKeySet }
}

/** What the dialog can say before a request. */
export function channelDraftError(d: ChannelDraft): ChannelFieldError | null {
  if (d.kind !== 'pushover' && !d.url.trim()) return { field: 'url', message: t('Enter the address.') }
  if (d.kind === 'ntfy' && !/^[A-Za-z0-9_-]{1,64}$/.test(d.topic.trim())) return { field: 'topic', message: t('Use 1 to 64 letters, digits, - or _.') }
  if (d.kind === 'pushover' && !d.id && !d.userKey.trim()) return { field: 'userKey', message: t('Paste your Pushover user key.') }
  if ((d.kind === 'pushover' || d.kind === 'gotify') && !d.id && !d.token.trim()) return { field: 'token', message: t('Paste the application token.') }
  if (d.events.length === 0) return { field: 'events', message: t('Choose at least one event.') }
  return null
}

/** The request body; secrets only when typed, the kind only on creation. */
export function channelDraftBody(d: ChannelDraft): ChannelInput {
  const body: ChannelInput = { name: d.name.trim(), events: d.events, includeTitles: d.includeTitles }
  if (!d.id) body.kind = d.kind
  if (d.kind !== 'pushover') body.url = d.url.trim()
  if (d.kind === 'ntfy') body.topic = d.topic.trim()
  if (d.token.trim()) body.token = d.token.trim()
  if (d.kind === 'pushover' && d.userKey.trim()) body.userKey = d.userKey.trim()
  return body
}

export interface ChannelEditorProps {
  draft: ChannelDraft
  busy: boolean
  connected: boolean
  encrypted: boolean
  error: ChannelFieldError | null
  general: string | null
  onChange: (d: ChannelDraft) => void
  onSave: () => void
  onClose: () => void
}

function SecretField({ d, field, label, optional, at, set }: { d: ChannelDraft; field: 'token' | 'userKey'; label: string; optional?: boolean; at: (f: string) => string | undefined; set: (p: Partial<ChannelDraft>) => void }) {
  const saved = field === 'token' ? d.tokenSet : d.userKeySet
  const description = saved ? t('Saved. Leave empty to keep it; it is never shown again.') : optional ? t('Optional. It is never shown again.') : t('It is never shown again.')
  return (
    <Field label={label} description={description} error={at(field)}>
      <Input aria-label={label} type="password" autoComplete="off" spellCheck={false} value={d[field]} onChange={(e) => set({ [field]: e.target.value })} />
    </Field>
  )
}

function KindFields({ d, at, set }: { d: ChannelDraft; at: (f: string) => string | undefined; set: (p: Partial<ChannelDraft>) => void }) {
  return (
    <>
      {d.kind !== 'pushover' && (
        <Field label={d.kind === 'webhook' ? t('Address') : t('Server')} error={at('url')}
          description={d.kind === 'ntfy' ? t('ntfy.sh or the address of your own ntfy server.') : d.kind === 'gotify' ? t('The address of your Gotify server.') : t('Receives a signed JSON message; Apprise and Home Assistant work too.')}>
          <Input aria-label={d.kind === 'webhook' ? t('Address') : t('Server')} type="url" value={d.url} placeholder={d.kind === 'ntfy' ? NTFY_DEFAULT : 'https://'} onChange={(e) => set({ url: e.target.value })} />
        </Field>
      )}
      {d.kind === 'ntfy' && (
        <>
          <Field label={t('Topic')} description={t('The topic your ntfy app subscribes to.')} error={at('topic')}>
            <Input aria-label={t('Topic')} value={d.topic} autoComplete="off" spellCheck={false} onChange={(e) => set({ topic: e.target.value })} />
          </Field>
          <SecretField d={d} field="token" label={t('Access token')} optional at={at} set={set} />
        </>
      )}
      {d.kind === 'pushover' && <SecretField d={d} field="userKey" label={t('User key')} at={at} set={set} />}
      {(d.kind === 'pushover' || d.kind === 'gotify') && <SecretField d={d} field="token" label={t('Application token')} at={at} set={set} />}
    </>
  )
}

export function NotificationChannelEditor({ draft: d, busy, connected, encrypted, error, general, onChange, onSave, onClose }: ChannelEditorProps) {
  const at = (field: string) => (error?.field === field ? error.message : undefined)
  const set = (patch: Partial<ChannelDraft>) => onChange({ ...d, ...patch })
  const toggle = (e: ChannelEvent, on: boolean) => set({ events: CHANNEL_EVENTS.filter((x) => (x === e ? on : d.events.includes(x))) })
  return (
    <Dialog title={d.id ? t('Edit delivery channel') : t('Add delivery channel')} onClose={onClose} size="lg" testId="channel-editor">
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); onSave() }} noValidate>
        <div role="radiogroup" aria-label={t('Service')} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CHANNEL_KINDS.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={d.kind === k} disabled={!!d.id && d.kind !== k} data-channel-kind={k}
              className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-control border px-3 py-2 text-body font-medium ${d.kind === k ? 'border-accent bg-accent-soft text-on-accent-soft' : 'border-default text-default hover:bg-sunken'} disabled:cursor-not-allowed disabled:opacity-60`}
              onClick={() => !d.id && onChange({ ...newChannelDraft(k), name: d.name, events: d.events, includeTitles: d.includeTitles })}>
              <Icon name={KIND_ICON[k]} />{kindName(k)}
            </button>
          ))}
        </div>
        <Field label={t('Name')} description={t('Optional; the service’s name is used otherwise.')} error={at('name')}>
          <Input aria-label={t('Channel name')} value={d.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <KindFields d={d} at={at} set={set} />
        <fieldset className="space-y-2" aria-describedby={at('events') ? 'channel-events-error' : undefined}>
          <legend className="text-body font-medium text-default">{t('Send')}</legend>
          <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
            {CHANNEL_EVENTS.map((e) => <div key={e}><Switch checked={d.events.includes(e)} onChange={(on) => toggle(e, on)} label={eventName(e)} /></div>)}
          </div>
          {at('events') && <p id="channel-events-error" className="text-meta text-danger">{at('events')}</p>}
        </fieldset>
        <div className="space-y-1" data-channel-titles>
          <Switch checked={d.includeTitles && !encrypted} disabled={encrypted} onChange={(includeTitles) => set({ includeTitles })} label={t('Include task titles')} />
          <p className="text-meta text-muted">{encrypted
            ? t('Never with end-to-end encryption: messages only say what happened.')
            : t('Off: messages only say what happened, such as “A reminder is due”.')}</p>
        </div>
        {general && <Notice tone="danger">{general}</Notice>}
        <div className="sticky -bottom-4 -mx-4 flex justify-end gap-2 border-t border-default bg-surface px-4 py-3">
          <Button variant="ghost" onClick={onClose}>{t('Cancel')}</Button>
          <Button variant="primary" type="submit" busy={busy} disabled={!connected}>{d.id ? t('Save') : t('Add channel')}</Button>
        </div>
      </form>
    </Dialog>
  )
}
