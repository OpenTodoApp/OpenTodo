// Location reminders in the task panel (OpenSpec change location-reminders, design
// D5): the "At a place" group of the reminder menu, the inline radius form and the
// chip's words. A location reminder fires on a phone with the OpenTodo app and
// "Location reminders on this phone" on; everywhere else the chip says so.
import { Icon, MenuGroup, MenuItem, Tooltip } from '../ui'
import { t } from '../lib/i18n'
import type { LocationKind } from '../lib/geofences'

/** "150 m", "1 km", "1.5 km". */
export function radiusText(m: number): string {
  return m >= 1000 ? t('{km} km', { km: Math.round(m / 100) / 10 }) : t('{m} m', { m })
}

/** The chip's name: "Arriving at Post office" or "Leaving Home". */
export function locationReminderName(kind: LocationKind, place: string): string {
  const where = place || t('the task’s location')
  return kind === 'arrive' ? t('Arriving at {place}', { place: where }) : t('Leaving {place}', { place: where })
}

/**
 * The reminder menu's "At a place" group: "When I arrive" and "When I leave" for a
 * task whose location has a point, both disabled with the reason otherwise, and
 * "Add a location…" that opens the location editor when the panel can.
 */
export function LocationMenuGroup({ place, hasPoint, onPick, onAddLocation }: {
  place: string
  hasPoint: boolean
  onPick: (kind: LocationKind) => void
  onAddLocation?: () => void
}) {
  const why = hasPoint ? (place || undefined) : t('Add a location with a point on the map first')
  return (
    <MenuGroup label={t('At a place')}>
      <MenuItem label={t('When I arrive')} icon="map-pin" description={why} disabled={!hasPoint} data-location-reminder="arrive" onSelect={() => onPick('arrive')} />
      <MenuItem label={t('When I leave')} icon="log-out" description={why} disabled={!hasPoint} data-location-reminder="leave" onSelect={() => onPick('leave')} />
      {!hasPoint && onAddLocation && <MenuItem label={t('Add a location…')} icon="map" data-add-location onSelect={onAddLocation} />}
    </MenuGroup>
  )
}

/** "Fires on your phone": a second line on phones, an icon with a tooltip on wider screens. */
export function FiresOnPhone({ part }: { part: 'line' | 'icon' }) {
  const text = t('Fires on your phone')
  if (part === 'line') return <span className="block text-meta text-muted sm:hidden" data-fires-on-phone>{text}</span>
  return (
    <Tooltip label={text}>
      <span className="hidden shrink-0 text-faint sm:inline-flex" data-fires-on-phone-icon>
        <Icon name="locate-fixed" size="xs" /><span className="sr-only">{text}</span>
      </span>
    </Tooltip>
  )
}
