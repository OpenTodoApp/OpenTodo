// Overlay exits (OpenSpec change motion-v2, web-app "Overlay motion", design D5).
// Overlays are mounted while open, so their exit plays on a copy: when the real one
// unmounts, a still picture of it (no ids, roles or handlers, inert, hidden from
// assistive technology) takes its place for three quarters of the emphasis duration,
// carrying `data-closing`, and is removed when its animation ends. Focus has already
// gone back where the overlay's own code put it. Nothing plays under the no-motion
// attribute or where the browser runs no animations.

/** The longest an exit copy stays, whatever happens to its animation. */
const SAFETY_MS = 300

function strip(el: Element): void {
  for (const attr of [...el.attributes]) {
    const n = attr.name
    if (n === 'id' || n === 'role' || n === 'tabindex' || n === 'for' || n.startsWith('aria-') || (n.startsWith('data-') && n !== 'data-placement')) el.removeAttribute(n)
  }
}

/**
 * Plays `el`'s exit on a copy. `closing` selects the element inside the copy that carries
 * the exit animation (the copy itself by default); `className` is added to the copy.
 * Call it while `el` is still in the document, in a layout effect's cleanup.
 */
export function playExit(el: HTMLElement | null, { closing, className }: { closing?: string; className?: string } = {}): void {
  if (!el || !el.isConnected || typeof document === 'undefined' || typeof document.getAnimations !== 'function') return
  if (document.documentElement.dataset.motion === 'none') return
  const rect = el.getBoundingClientRect()
  const copy = el.cloneNode(true) as HTMLElement
  for (const node of [copy, ...copy.querySelectorAll('*')]) strip(node)
  copy.setAttribute('aria-hidden', 'true')
  copy.inert = true
  copy.dataset.overlayExit = ''
  if (className) copy.classList.add(...className.split(' '))
  // Where it was on screen, whatever positioned it (a static column, a fixed sheet).
  Object.assign(copy.style, { position: 'fixed', top: `${rect.top}px`, left: `${rect.left}px`, width: `${rect.width}px`, height: `${rect.height}px`, margin: '0', pointerEvents: 'none' })
  const target = (closing ? copy.querySelector<HTMLElement>(closing) : null) ?? copy
  target.setAttribute('data-closing', '')
  document.body.append(copy)
  // An overlay with no exit at this width (a phone's full-screen dialog) leaves at once.
  if (target.getAnimations().length === 0) { copy.remove(); return }
  let timer: ReturnType<typeof setTimeout> | undefined
  const done = () => { clearTimeout(timer); copy.remove() }
  target.addEventListener('animationend', done, { once: true })
  timer = setTimeout(done, SAFETY_MS)
}
