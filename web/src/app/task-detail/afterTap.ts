// A blur caused by a tap arrives before that tap's click (OpenSpec web-app "Task panel
// comment composer"): hiding the composer's toolbar or putting the composer to rest at
// once moves the control under the finger, and the click lands elsewhere (a comment's
// More needed a second tap on phones). Shared by the composer and its rich field.

/** When the last pointer press began (ms), to tell a tap's blur from a keyboard one. */
let lastPress = 0
if (typeof document !== 'undefined') document.addEventListener('pointerdown', () => { lastPress = Date.now() }, true)

/** Runs `fn` after the click of the tap that moved focus away (at most 600 ms on); a keyboard move runs it at once. */
export function afterTap(fn: () => void) {
  if (Date.now() - lastPress > 1000) { fn(); return }
  let done = false
  const run = () => { if (done) return; done = true; window.removeEventListener('click', onClick, true); clearTimeout(timer); requestAnimationFrame(fn) }
  const onClick = () => run()
  window.addEventListener('click', onClick, true)
  const timer = setTimeout(run, 600)
}
