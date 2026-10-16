// Motion helpers (OpenSpec change ux-overhaul, task-list-presentation "Completion
// feedback", "Drag feedback"; design-system "Reduced motion"): the emphasis
// duration from the tokens, and the reduced-motion guard that turns movement into
// an instant change while opacity may still fade.

/** The emphasis duration (`--duration-emphasis`), 250 ms unless the stylesheet says otherwise. */
export function emphasisMs(): number {
  if (typeof document === 'undefined') return 250
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--duration-emphasis').trim()
  const n = parseFloat(raw)
  return raw.endsWith('ms') ? n : raw.endsWith('s') ? n * 1000 : Number.isFinite(n) && n > 0 ? n : 250
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** How long a completing row waits before it leaves: the emphasis duration, 0 under reduced motion. */
export function completionDelay(): number {
  return prefersReducedMotion() ? 0 : emphasisMs()
}
