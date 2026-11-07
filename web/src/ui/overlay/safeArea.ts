// The safe areas as numbers (GitHub issue 973), for code that places things itself
// (anchored popovers). CSS reads the tokens --safe-top/-right/-bottom/-left
// (index.css); getComputedStyle does not resolve env() inside a custom property, so
// one hidden probe padded by the tokens is read instead.
import type { Insets } from './position'

// The probe, created on first use; a document that replaced its body gets a new one.
const held: { probe: HTMLElement | null } = { probe: null }

/** The current safe-area insets in px: 0 on every edge without a notch, island, home indicator or rounded side. */
export function safeInsets(): Insets {
  if (typeof document === 'undefined' || !document.body) return { top: 0, right: 0, bottom: 0, left: 0 }
  let probe = held.probe
  if (!probe || !probe.isConnected) {
    probe = document.createElement('div')
    probe.setAttribute('aria-hidden', 'true')
    probe.setAttribute('data-safe-area-probe', '')
    probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:var(--safe-top) var(--safe-right) var(--safe-bottom) var(--safe-left)'
    document.body.appendChild(probe)
    held.probe = probe
  }
  const cs = getComputedStyle(probe)
  const px = (v: string) => Number.parseFloat(v) || 0
  return { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) }
}
