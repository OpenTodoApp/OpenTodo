// Background noise for work sessions (OpenSpec change focus-everywhere, design
// D6): white, pink or brown noise generated on the device with Web Audio, never a
// file and never the network. Two seconds of samples in an AudioBuffer loop
// through a GainNode that fades in and out over 300 ms. Loaded lazily by the
// timer controller only while a noise is chosen. When the browser refuses audio
// before an interaction (a reload), playing waits for the next pointer or key
// event in the page and starts then, without a prompt.
import { resettable } from '../moduleState'

export type NoiseKind = 'white' | 'pink' | 'brown'

type Ctor = new () => AudioContext

const SECONDS = 2
const FADE_S = 0.3

function audioCtor(): Ctor | null {
  const w = globalThis as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

/** `n` samples of noise in [-1, 1] (white: uniform; pink: Paul Kellet's filter; brown: integrated white). */
export function noiseSamples(kind: NoiseKind, n: number, random: () => number = Math.random): Float32Array {
  const out = new Float32Array(n)
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0
  for (let i = 0; i < n; i++) {
    const white = random() * 2 - 1
    if (kind === 'white') out[i] = white
    else if (kind === 'pink') {
      b0 = 0.99886 * b0 + white * 0.0555179
      b1 = 0.99332 * b1 + white * 0.0750759
      b2 = 0.969 * b2 + white * 0.153852
      b3 = 0.8665 * b3 + white * 0.3104856
      b4 = 0.55 * b4 + white * 0.5329522
      b5 = -0.7616 * b5 - white * 0.016898
      out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11
      b6 = white * 0.115926
    } else {
      last = (last + 0.02 * white) / 1.02
      out[i] = last * 3.5
    }
    out[i] = Math.max(-1, Math.min(1, out[i]))
  }
  return out
}

interface Playing {
  kind: NoiseKind
  source: AudioBufferSourceNode
  gain: GainNode
}

let ctx: AudioContext | null = null
let playing: Playing | null = null
/** What should play: the kind and volume (0-1), or null for silence. */
let wanted: { kind: NoiseKind; volume: number } | null = null
let waiting = false

function context(): AudioContext | null {
  if (ctx) return ctx
  const C = audioCtor()
  if (!C) return null
  try { ctx = new C() } catch { ctx = null }
  return ctx
}

function fadeOut(p: Playing, c: AudioContext): void {
  const t0 = c.currentTime
  try {
    p.gain.gain.cancelScheduledValues(t0)
    p.gain.gain.setValueAtTime(p.gain.gain.value, t0)
    p.gain.gain.linearRampToValueAtTime(0, t0 + FADE_S)
    p.source.stop(t0 + FADE_S + 0.05)
  } catch {
    // Already stopped.
  }
}

function startNow(c: AudioContext, kind: NoiseKind, volume: number): void {
  const buffer = c.createBuffer(1, Math.floor(c.sampleRate * SECONDS), c.sampleRate)
  buffer.getChannelData(0).set(noiseSamples(kind, buffer.length))
  const source = c.createBufferSource()
  source.buffer = buffer
  source.loop = true
  const gain = c.createGain()
  gain.gain.setValueAtTime(0, c.currentTime)
  gain.gain.linearRampToValueAtTime(volume, c.currentTime + FADE_S)
  source.connect(gain)
  gain.connect(c.destination)
  source.start()
  playing = { kind, source, gain }
}

/** Starts at the next pointer or key event when the browser refused audio. */
function waitForGesture(): void {
  if (waiting || typeof window === 'undefined') return
  waiting = true
  const go = () => {
    window.removeEventListener('pointerdown', go, true)
    window.removeEventListener('keydown', go, true)
    waiting = false
    void apply()
  }
  window.addEventListener('pointerdown', go, true)
  window.addEventListener('keydown', go, true)
}

async function apply(): Promise<void> {
  const w = wanted
  const c = w ? context() : ctx
  if (!c) return
  if (!w) {
    if (playing) fadeOut(playing, c)
    playing = null
    return
  }
  if (playing && playing.kind === w.kind) {
    playing.gain.gain.setTargetAtTime(w.volume, c.currentTime, 0.05)
    return
  }
  if (playing) { fadeOut(playing, c); playing = null }
  if (c.state === 'suspended') {
    try { await c.resume() } catch { /* refused until a gesture */ }
    if (c.state === 'suspended') { waitForGesture(); return }
  }
  if (wanted !== w) return
  try {
    startNow(c, w.kind, w.volume)
  } catch {
    playing = null
  }
}

/** Plays `kind` at `volume` (0-100) or, with null, fades out. Idempotent; a new kind replaces the old one. */
export function setNoise(kind: NoiseKind | null, volume: number): Promise<void> {
  wanted = kind ? { kind, volume: Math.max(0, Math.min(100, volume)) / 100 } : null
  return apply()
}

/** What the work session wants (the timer controller), applied unless a preview plays. */
let session: { kind: NoiseKind | null; volume: number } = { kind: null, volume: 0 }
let preview: ReturnType<typeof setTimeout> | null = null

/** The timer controller's call: noise while a work phase runs, else silence. */
export function setSessionNoise(kind: NoiseKind | null, volume: number): Promise<void> {
  session = { kind, volume }
  return preview ? Promise.resolve() : setNoise(kind, volume)
}

/** Settings' Preview: plays `kind` at `volume` for `ms` (a click, so audio is allowed), then what the session wants again. */
export function previewNoise(kind: NoiseKind, volume: number, ms = 3000): Promise<void> {
  if (preview) clearTimeout(preview)
  preview = setTimeout(() => { preview = null; void setNoise(session.kind, session.volume) }, ms)
  return setNoise(kind, volume)
}

/** Whether noise plays now (tests, the Preview button). */
export function noisePlaying(): NoiseKind | null {
  return playing?.kind ?? null
}

/** Stops at once and forgets the context (tests). */
export function resetNoise(): void {
  try { playing?.source.stop() } catch { /* stopped */ }
  if (preview) clearTimeout(preview)
  preview = null
  session = { kind: null, volume: 0 }
  playing = null
  wanted = null
  ctx = null
}
resettable('focusNoise', resetNoise)
