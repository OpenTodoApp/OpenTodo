// Under the task panel's facet lines (task-locations "Setting a location"): with a
// coordinate pair, a small map with a pin when maps are on, and "Open in maps" in
// every case. Nothing at all for a task without coordinates.
import { isPhone, locationLabel, openInMapsHref, type ShownLocation } from '../../lib/locations'
import { Icon } from '../../ui'
import { t } from '../../lib/i18n'
import { LocationMap } from './LocationMap'

export function LocationPreview({ shown }: { shown: ShownLocation | null }) {
  if (!shown || shown.encrypted || shown.lat === undefined || shown.lon === undefined) return null
  const label = locationLabel(shown)
  return (
    <div className="space-y-1 pl-7" data-location-preview>
      <LocationMap label={t('Map of {place}', { place: label })} className="h-32 w-full overflow-hidden rounded-control border border-default"
        points={[{ lat: shown.lat, lon: shown.lon, label }]} />
      <a href={openInMapsHref(shown.lat, shown.lon, isPhone())} target="_blank" rel="noreferrer noopener"
        className="inline-flex min-h-7 items-center gap-1 text-meta text-accent hover:underline" data-open-in-maps>
        <Icon name="external-link" size="xs" />{t('Open in maps')}
      </a>
    </div>
  )
}
