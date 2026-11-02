// The inline form of a location reminder (OpenSpec change location-reminders, design
// D5), loaded with its first use: the direction, the place and the radius, with
// presets and a slider from 100 m to 5 km.
import { useState } from 'react'
import { Button, Icon, SegmentedControl } from '../ui'
import { t } from '../lib/i18n'
import { formatCoordinates } from '../lib/locations'
import { DEFAULT_RADIUS, MAX_RADIUS, MIN_RADIUS, RADIUS_PRESETS, radiusOf, type LocationKind } from '../lib/geofences'
import type { Reminder } from '../lib/types'
import { radiusText } from './LocationReminders'

/** The inline form of a location reminder: the place, the direction and the radius (presets and a slider). */
export function LocationReminderEditor({ kind: startKind, place, point, initial, onSave, onCancel }: {
  kind: LocationKind
  place: string
  point: { lat: number; lon: number } | null
  initial?: Reminder
  onSave: (input: { kind: LocationKind; radius_m: number }) => void
  onCancel: () => void
}) {
  const [kind, setKind] = useState<LocationKind>(startKind)
  const [radius, setRadius] = useState(initial ? radiusOf(initial) : DEFAULT_RADIUS)
  const presets = RADIUS_PRESETS.map((m) => ({ id: String(m), label: radiusText(m) }))
  return (
    <form className="w-full space-y-2 rounded-control border border-default p-2.5" data-location-reminder-editor
      onSubmit={(e) => { e.preventDefault(); onSave({ kind, radius_m: radius }) }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel() } }}>
      <SegmentedControl label={t('Remind me')} value={kind} onChange={setKind} className="w-full"
        options={[{ id: 'arrive', label: t('When I arrive') }, { id: 'leave', label: t('When I leave') }]} />
      <p className="flex min-w-0 items-start gap-1.5 text-body text-default">
        <Icon name="map-pin" className="mt-0.5 shrink-0 text-faint" />
        <span className="min-w-0">
          <span className="block truncate">{place || t('the task’s location')}</span>
          {point && <span className="block text-meta text-muted tabular-nums">{formatCoordinates(point.lat, point.lon)}</span>}
        </span>
      </p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span id="location-radius-label" className="text-meta text-muted">{t('Radius')}</span>
          <span className="text-meta font-medium text-default tabular-nums" data-radius-value>{radiusText(radius)}</span>
        </div>
        <SegmentedControl label={t('Radius presets')} value={String(radius)} onChange={(v) => setRadius(Number(v))} options={presets} className="w-full" />
        <input type="range" min={MIN_RADIUS} max={MAX_RADIUS} step={50} value={radius} aria-labelledby="location-radius-label"
          aria-valuetext={radiusText(radius)} onChange={(e) => setRadius(Number(e.target.value))} className="block w-full accent-(--ot-accent)" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" variant="primary">{t('Save')}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>{t('Cancel')}</Button>
      </div>
    </form>
  )
}


export default LocationReminderEditor
