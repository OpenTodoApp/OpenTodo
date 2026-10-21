// "Confirm changes first" (OpenSpec change mcp-device-relay, design D7): a
// relayed write waits on this device until the user applies or declines it.
// The device sees only the text it is asked to encrypt, so the sheet lists
// that text, with the tool and the connector's token name.
import { useSyncExternalStore } from 'react'
import { Button, Dialog } from '../ui'
import { t } from '../lib/i18n'
import { onRelayChange, relaySnapshot, type RelayItem } from '../lib/relay'

function fieldLabel(entity: string, field: string): string {
  if (field === 'title') return t('Title')
  if (field === 'description') return t('Description')
  if (field === 'body') return t('Comment')
  if (field === 'note') return t('Note')
  if (field === 'name') return entity === 'project' ? t('Project name') : entity === 'label' ? t('Label name') : entity === 'section' ? t('Section name') : t('Name')
  return field
}

export interface RelayConfirmViewProps {
  tool: string
  token?: string
  items: RelayItem[]
  onApply: () => void
  onDecline: () => void
}

/** Pure rendering of the confirmation sheet. */
export function RelayConfirmView(p: RelayConfirmViewProps) {
  return (
    <Dialog title={t('An AI connector wants to make a change')} onClose={p.onDecline} dismissable={false} size="md" testId="relay-confirm">
      <p className="text-body text-muted">
        {p.token ? t('{token} asks to run {tool} with this text:', { token: p.token, tool: p.tool }) : t('An assistant asks to run {tool} with this text:', { tool: p.tool })}
      </p>
      <ul className="my-3 max-h-64 space-y-2 overflow-y-auto" aria-label={t('Text to write')}>
        {p.items.map((it, i) => (
          <li key={i} className="rounded-control bg-sunken px-3 py-2">
            <span className="block text-meta text-muted">{fieldLabel(it.entity, it.field)}</span>
            <span className="block whitespace-pre-wrap break-words text-body text-default">{it.value}</span>
          </li>
        ))}
      </ul>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={p.onDecline} data-relay-decline>{t('Decline')}</Button>
        <Button variant="primary" onClick={p.onApply} data-relay-apply>{t('Apply')}</Button>
      </div>
    </Dialog>
  )
}

/** Mounted once in the app shell; shows while a relayed write waits. */
export function RelayConfirm() {
  const { pending } = useSyncExternalStore(onRelayChange, relaySnapshot, relaySnapshot)
  if (!pending) return null
  return <RelayConfirmView tool={pending.tool} token={pending.token} items={pending.items} onApply={() => pending.decide(true)} onDecline={() => pending.decide(false)} />
}
