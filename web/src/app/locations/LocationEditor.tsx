// The task panel's location editor (OpenSpec change task-locations, "Setting a
// location"): one field that finds saved places and, with maps on, addresses as
// you type, and reads typed coordinates; "Use my location"; picking a point on a
// map; "Save as a place"; and "Open in maps". Every choice is one undoable edit
// of the task's whole location value.
import { useCallback, useMemo, useState } from 'react'
import { isNetworkError, type MapResult } from '../../lib/api'
import {
  createPlace, formatCoordinates, isPhone, locationFromPlace, locationLabel, makeLocation, openInMapsHref, parseCoordinates,
  reverseAddress, searchAddress, setTaskLocation, shownLocation, useLivePlaces, useMapsOn, usePlaceRows, type ShownLocation,
} from '../../lib/locations'
import type { Geo, Place, Task, TaskLocation } from '../../lib/types'
import { Button, ComboboxPanel, Icon, Input, type AsyncSource } from '../../ui'
import { t } from '../../lib/i18n'
import { act, reportActionError } from '../actionError'
import { LocationMap } from './LocationMap'

/** The live places in their order. */
export function usePlaces(): Place[] {
  return useLivePlaces()
}

/** What a task's location shows now: the live linked place, else its own snapshot. */
export function useShownLocation(task: Pick<Task, 'location'>): ShownLocation | null {
  const places = usePlaceRows()
  const map = useMemo(() => new Map(places.map((p) => [p.id, p])), [places])
  return shownLocation(task, map)
}

type Item =
  | { kind: 'place'; key: string; label: string; secondary: string; place: Place }
  | { kind: 'result'; key: string; label: string; secondary: string; result: MapResult }
  | { kind: 'coords'; key: string; label: string; secondary: string; geo: Geo }

const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false

/** Asks the browser for the position; rejects with a message to show. */
function currentPosition(): Promise<Geo> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error(t('This browser cannot share its position.')))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(new Error(err.code === 1 ? t('The browser did not share the position.') : t('The position is not available right now.'))),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
    )
  })
}

export function LocationEditor({ task, onClose }: { task: Task; onClose: () => void }) {
  const mapsOn = useMapsOn()
  const places = usePlaces()
  const shown = useShownLocation(task)
  const [prefix, setPrefix] = useState<Item[]>([])
  const [message, setMessage] = useState('')
  const [picking, setPicking] = useState(false)
  const [naming, setNaming] = useState<string | null>(null)

  const placeItems = useMemo<Item[]>(() => places.map((p) => ({
    kind: 'place', key: `place:${p.id}`, label: p.name || t('Untitled location'), secondary: p.address, place: p,
  })), [places])

  // Saved places are matched as typed; addresses come from the geocoder (never text
  // matched, as it understands more than the words) and typed coordinates are a
  // choice of their own. Both go first, in `prefix`.
  const source = useCallback<AsyncSource<Item>>(async (q, signal) => {
    const coords = parseCoordinates(q)
    const coordItems: Item[] = coords ? [{ kind: 'coords', key: 'coords', label: t('Use {coords}', { coords: formatCoordinates(coords.lat, coords.lon) }), secondary: t('Coordinates'), geo: coords }] : []
    setPrefix(coordItems)
    setMessage('')
    if (!coords && q.trim().length >= 3 && mapsOn) {
      if (offline()) setMessage(t('Address search needs a connection.'))
      else {
        try {
          await new Promise((r) => setTimeout(r, 180))
          if (signal.aborted) return { items: placeItems }
          const results = await searchAddress(q.trim())
          if (!signal.aborted) {
            setPrefix(results.map((r, i) => ({ kind: 'result', key: `result:${i}:${r.lat},${r.lon}`, label: r.name || r.address, secondary: r.name ? r.address : '', result: r })))
          }
        } catch (err) {
          if (!signal.aborted) setMessage(isNetworkError(err) ? t('Address search needs a connection.') : t('Address search is not available right now.'))
        }
      }
    }
    return { items: placeItems }
  }, [placeItems, mapsOn])

  const write = (loc: TaskLocation | null) => act(setTaskLocation(task.id, loc))

  const pick = async (item: Item) => {
    if (item.kind === 'place') write(locationFromPlace(item.place))
    else if (item.kind === 'result') write(makeLocation(item.result))
    else write(makeLocation({ lat: item.geo.lat, lon: item.geo.lon }))
  }

  /** A point from the browser or the map: with maps on, its nearest address fills name and address. */
  const fromPoint = async (geo: Geo) => {
    let named: MapResult | null = null
    if (mapsOn && !offline()) named = await reverseAddress(geo.lat, geo.lon).catch(() => null)
    write(makeLocation({ name: named?.name, address: named?.address, lat: geo.lat, lon: geo.lon }))
  }

  const useMyLocation = async () => {
    setMessage('')
    try {
      await fromPoint(await currentPosition())
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    }
  }

  const saveAsPlace = async (name: string) => {
    if (!shown) return
    try {
      const geo = shown.lat !== undefined && shown.lon !== undefined ? { lat: shown.lat, lon: shown.lon } : null
      const id = await createPlace({ name, address: shown.address, geo })
      const loc = makeLocation({ name: name.trim(), address: shown.address, lat: geo?.lat, lon: geo?.lon, place_id: id })
      await setTaskLocation(task.id, loc)
      setNaming(null)
    } catch (err) {
      reportActionError(err)
    }
  }

  const hasPoint = shown && shown.lat !== undefined && shown.lon !== undefined
  return (
    <div className="space-y-3" data-location-editor>
      {shown && (
        <div className="space-y-1" data-location-current>
          <p className="text-body text-default">{shown.encrypted ? t('Encrypted') : locationLabel(shown)}</p>
          {shown.address && shown.name && <p className="text-meta text-muted">{shown.address}</p>}
          {hasPoint && (shown.name || shown.address) && <p className="text-meta tabular-nums text-faint">{formatCoordinates(shown.lat!, shown.lon!)}</p>}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {hasPoint && (
              <a href={openInMapsHref(shown.lat!, shown.lon!, isPhone())} target="_blank" rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-meta text-accent hover:underline" data-open-in-maps>
                <Icon name="external-link" size="xs" />{t('Open in maps')}
              </a>
            )}
            {shown.place && (
              <button type="button" className="text-meta text-muted hover:text-default hover:underline" onClick={() => write(makeLocation({ name: shown.name, address: shown.address, lat: shown.lat, lon: shown.lon }))}>
                {t('Unlink from {place}', { place: shown.place.name })}
              </button>
            )}
            {!shown.place && !shown.encrypted && naming === null && (
              <button type="button" className="text-meta text-muted hover:text-default hover:underline" onClick={() => setNaming(shown.name || '')}>{t('Save for reuse')}</button>
            )}
          </div>
          {naming !== null && (
            <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (naming.trim()) void saveAsPlace(naming) }}>
              <Input aria-label={t('Name of the saved location')} value={naming} autoFocus maxLength={200} onChange={(e) => setNaming(e.target.value)} placeholder={t('Home, Office, Gym…')} className="min-w-0 flex-1" />
              <Button type="submit" size="sm" variant="primary" disabled={!naming.trim()}>{t('Save')}</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setNaming(null)}>{t('Cancel')}</Button>
            </form>
          )}
        </div>
      )}
      <div className="space-y-1">
        <ComboboxPanel<Item> label={t('Location')}
          placeholder={mapsOn ? t('Search an address, a saved location or coordinates') : t('Find a saved location or type coordinates')}
          source={source} prefix={prefix} getKey={(i) => i.key} getLabel={(i) => i.label} getSecondary={(i) => i.secondary || undefined}
          getGroup={(i) => (i.kind === 'place' ? t('Saved locations') : i.kind === 'result' ? t('Addresses') : undefined)}
          renderLeading={(i) => <Icon name={i.kind === 'place' ? 'pin' : i.kind === 'coords' ? 'locate-fixed' : 'map-pin'} size="sm" className="text-faint" />}
          emptyText={mapsOn ? t('Type an address, a saved location or coordinates such as 45.4642, 9.19.') : t('No saved location matches. Type coordinates such as 45.4642, 9.19.')}
          onPick={pick} onClose={onClose} />
        {mapsOn && <p className="text-meta text-faint" data-privacy-line>{t('What you type here is sent to the map provider through this server.')}</p>}
        {message && <p role="status" className="text-meta text-danger" data-location-message>{message}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon="locate-fixed" onClick={useMyLocation}>{t('Use my location')}</Button>
        {mapsOn && <Button size="sm" variant="ghost" icon="map" aria-pressed={picking} onClick={() => setPicking((p) => !p)}>{t('Pick on the map')}</Button>}
      </div>
      {picking && (
        <LocationMap label={t('Map: click to pick the location')} className="h-56 w-full overflow-hidden rounded-control border border-default"
          points={hasPoint ? [{ lat: shown!.lat!, lon: shown!.lon! }] : []} onPick={(geo) => { setPicking(false); void fromPoint(geo) }} />
      )}
    </div>
  )
}
