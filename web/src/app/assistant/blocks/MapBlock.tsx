// Places in an answer (OpenSpec changes assistant-generative-ui and
// assistant-map-lookup, spec "Map block"): the tasks' places and the saved places as
// markers on the app's map, with the same items as a numbered list under it. A place
// stored without coordinates is looked up by its address through the server's map
// proxy and marked "found by address"; nothing found is written. When no map can be
// drawn, a line above the list says why. With maps off no map request is made. Lazy chunk.
import { useState } from 'react'
import type { AssistantBlock } from '../../../lib/assistantBlocks'
import { useMapItems, useMapLookup } from '../../../lib/assistantBlockData'
import { t } from '../../../lib/i18n'
import { useMapsOn } from '../../../lib/locations'
import { hasWebGL, LocationMap } from '../../locations/LocationMap'
import { openTaskPanel } from '../../panel'
import { navigate } from '../../router'

/** Why the block draws no map, or null when it does (assistant-map-lookup D2). */
function reasonOf(o: { mapsOn: boolean; pending: boolean; points: number; unavailable: boolean }): string | null {
  if (!o.mapsOn) return t('Maps are off, so these places are listed without a map.')
  if (o.pending) return t('Finding these places on the map…')
  if (o.points === 0) return t('None of these places could be found on the map. Add an address or coordinates to show them.')
  if (!hasWebGL()) return t('This browser cannot draw maps.')
  if (o.unavailable) return t('The map could not load.')
  return null
}

export default function MapBlock({ block }: { block: Extract<AssistantBlock, { kind: 'map' }> }) {
  const mapsOn = useMapsOn()
  const { items, pending } = useMapLookup(useMapItems(block), mapsOn)
  const [unavailable, setUnavailable] = useState(false)
  if (!items) return null
  if (!items.length) return <p className="p-3 text-meta text-muted">{t('Removed')}</p>
  const points = items.flatMap((it, i) => (it.lat !== undefined && it.lon !== undefined ? [{ lat: it.lat, lon: it.lon, label: `${i + 1}. ${it.title}` }] : []))
  const reason = reasonOf({ mapsOn, pending, points: points.length, unavailable })
  return (
    <div data-assistant-map>
      {reason ? <p className="border-b border-default px-3 py-2 text-meta text-muted" data-map-reason>{reason}</p> : (
        <LocationMap label={t('{n, plural, one {Map, # place} other {Map, # places}}', { n: items.length })} className="h-48 w-full border-b border-default" points={points}
          onUnavailable={() => setUnavailable(true)} />
      )}
      <ol className="divide-y divide-default">
        {items.map((it, i) => (
          <li key={it.id}>
            <button type="button" className="flex min-h-9 w-full items-baseline gap-2 px-3 py-1.5 text-left text-body hover:bg-hover" onClick={() => (it.kind === 'task' ? openTaskPanel(it.id) : navigate({ view: 'place', id: it.id }))} data-map-item={it.id}>
              <span className="w-5 shrink-0 text-meta tabular-nums text-muted">{i + 1}.</span>
              <span className="min-w-0 flex-1 user-text">{it.title}</span>
              <span className="min-w-0 truncate text-right text-meta text-muted user-text">
                {it.where && it.where !== it.title ? it.where : ''}
                {it.approximate && <span className="ml-1.5 text-faint" data-approximate>{t('found by address')}</span>}
                {mapsOn && it.lat === undefined && !pending && <span className="ml-1.5 text-faint" data-not-found>{t('not on the map')}</span>}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
