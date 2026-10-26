// The end-of-session tone (OpenSpec change focus-mode, design D11): two short sine
// notes generated with the Web Audio API, no audio file and no network. The
// context is created on the first Start (a user gesture, so autoplay rules allow
// it); when audio is unavailable or refused the tone is skipped silently.
import { resettable } from '../moduleState'

type Ctor = new () => AudioContext

let ctx: AudioContext | null = null

function audioCtor(): Ctor | null {
  const w = globalThis as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

/** Creates (or wakes) the audio context; called from the Start click. */
export function primeTone(): void {
  try {
    if (!ctx) {
      const C = audioCtor()
      if (!C) return
      ctx = new C()
    }
    void ctx.resume?.().catch(() => undefined)
  } catch {
    ctx = null
  }
}

/** Plays 660 Hz then 880 Hz, 120 ms each with a 20 ms ramp, at gain 0.2. Returns whether it played. */
export async function playTone(): Promise<boolean> {
  try {
    if (!ctx) primeTone()
    const c = ctx
    if (!c) return false
    if (c.state === 'suspended') await c.resume()
    const gain = c.createGain()
    gain.connect(c.destination)
    const t0 = c.currentTime
    ;[660, 880].forEach((hz, i) => {
      const at = t0 + i * 0.14
      const osc = c.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = hz
      osc.connect(gain)
      gain.gain.setValueAtTime(0, at)
      gain.gain.linearRampToValueAtTime(0.2, at + 0.02)
      gain.gain.setValueAtTime(0.2, at + 0.1)
      gain.gain.linearRampToValueAtTime(0, at + 0.12)
      osc.start(at)
      osc.stop(at + 0.12)
    })
    return true
  } catch {
    return false
  }
}

/** Forgets the context (tests). */
export function resetTone(): void {
  ctx = null
}
resettable('focusTone', resetTone)
