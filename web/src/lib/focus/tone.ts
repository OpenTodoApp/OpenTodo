// The end-of-session tone (OpenSpec change focus-mode, design D11): two short sine
// notes generated with the Web Audio API, no audio file and no network. The
// context is created on the first Start (a user gesture, so autoplay rules allow
// it); when audio is unavailable or refused the tone is skipped silently.
import { resettable } from '../moduleState'

type Ctor = new () => AudioContext

let ctx: AudioContext | null = null
let completionBuffer: AudioBuffer | null = null

function audioCtor(): Ctor | null {
  const w = globalThis as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

export function supportsTone(): boolean { return !!audioCtor() }

function note(context: AudioContext, gain: GainNode, hz: number, at: number, peak: number): OscillatorNode {
  const oscillator = context.createOscillator()
  oscillator.type = 'sine'
  oscillator.frequency.value = hz
  oscillator.connect(gain)
  gain.gain.setValueAtTime(0, at)
  gain.gain.linearRampToValueAtTime(peak, at + 0.02)
  gain.gain.setValueAtTime(peak, at + 0.1)
  gain.gain.linearRampToValueAtTime(0, at + 0.12)
  oscillator.start(at)
  oscillator.stop(at + 0.12)
  return oscillator
}

// The 2B demo cue: two rising notes with two short overtones on the second.
const completionLength = 0.239
const completionNotes = [
  { start: 0, length: 0.139, hz: 523.25, attack: 0.008, release: 0.036, decay: 17, level: 0.62 },
  { start: 0.072, length: completionLength - 0.072, hz: 830.608471346744, attack: 0.004, release: 0.038, decay: 15.8, level: 0.95 },
  { start: 0.072, length: 0.073, hz: 2085.0233696990936, attack: 0.002, release: 0.026, decay: 58, level: 0.29 },
  { start: 0.072, length: 0.042, hz: 2725.998541786467, attack: 0.0015, release: 0.026, decay: 115, level: 0.29 * 0.43 },
]

function makeCompletionBuffer(context: AudioContext): AudioBuffer {
  const rate = context.sampleRate
  const buffer = context.createBuffer(1, Math.ceil(rate * completionLength), rate)
  const samples = buffer.getChannelData(0)
  let peak = 0
  for (let frame = 0; frame < samples.length; frame++) {
    let sample = 0
    for (const note of completionNotes) {
      const time = frame / rate - note.start
      if (time < 0 || time >= note.length) continue
      const envelope = Math.min(1, time / note.attack, (note.length - time) / note.release)
      sample += Math.sin(2 * Math.PI * (note.hz * time)) * envelope * note.level * Math.exp(-note.decay * time)
    }
    samples[frame] = sample
    peak = Math.max(peak, Math.abs(sample))
  }
  for (let frame = 0; frame < samples.length; frame++) samples[frame] = samples[frame] * 0.12 / peak
  return buffer
}

/** Feedback from a completed task. If activation did not wake the context, skip this cue. */
export function playCompletionTone(): void {
  const context = ctx
  if (!context || context.state !== 'running') return
  completionBuffer ??= makeCompletionBuffer(context)
  const source = context.createBufferSource()
  source.buffer = completionBuffer
  source.connect(context.destination)
  source.onended = () => source.disconnect()
  source.start()
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

/** Plays 660 Hz then 880 Hz, 120 ms each with a 20 ms ramp, at `peak` (0.2, the Short sound; the Long alert plays louder). Returns whether it played. */
export async function playTone(peak = 0.2): Promise<boolean> {
  try {
    if (!ctx) primeTone()
    const c = ctx
    if (!c) return false
    if (c.state === 'suspended') await c.resume()
    const gain = c.createGain()
    gain.connect(c.destination)
    const t0 = c.currentTime
    note(c, gain, 660, t0, peak)
    note(c, gain, 880, t0 + 0.14, peak)
    return true
  } catch {
    return false
  }
}

/** Forgets the context (tests). */
export function resetTone(): void {
  ctx = null
  completionBuffer = null
}
resettable('focusTone', resetTone)
