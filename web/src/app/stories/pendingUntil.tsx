// A story that settles after its first paint (a dialog that opens once its data loads, a
// menu opened by a script, a section that suspends) stays data-story-pending until
// `selector` is in the document and has stayed there for one more frame. The visual and
// a11y checks wait for that before they capture, so a busy runner never captures the
// half-drawn story (ci-speed: four workers per runner).
import { useEffect, useState } from 'react'

export function PendingUntil({ selector }: { selector: string }) {
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    let frame = 0
    let seen = false
    const look = () => {
      const found = !!document.querySelector(selector)
      if (found && seen) return setSettled(true)
      seen = found
      frame = requestAnimationFrame(look)
    }
    frame = requestAnimationFrame(look)
    return () => cancelAnimationFrame(frame)
  }, [selector])
  return settled ? null : <span data-story-pending />
}
