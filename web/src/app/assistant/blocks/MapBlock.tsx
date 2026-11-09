// Places in an answer (OpenSpec change assistant-generative-ui, spec "Map block"):
// the tasks' places and the saved places as markers on the app's map, with the same
// items as a numbered list under it. With maps off (or no WebGL) only the list
// shows and no map request is made: LocationMap renders nothing then. Lazy chunk.
import type { AssistantBlock } from '../../../lib/assistantBlocks'
import { useMapItems } from '../../../lib/assistantBlockData'
import { t } from '../../../lib/i18n'
import { LocationMap } from '../../locations/LocationMap'
import { openTaskPanel } from '../../panel'
import { navigate } from '../../router'

export default function MapBlock({ block }: { block: Extract<AssistantBlock, { kind: 'map' }> }) {
  const items = useMapItems(block)
  if (!items) return null
  if (!items.length) return <p className="p-3 text-meta text-muted">{t('Removed')}</p>
  const points = items.flatMap((it, i) => (it.lat !== undefined && it.lon !== undefined ? [{ lat: it.lat, lon: it.lon, label: `${i + 1}. ${it.title}` }] : []))
  return (
    <div data-assistant-map>
      <LocationMap label={t('{n, plural, one {Map, # place} other {Map, # places}}', { n: items.length })} className="h-48 w-full border-b border-default" points={points} />
      <ol className="divide-y divide-default">
        {items.map((it, i) => (
          <li key={it.id}>
            <button type="button" className="flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-body hover:bg-hover" onClick={() => (it.kind === 'task' ? openTaskPanel(it.id) : navigate({ view: 'place', id: it.id }))} data-map-item={it.id}>
              <span className="w-5 shrink-0 text-meta tabular-nums text-muted">{i + 1}.</span>
              <span className="min-w-0 flex-1 user-text">{it.title}</span>
              {it.where && it.where !== it.title && <span className="min-w-0 truncate text-meta text-muted user-text">{it.where}</span>}
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
