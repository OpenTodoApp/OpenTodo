// Settings → AI assistants, for an end-to-end encrypted account: let this
// device answer AI connectors (OpenSpec change mcp-device-relay). The trust
// model is stated in plain words next to the switch (security review).
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { Badge, Icon, Notice, SettingRow, Switch, Tooltip } from '../ui'
import { api } from '../lib/api'
import { formatInstant } from '../lib/dates'
import { useEncryption } from '../lib/e2ee'
import { formatNumber, t } from '../lib/i18n'
import { DAY_CAP, HOUR_CAP, onRelayChange, optIn, optOut, relaySnapshot, setConfirmWrites, type RecentCall, type RelayDevice } from '../lib/relay'
import { rowCopy } from '../lib/settingsCopy'

export interface RelayViewProps {
  unlocked: boolean
  optedIn: boolean
  connected: boolean
  confirmWrites: boolean
  devices: RelayDevice[]
  recent: RecentCall[]
  busy: boolean
  error: string | null
  onToggle: (on: boolean) => void
  onConfirmWrites: (on: boolean) => void
}

function outcomeLabel(o: RecentCall['outcome']): string {
  switch (o) {
    case 'answered': return t('Answered')
    case 'device_limit': return t('Over the limit')
    case 'declined_on_device': return t('Declined')
    case 'locked': return t('Locked')
    default: return t('Refused')
  }
}

/** Pure rendering; state lives in RelaySettings. */
export function RelayView(p: RelayViewProps) {
  return (
    <div className="space-y-1 border-t border-default pt-3" data-relay-settings>
      <SettingRow label={rowCopy('assistants', 'relay').label}
        description={<span id="relay-help">{rowCopy('assistants', 'relay').description}</span>}
        status={p.optedIn ? <Badge tone={p.connected ? 'solid' : 'soft'} hue={p.connected ? 'green' : undefined}>{p.connected ? t('Ready') : t('Connecting…')}</Badge> : undefined}
        control={<Switch checked={p.optedIn} disabled={p.busy || (!p.unlocked && !p.optedIn)} onChange={p.onToggle}
          label={rowCopy('assistants', 'relay').label} hideLabel describedBy="relay-help" />} />
      <Notice>
        {t('While this is on, text an assistant asks for passes through your server to reach the assistant; the server never gets your key and keeps nothing. This device decrypts at most {hour} values an hour and {day} a day, and stops when you lock it or sign out.', {
          hour: formatNumber(HOUR_CAP), day: formatNumber(DAY_CAP),
        })}
      </Notice>
      {!p.unlocked && !p.optedIn && <p className="text-meta text-muted">{t('Unlock this device to turn it on.')}</p>}
      {p.error && <Notice tone="danger">{p.error}</Notice>}
      {p.optedIn && (
        <SettingRow label={rowCopy('assistants', 'relayConfirm').label}
          description={<span id="relay-confirm-help">{rowCopy('assistants', 'relayConfirm').description}</span>}
          control={<Switch checked={p.confirmWrites} onChange={p.onConfirmWrites} label={rowCopy('assistants', 'relayConfirm').label} hideLabel describedBy="relay-confirm-help" />} />
      )}
      {p.devices.length > 0 && (
        <SettingRow label={rowCopy('assistants', 'relayDevices').label} control={(
          <ul className="space-y-1 text-meta text-default" aria-label={rowCopy('assistants', 'relayDevices').label}>
            {p.devices.map((d) => (
              <li key={d.deviceId} className="flex items-center justify-end gap-2">
                <span>{d.label || t('Device')}</span>
                {d.thisSession && <Badge>{t('This device')}</Badge>}
              </li>
            ))}
          </ul>
        )} />
      )}
      {p.optedIn && p.recent.length > 0 && (
        <details className="py-2 text-body" data-relay-recent>
          <summary className="cursor-pointer font-medium text-default">{rowCopy('assistants', 'relayRecent').label}</summary>
          <p className="mt-1 text-meta text-muted">{rowCopy('assistants', 'relayRecent').description}</p>
          <ul className="mt-2 space-y-1 text-meta">
            {p.recent.map((c, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 text-default">
                <span><code className="font-mono">{c.tool}</code> · {c.op === 'encrypt' ? t('{n, plural, one {# value written} other {# values written}}', { n: c.count }) : t('{n, plural, one {# value read} other {# values read}}', { n: c.count })}</span>
                <span className="text-muted">{outcomeLabel(c.outcome)} · {formatInstant(c.at, 'datetime')}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

/** The footer mark while this device answers an AI connector (design D10: no new row). */
export function RelayIndicatorView({ busy }: { busy: boolean }) {
  if (!busy) return null
  return (
    <Tooltip label={t('Answering an AI connector')} side="top">
      <span role="status" tabIndex={0} className="inline-flex size-8 items-center justify-center rounded-control text-accent" data-relay-indicator>
        <Icon name="key-round" size="sm" />
        <span className="sr-only">{t('Answering an AI connector')}</span>
      </span>
    </Tooltip>
  )
}

export function RelayIndicator() {
  const { busy } = useSyncExternalStore(onRelayChange, relaySnapshot, relaySnapshot)
  return <RelayIndicatorView busy={busy} />
}

/** The relay settings of this device, for an encrypted account. */
export function RelaySettings() {
  const enc = useEncryption()
  const relay = useSyncExternalStore(onRelayChange, relaySnapshot, relaySnapshot)
  const [devices, setDevices] = useState<RelayDevice[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refresh = useCallback(() => {
    void api.relayDevices().then((r) => setDevices(r.devices), () => undefined)
  }, [])
  useEffect(refresh, [refresh, relay.optedIn])
  const onToggle = (on: boolean) => {
    setBusy(true)
    setError(null)
    void (on ? optIn() : optOut()).then(refresh, (err: unknown) => setError(err instanceof Error ? err.message : String(err))).finally(() => setBusy(false))
  }
  return (
    <RelayView unlocked={enc.unlocked} optedIn={relay.optedIn} connected={relay.connected} confirmWrites={relay.confirmWrites}
      devices={devices} recent={relay.recent} busy={busy} error={error} onToggle={onToggle} onConfirmWrites={(on) => void setConfirmWrites(on)} />
  )
}
