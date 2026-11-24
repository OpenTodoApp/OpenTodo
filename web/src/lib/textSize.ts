// Text size (OpenSpec change text-size, GitHub issue 1414; appearance-preferences "Text
// size per device"): a per-device choice, never synced, that scales the root font size,
// so everything in rem grows and reflows. Default is the device's own size: Dynamic Type
// in the iOS app (WebKit's -apple-system-body, 17 px at the default size), the system
// font scale the Android app hands over, the browser's text size elsewhere.
// public/appearance.js applies the same before the first frame; keep the two in step.
import { useEffect, useSyncExternalStore } from 'react'
import { createStoredValue } from './deviceStorage'
import { resettable } from './moduleState'
import { shell } from './shell'

export const TEXT_SIZE_KEY = 'opentodo.textSize'
export const TEXT_SIZES = ['default', 'large', 'larger', 'largest'] as const
export type TextSize = (typeof TEXT_SIZES)[number]

/** The scale of each explicit step; Default follows the device. */
export const TEXT_SCALE: Record<Exclude<TextSize, 'default'>, number> = { large: 1.125, larger: 1.25, largest: 1.5 }

/** A system scale within 85 % to 200 %; anything unreadable is 1. */
export function clampScale(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.min(2, Math.max(0.85, n)) : 1
}

/** The root scale for a choice and the device's own scale. */
export function textScale(size: TextSize, system: number): number {
  return size === 'default' ? clampScale(system) : TEXT_SCALE[size]
}

const size = createStoredValue<TextSize>(TEXT_SIZE_KEY, {
  parse: (raw) => (raw === 'large' || raw === 'larger' || raw === 'largest' ? raw : 'default'),
  serialize: (v) => (v === 'default' ? null : v),
}, { crossTab: true, server: 'default' })

export const useTextSize = size.use
export const setTextSize = size.set

const IOS_BODY = 17

/** The device's own text scale: Dynamic Type in the iOS app, the font scale in the Android app, else 1. */
export function systemTextScale(probe: HTMLElement | null = null): number {
  const s = shell()
  if (s?.platform === 'android') return clampScale(s.textScale)
  if (s?.platform !== 'ios' || !probe) return 1
  return clampScale(Number.parseFloat(getComputedStyle(probe).fontSize) / IOS_BODY)
}

/** Writes the scale on the root; 1 removes it, so the stylesheet's default applies. */
export function applyTextScale(scale: number, doc: Document = document): void {
  const root = doc.documentElement
  if (scale === 1) root.style.removeProperty('--ot-text-scale')
  else root.style.setProperty('--ot-text-scale', String(scale))
}

/** A hidden element in WebKit's Dynamic Type body font; its size changes when Dynamic Type does. */
function iosProbe(): HTMLElement | null {
  if (shell()?.platform !== 'ios') return null
  const el = document.createElement('span')
  el.setAttribute('aria-hidden', 'true')
  el.style.cssText = 'font:-apple-system-body;position:absolute;visibility:hidden;pointer-events:none;inset-inline-start:-100vw'
  el.textContent = 'M'
  document.body.appendChild(el)
  return el
}

// Made on the first read, so the first render already reads Dynamic Type and keeps the
// scale appearance.js put on the root instead of writing 1 until the subscription.
let probe: HTMLElement | null | undefined
resettable('textSizeProbe', () => { probe?.remove(); probe = undefined })
const ensureProbe = () => {
  if (probe === undefined) probe = typeof document === 'undefined' ? null : iosProbe()
  return probe
}
const subscribeSystem = (listener: () => void) => {
  ensureProbe()
  const observer = probe && typeof ResizeObserver === 'function' ? new ResizeObserver(listener) : null
  if (probe && observer) observer.observe(probe)
  document.addEventListener('visibilitychange', listener)
  return () => {
    observer?.disconnect()
    document.removeEventListener('visibilitychange', listener)
  }
}
const readSystem = () => systemTextScale(ensureProbe())

/** Keeps the root font size in step with this device's text size and the system's. */
export function useTextScale(): void {
  const choice = useTextSize()
  const system = useSyncExternalStore(subscribeSystem, readSystem, () => 1)
  const scale = textScale(choice, system)
  useEffect(() => { applyTextScale(scale) }, [scale])
  // The Android shell stops its own text zoom once the page applies the font scale (appearance.js says so first).
  useEffect(() => { shell()?.textScaleApplied?.() }, [])
}
