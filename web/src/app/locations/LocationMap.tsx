// A map, loaded only when one is shown (task-locations D5): the MapLibre chunk is a
// dynamic import, so a device with maps off, or a screen without a map, never
// downloads it. Devices without WebGL, and a server whose provider is down, get
// nothing here; the location stays readable with "Open in maps".
import { Component, lazy, Suspense, useState, type ReactNode } from 'react'
import { useMapsOn } from '../../lib/locations'
import { resettable } from '../../lib/moduleState'
import type { MapViewProps } from './MapView'

const MapView = lazy(() => import('./MapView'))

let webglCache: boolean | undefined
resettable('LocationMap', () => { webglCache = undefined })

/** Whether this browser can draw a map (WebGL), asked once: each check creates a context (assistant-map-lookup). */
export function hasWebGL(): boolean {
  if (webglCache !== undefined) return webglCache
  try {
    const c = document.createElement('canvas')
    webglCache = !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    webglCache = false
  }
  return webglCache
}

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

export function LocationMap(props: MapViewProps) {
  const on = useMapsOn()
  const [unavailable, setUnavailable] = useState(false)
  if (!on || unavailable || (props.points.length === 0 && !props.onPick) || !hasWebGL()) return null
  return (
    <Boundary>
      <Suspense fallback={<div className={props.className} aria-hidden="true" />}>
        <MapView {...props} onUnavailable={() => { setUnavailable(true); props.onUnavailable?.() }} />
      </Suspense>
    </Boundary>
  )
}
