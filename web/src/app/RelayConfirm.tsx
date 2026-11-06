// "Confirm changes first" (OpenSpec change mcp-device-relay, design D7) and
// "Confirm reads first" (relay-request-transparency D4): a relayed request
// waits on this device until the user allows or declines it. The sheet names
// the connector's token, the tool and the call's arguments as the server
// described them, and lists the text: what a write would encrypt, or what a
// read would send, decrypted here for the sheet only.
import { useSyncExternalStore } from 'react'
import { Button, Dialog } from '../ui'
import { t } from '../lib/i18n'
import { onRelayChange, relaySnapshot, type RelayItem } from '../lib/relay'

/** At most this many values are listed; the rest are counted. */
export const SHOWN_MAX = 20

function fieldLabel(entity: string, field: string): string {
  if (field === 'title') return t('Title')
  if (field === 'description') return t('Description')
  if (field === 'body') return t('Comment')
  if (field === 'note') return t('Note')
  if (field === 'name') return entity === 'project' ? t('Project name') : entity === 'label' ? t('Label name') : entity === 'section' ? t('Section name') : t('Name')
  return field
}

export interface RelayConfirmViewProps {
  op?: 'decrypt' | 'encrypt'
  tool: string
  token?: string
  args?: string
  items: RelayItem[]
  onApply: () => void
  onDecline: () => void
}

/** Pure rendering of the confirmation sheet. */
export function RelayConfirmView(p: RelayConfirmViewProps) {
  const read = p.op === 'decrypt'
  const lead = read
    ? (p.token ? t('{token} asks to read this with {tool}:', { token: p.token, tool: p.tool }) : t('An assistant asks to read this with {tool}:', { tool: p.tool }))
    : (p.token ? t('{token} asks to run {tool} with this text:', { token: p.token, tool: p.tool }) : t('An assistant asks to run {tool} with this text:', { tool: p.tool }))
  const rest = p.items.length - SHOWN_MAX
  return (
    <Dialog title={read ? t('An AI connector wants to read your text') : t('An AI connector wants to make a change')} onClose={p.onDecline} dismissable={false} size="md" testId="relay-confirm">
      <p className="text-body text-muted">{lead}</p>
      {p.args && <code className="mt-2 block break-all font-mono text-meta text-muted" data-relay-args>{p.args}</code>}
      <ul className="my-3 max-h-64 space-y-2 overflow-y-auto" aria-label={read ? t('Text to send') : t('Text to write')}>
        {p.items.slice(0, SHOWN_MAX).map((it, i) => (
          <li key={i} className="rounded-control bg-sunken px-3 py-2">
            <span className="block text-meta text-muted">{fieldLabel(it.entity, it.field)}</span>
            <span className="block whitespace-pre-wrap break-words text-body text-default">{it.value}</span>
          </li>
        ))}
      </ul>
      {rest > 0 && <p className="mb-3 text-meta text-muted">{t('{n, plural, one {and # more value} other {and # more values}}', { n: rest })}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={p.onDecline} data-relay-decline>{t('Decline')}</Button>
        <Button variant="primary" onClick={p.onApply} data-relay-apply>{read ? t('Allow') : t('Apply')}</Button>
      </div>
    </Dialog>
  )
}

/** Mounted once in the app shell; shows while a relayed request waits. */
export function RelayConfirm() {
  const { pending } = useSyncExternalStore(onRelayChange, relaySnapshot, relaySnapshot)
  if (!pending) return null
  return <RelayConfirmView op={pending.op} tool={pending.tool} token={pending.token} args={pending.args} items={pending.items}
    onApply={() => pending.decide(true)} onDecline={() => pending.decide(false)} />
}
