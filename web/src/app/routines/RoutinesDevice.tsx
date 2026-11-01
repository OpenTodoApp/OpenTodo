// Routines on the user's devices for an encrypted account (OpenSpec change
// routines-ai-step, D7, D9, D12): "Run my routines on this device" in
// Settings → Encryption with the devices that run them and this device's
// recent runs, and the editor's warning with the opt-in.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { api } from '../../lib/api'
import { formatInstant } from '../../lib/dates'
import { useEncryption } from '../../lib/e2ee'
import { messageOf } from '../../lib/errorText'
import { t } from '../../lib/i18n'
import { onRelayChange, relaySnapshot, routinesOptIn, routinesOptOut, type RecentRoutineRun, type RelayDevice } from '../../lib/relay'
import { rowCopy } from '../../lib/settingsCopy'
import { Badge, Button, Notice, SettingRow, StatusIndicator, Switch } from '../../ui'

/** A recent run's outcome in words. */
export function routineOutcomeText(r: Pick<RecentRoutineRun, 'outcome' | 'writes'>): string {
  switch (r.outcome) {
    case 'applied': case 'partial': return t('{n, plural, one {# item written} other {# items written}}', { n: r.writes })
    case 'proposal': return t('Proposal waiting')
    case 'already_matched': return t('Nothing to change')
    case 'ended': return t('Ended by a Stop step')
    case 'routine_changed': return t('Not run: the routine changed')
    default: return t('Failed')
  }
}

export interface RoutinesDeviceViewProps {
  unlocked: boolean
  on: boolean
  connected: boolean
  running: string | null
  devices: RelayDevice[]
  recent: RecentRoutineRun[]
  busy: boolean
  error: string | null
  onToggle: (on: boolean) => void
  onTurnOff: (device: string) => void
}

/** Pure rendering; state lives in RoutinesDeviceSettings. */
export function RoutinesDeviceView(p: RoutinesDeviceViewProps) {
  const copy = rowCopy('e2ee', 'routines')
  const status = !p.on ? undefined
    : p.running ? <StatusIndicator tone="busy">{t('Running {name}…', { name: p.running })}</StatusIndicator>
      : !p.unlocked ? <StatusIndicator tone="warn">{t('Runs when unlocked')}</StatusIndicator>
        : <StatusIndicator tone={p.connected ? 'ok' : 'busy'}>{p.connected ? t('Ready') : t('Connecting…')}</StatusIndicator>
  return (
    <div className="space-y-1 border-t border-default pt-3" data-routines-device>
      <SettingRow label={copy.label} description={<span id="routines-device-help">{copy.description}</span>} status={status}
        control={<Switch checked={p.on} disabled={p.busy || (!p.unlocked && !p.on)} onChange={p.onToggle} label={t('Run my routines on this device')} hideLabel describedBy="routines-device-help" />} />
      {!p.unlocked && !p.on && <p className="text-meta text-muted">{t('Unlock this device to turn it on.')}</p>}
      {p.error && <Notice tone="danger">{p.error}</Notice>}
      {p.devices.length > 0 && (
        <SettingRow label={rowCopy('e2ee', 'routinesDevices').label} control={(
          <ul className="space-y-1 text-meta text-default" aria-label={rowCopy('e2ee', 'routinesDevices').label}>
            {p.devices.map((d) => (
              <li key={d.deviceId} className="flex flex-wrap items-center justify-end gap-2">
                <span>{d.label || t('Device')}</span>
                {d.thisSession && <Badge>{t('This device')}</Badge>}
                {d.capabilities?.includes('ai') && <Badge>{t('AI steps')}</Badge>}
                {!d.thisSession && (
                  <Button size="sm" variant="ghost" disabled={p.busy} onClick={() => p.onTurnOff(d.deviceId)}
                    aria-label={t('Turn off for {device}', { device: d.label || t('Device') })}>{t('Turn off')}</Button>
                )}
              </li>
            ))}
          </ul>
        )} />
      )}
      {p.on && p.recent.length > 0 && (
        <details className="py-2 text-body" data-routines-recent>
          <summary className="font-medium text-default">{rowCopy('e2ee', 'routinesRecent').label}</summary>
          <p className="mt-1 text-meta text-muted">{rowCopy('e2ee', 'routinesRecent').description}</p>
          <ul className="mt-2 space-y-1 text-meta">
            {p.recent.map((r, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 text-default">
                <span>{r.name || t('Untitled routine')}</span>
                <span className="text-muted">{routineOutcomeText(r)} · {formatInstant(r.at, 'datetime')}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

/** The devices of the account that run routines, refreshed with the opt-in. */
function useRoutineDevices(on: boolean): [RelayDevice[], () => void] {
  const [devices, setDevices] = useState<RelayDevice[]>([])
  const refresh = useCallback(() => {
    void api.relayDevices().then((r) => setDevices(r.devices.filter((d) => d.routines)), () => undefined)
  }, [])
  useEffect(refresh, [refresh, on])
  return [devices, refresh]
}

/** Settings → Encryption: this device's routines opt-in. */
export function RoutinesDeviceSettings() {
  const enc = useEncryption()
  const relay = useSyncExternalStore(onRelayChange, relaySnapshot, relaySnapshot)
  const [devices, refresh] = useRoutineDevices(relay.routines)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const act = (p: Promise<void>) => {
    setBusy(true)
    setError(null)
    void p.then(refresh, (err: unknown) => setError(messageOf(err))).finally(() => setBusy(false))
  }
  return (
    <RoutinesDeviceView unlocked={enc.unlocked} on={relay.routines} connected={relay.connected} running={relay.running?.name ?? null}
      devices={devices} recent={relay.routineRecent} busy={busy} error={error}
      onToggle={(on) => act(on ? routinesOptIn() : routinesOptOut())} onTurnOff={(d) => act(routinesOptOut(d))} />
  )
}

export interface EncryptedRoutineNoteViewProps {
  on: boolean
  devices: RelayDevice[]
  unlocked: boolean
  busy: boolean
  error: string | null
  onTurnOn: () => void
}

/** The editor's warning on a routine that runs on a device (D12). */
export function EncryptedRoutineNoteView(p: EncryptedRoutineNoteViewProps) {
  const names = p.devices.map((d) => d.label || t('Device')).join(', ')
  return (
    <div className="mx-auto max-w-[44rem]" data-routine-device-note>
      <Notice tone="warning">
        <p>{t('This routine reads text, so it runs on one of your devices. When it is due, a device with Run my routines turned on must be online and unlocked.')}</p>
        {p.devices.length > 0 && <p className="mt-1">{t('Runs on: {devices}', { devices: names })}</p>}
        {p.devices.length === 0 && !p.on && <p className="mt-1">{t('Turn on Run my routines on a device.')}</p>}
        {!p.on && (
          <Button className="mt-2" size="sm" variant="secondary" disabled={p.busy || !p.unlocked} onClick={p.onTurnOn} data-routines-opt-in>
            {t('Run my routines on this device')}
          </Button>
        )}
        {p.error && <p className="mt-1 text-danger">{p.error}</p>}
      </Notice>
    </div>
  )
}

export function EncryptedRoutineNote() {
  const enc = useEncryption()
  const relay = useSyncExternalStore(onRelayChange, relaySnapshot, relaySnapshot)
  const [devices, refresh] = useRoutineDevices(relay.routines)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const onTurnOn = () => {
    setBusy(true)
    setError(null)
    void routinesOptIn().then(refresh, (err: unknown) => setError(messageOf(err))).finally(() => setBusy(false))
  }
  return <EncryptedRoutineNoteView on={relay.routines} devices={devices} unlocked={enc.unlocked} busy={busy} error={error} onTurnOn={onTurnOn} />
}
