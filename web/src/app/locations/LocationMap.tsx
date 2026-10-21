// A map, loaded only when one is shown (task-locations D5): the MapLibre chunk is a
// dynamic import, so a device with maps off, or a screen without a map, never
// downloads it. Devices without WebGL, and a server whose provider is down, get
// nothing here; the location stays readable with "Open in maps".
import { Component, lazy, Suspense, useState, type ReactNode } from 'react'
import { useMapsOn } from '../../lib/locations'
import type { MapViewProps } from './MapView'

const MapView = lazy(() => import('./MapView'))

function webgl(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
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
  if (!on || unavailable || (props.points.length === 0 && !props.onPick) || !webgl()) return null
  return (
    <Boundary>
      <Suspense fallback={<div className={props.className} aria-hidden="true" />}>
        <MapView {...props} onUnavailable={() => setUnavailable(true)} />
      </Suspense>
    </Boundary>
  )
}
