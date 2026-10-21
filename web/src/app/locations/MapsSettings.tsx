// Map settings (OpenSpec change task-locations, "Map switches"): the owner's
// server-wide switch and providers in Settings → Server, read-only where an
// OPENTODO_MAPS* variable sets them, and each user's own switch in Settings →
// General (synced as user_prefs.maps).
import { useEffect, useState } from 'react'
import { api, isNetworkError, type MapsSetting } from '../../lib/api'
import { refreshMapsAvailable, setMapsPref, useMapsPref } from '../../lib/locations'
import { cardCopy } from '../../lib/settingsCopy'
import { Button, Field, Input, Notice, SettingsSection, Switch } from '../../ui'
import { t } from '../../lib/i18n'
import { act } from '../actionError'

/** Settings → Server → Maps (owner only). */
export function MapsServerPanel() {
  const [s, setS] = useState<MapsSetting | null>(null)
  const [tiles, setTiles] = useState('')
  const [geocoder, setGeocoder] = useState('')
  const [error, setError] = useState('')
  const load = async () => {
    try {
      const v = await api.getMapsSetting()
      setS(v)
      setTiles(v.tiles_url)
      setGeocoder(v.geocoder_url)
    } catch (err) {
      setError(isNetworkError(err) ? t('Connect to change the map settings.') : err instanceof Error ? err.message : String(err))
    }
  }
  useEffect(() => { void load() }, [])
  const save = async (next: { enabled: boolean; tiles_url?: string; geocoder_url?: string }) => {
    setError('')
    try {
      const v = await api.putMapsSetting(next)
      setS(v)
      setTiles(v.tiles_url)
      setGeocoder(v.geocoder_url)
      await refreshMapsAvailable()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  const locked = (f: string) => !!s?.locked.includes(f)
  const byVariable = (name: string) => t('Set by {variable}', { variable: name })
  return (
    <SettingsSection {...cardCopy('maps-server')} id="maps">
      {s && (
        <div className="mt-3 space-y-3" data-maps-server>
          <Switch label={t('Show maps and address search')} checked={s.enabled} disabled={locked('enabled')}
            description={locked('enabled') ? byVariable('OPENTODO_MAPS') : undefined}
            onChange={(on) => act(save({ enabled: on }))} />
          <Field label={t('Map tiles')} description={locked('tiles_url') ? byVariable('OPENTODO_MAPS_TILES_URL') : t('A map style URL; OpenFreeMap by default.')}>
            <Input value={tiles} disabled={locked('tiles_url')} onChange={(e) => setTiles(e.target.value)} placeholder={s.defaults.tiles_url} />
          </Field>
          <Field label={t('Address search')} description={locked('geocoder_url') ? byVariable('OPENTODO_MAPS_GEOCODER_URL') : t('A Photon server; the public Photon by default.')}>
            <Input value={geocoder} disabled={locked('geocoder_url')} onChange={(e) => setGeocoder(e.target.value)} placeholder={s.defaults.geocoder_url} />
          </Field>
          {!(locked('tiles_url') && locked('geocoder_url')) && (
            <Button size="sm" variant="secondary" disabled={tiles === s.tiles_url && geocoder === s.geocoder_url}
              onClick={() => save({ enabled: s.enabled, tiles_url: tiles.trim() === s.defaults.tiles_url ? '' : tiles, geocoder_url: geocoder.trim() === s.defaults.geocoder_url ? '' : geocoder })}>
              {t('Save providers')}
            </Button>
          )}
        </div>
      )}
      {error && <div className="mt-3"><Notice tone="danger">{error}</Notice></div>}
    </SettingsSection>
  )
}

/** Settings → General → Maps: this user's switch, synced to every device. */
export function MapsUserSection() {
  const on = useMapsPref()
  return (
    <SettingsSection {...cardCopy('maps-user')} id="maps">
      <div className="mt-3">
        <Switch label={t('Show maps and address search')} checked={on} onChange={(on) => act(setMapsPref(on))} />
      </div>
    </SettingsSection>
  )
}
