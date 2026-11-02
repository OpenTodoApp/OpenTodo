// Settings → Notifications → Location reminders (OpenSpec change location-reminders,
// design D4, D5): in the phone app with the `geofences` capability, the per-device
// switch "On this phone", off by default. Turning it on first shows a short
// disclosure in the card (never a dialog), then the shell asks for background
// location; with only foreground location the card explains what is missing and
// nothing is armed. In a browser, and in an older app, one line says where location
// reminders fire.
import { useEffect, useState } from 'react'
import { Badge, Button, Notice, SettingRow, SettingsSection, Switch } from '../ui'
import { t } from '../lib/i18n'
import { geofencesEnabled, setShellGeofences } from '../lib/geofences'
import { has, shell, type ShellLocationPermission } from '../lib/shell'
import { cardCopy, noticeCopy, rowCopy } from '../lib/settingsCopy'

export type LocationRemindersMode = 'shell' | 'update' | 'browser'

export interface LocationRemindersState {
  enabled: boolean
  /** The shell's last answer, null before one. */
  permission: ShellLocationPermission | null
}

export function LocationRemindersSection() {
  const mode: LocationRemindersMode = has('geofences') ? 'shell' : shell() ? 'update' : 'browser'
  const [state, setState] = useState<LocationRemindersState | null>(null)
  const [disclosing, setDisclosing] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (mode === 'shell') void geofencesEnabled().then((enabled) => setState({ enabled, permission: null }))
  }, [mode])
  const enable = async () => {
    setBusy(true)
    setDisclosing(false)
    const permission = await setShellGeofences(true)
    setState({ enabled: permission === 'granted', permission })
    setBusy(false)
  }
  const disable = async () => {
    setBusy(true)
    await setShellGeofences(false)
    setState({ enabled: false, permission: null })
    setBusy(false)
  }
  return (
    <LocationRemindersView mode={mode} platform={shell()?.platform ?? 'android'} state={state} disclosing={disclosing} busy={busy}
      onToggle={(on) => (on ? setDisclosing(true) : void disable())} onContinue={() => void enable()} onCancel={() => setDisclosing(false)} />
  )
}

/** Presentational part, rendered without effects for tests and stories. */
export function LocationRemindersView({ mode, platform, state: s, disclosing, busy, onToggle, onContinue, onCancel }: {
  mode: LocationRemindersMode
  platform: 'android' | 'ios' | 'desktop'
  state: LocationRemindersState | null
  disclosing: boolean
  busy: boolean
  onToggle: (on: boolean) => void
  onContinue: () => void
  onCancel: () => void
}) {
  const ios = platform === 'ios'
  return (
    <SettingsSection {...cardCopy('location-reminders')} testId="location-reminders-settings">
      {mode === 'browser' && <p className="py-2 text-meta text-muted" data-location-reminders-browser>{noticeCopy('location-reminders', 'browser')}</p>}
      {mode === 'update' && <Notice>{noticeCopy('location-reminders', 'update')}</Notice>}
      {mode === 'shell' && (!s ? (
        <p className="py-2 text-meta text-faint">{t('Checking…')}</p>
      ) : (
        <>
          <SettingRow {...rowCopy('location-reminders', 'phone')}
            status={<Badge hue={s.enabled ? 'green' : 'slate'}>{s.enabled ? t('On') : t('Off')}</Badge>}
            control={<Switch checked={s.enabled} disabled={busy || disclosing} onChange={onToggle} label={t('Location reminders on this phone')} hideLabel />} />
          {disclosing && (
            <div className="space-y-2 rounded-control border border-default bg-sunken p-3" role="region" aria-label={t('About location access')} data-location-disclosure>
              <p className="text-body text-default">
                {t('OpenTodo checks your location only to notice when you arrive at or leave the places of your location reminders. Your location stays on this phone and is never sent to your server.')}
              </p>
              <p className="text-meta text-muted">
                {ios
                  ? t('Next, iOS asks for your location: allow it, then choose Always.')
                  : t('Next, Android asks for your location: allow it, then choose Allow all the time.')}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="primary" busy={busy} onClick={onContinue}>{t('Continue')}</Button>
                <Button size="sm" variant="ghost" onClick={onCancel}>{t('Not now')}</Button>
              </div>
            </div>
          )}
          {!s.enabled && s.permission === 'foreground-only' && (
            <Notice tone="warning" action={<Button size="sm" onClick={onContinue}>{t('Open settings')}</Button>}>
              {ios
                ? t('Location reminders need Always. Choose Always for OpenTodo in the iPhone settings; nothing is watched until then.')
                : t('Location reminders need Allow all the time. Choose it for OpenTodo in Android settings; nothing is watched until then.')}
            </Notice>
          )}
          {!s.enabled && s.permission === 'denied' && (
            <Notice tone="warning" action={<Button size="sm" onClick={onContinue}>{t('Open settings')}</Button>}>
              {t('Location access is off for OpenTodo. Allow it in the phone\'s settings to use location reminders.')}
            </Notice>
          )}
          {!s.enabled && s.permission === 'unavailable' && (
            <Notice tone="warning">{t('This phone cannot watch places for OpenTodo.')}</Notice>
          )}
        </>
      ))}
    </SettingsSection>
  )
}
