// The map itself (OpenSpec change task-locations, design D5): MapLibre GL, loaded
// only by this module, which LocationMap imports lazily, so the main bundle does
// not change. The style comes from the server's map proxy, so every tile, font
// and sprite request goes to this server, never to the provider. The worker is
// built by Vite as a file of the app's own origin (worker-src 'self', no blob).
import { useEffect, useRef, useState } from 'react'
import { Map as MapLibre, Marker, setWorkerUrl, type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { Geo } from '../../lib/types'

setWorkerUrl(workerUrl)

export interface MapViewProps {
  /** Pins to show; the map frames them (one pin: centred at street level). */
  points: (Geo & { label?: string })[]
  /** A click on the map picks that point (the location editor's "Pick on the map"). */
  onPick?: (geo: Geo) => void
  /** The accessible name of the map region. */
  label: string
  /** Called when the map cannot be shown (no WebGL, maps unavailable); the caller hides it. */
  onUnavailable?: () => void
  className?: string
  /** The style to load: the signed-in proxy by default, a task page's own proxy for guests (task-pages). */
  styleUrl?: string
  /** Sends the session cookie (the signed-in proxy); a task page sends none. */
  credentials?: RequestCredentials
}

/** Makes the proxy's root-relative URLs absolute, as MapLibre needs. */
function absolute(style: unknown): unknown {
  const origin = window.location.origin
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return v.startsWith('/api/v1/') ? origin + v : v
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
    return v
  }
  return walk(style)
}

function accent(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--ot-accent').trim() || 'currentColor'
}

export default function MapView({ points, onPick, label, onUnavailable, className, styleUrl = '/api/v1/maps/style', credentials = 'same-origin' }: MapViewProps) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibre | null>(null)
  const markers = useRef<Marker[]>([])
  const pick = useRef(onPick)
  pick.current = onPick
  const [ready, setReady] = useState(false)
  const key = points.map((p) => `${p.lat},${p.lon}`).join(';')

  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const res = await fetch(styleUrl, { credentials })
        if (!res.ok) throw new Error(`style ${res.status}`)
        const style = absolute(await res.json()) as StyleSpecification
        if (!live || !box.current) return
        const m = new MapLibre({
          container: box.current, style, attributionControl: { compact: true },
          center: points[0] ? [points[0].lon, points[0].lat] : [0, 20], zoom: points[0] ? 15 : 1,
          // Keyboard: the map container is focusable and pans with the arrows (MapLibre default).
        })
        m.on('click', (e) => pick.current?.({ lat: e.lngLat.lat, lon: e.lngLat.lng }))
        m.on('error', () => undefined) // a missing tile is not a broken map
        // MapLibre opens the compact attribution until the first interaction, covering a small
        // map; start it closed, its "i" button still opens it.
        m.once('load', () => box.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'))
        map.current = m
        setReady(true)
      } catch {
        if (live) onUnavailable?.()
      }
    })()
    return () => {
      live = false
      map.current?.remove()
      map.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the map is created once; pins follow below
  }, [])

  useEffect(() => {
    const m = map.current
    if (!m) return
    for (const mk of markers.current) mk.remove()
    markers.current = points.map((p) => new Marker({ color: accent() }).setLngLat([p.lon, p.lat]).addTo(m))
    if (points.length === 1) m.jumpTo({ center: [points[0].lon, points[0].lat], zoom: Math.max(m.getZoom(), 14) })
    else if (points.length > 1) {
      const lons = points.map((p) => p.lon)
      const lats = points.map((p) => p.lat)
      m.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 40, maxZoom: 15, animate: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for the points' coordinates
  }, [key, ready])

  return <div ref={box} role="region" aria-label={label} tabIndex={0} className={className} data-map />
}
