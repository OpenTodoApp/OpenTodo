// Test double for the Web Speech API (vitest only; not imported by the app).
import type { SpeechRecognitionCtor, SpeechRecognitionLike } from './recognition'

export class FakeRecognition implements SpeechRecognitionLike {
  static instances: FakeRecognition[] = []
  static availability: string | null = null
  static availableCalls: { langs: string[]; processLocally: boolean }[] = []
  /** Error code the next `start()` should produce (e.g. "not-allowed"), asynchronously like a real engine. */
  static failWith: string | null = null

  lang = ''
  continuous = true
  interimResults = false
  maxAlternatives = 5
  processLocally = false
  onstart: (() => void) | null = null
  onresult: SpeechRecognitionLike['onresult'] = null
  onerror: SpeechRecognitionLike['onerror'] = null
  onend: (() => void) | null = null
  started = false
  stopped = false
  private segments: { text: string; final: boolean }[] = []

  constructor() {
    FakeRecognition.instances.push(this)
  }

  start(): void {
    this.started = true
    const fail = FakeRecognition.failWith
    FakeRecognition.failWith = null // one-shot, so a retry can succeed
    queueMicrotask(() => {
      if (fail) {
        this.onerror?.({ error: fail })
        this.onend?.()
      } else this.onstart?.()
    })
  }

  stop(): void {
    this.stopped = true
    // A real engine settles what it heard, then ends.
    if (this.segments.some((s) => !s.final)) this.segments = this.segments.map((s) => ({ ...s, final: true }))
    this.emit()
    this.onend?.()
  }

  abort(): void {
    this.onerror?.({ error: 'aborted' })
    this.onend?.()
  }

  /** Simulate a recognised segment. */
  hear(text: string, final: boolean): void {
    const last = this.segments[this.segments.length - 1]
    if (last && !last.final) last.text = text
    else this.segments.push({ text, final })
    if (final) this.segments[this.segments.length - 1].final = true
    this.emit()
  }

  /** Simulate an error followed by the end of the session. */
  fail(error: string): void {
    this.onerror?.({ error })
    this.onend?.()
  }

  /** Simulate the engine ending on silence. */
  silence(): void {
    this.onend?.()
  }

  private emit(): void {
    if (!this.segments.length) return
    const results = this.segments.map((s) => Object.assign([{ transcript: s.text }], { isFinal: s.final }))
    this.onresult?.({ results })
  }

  static reset(): void {
    FakeRecognition.instances = []
    FakeRecognition.availability = null
    FakeRecognition.availableCalls = []
    FakeRecognition.failWith = null
  }

  static get last(): FakeRecognition {
    return FakeRecognition.instances[FakeRecognition.instances.length - 1]
  }
}

/** A window-like object exposing the fake, optionally with the on-device `available()` probe. */
export function fakeWindow(opts: { prefixed?: boolean; available?: boolean } = {}): Record<string, unknown> {
  const ctor = class extends FakeRecognition {} as unknown as SpeechRecognitionCtor
  if (opts.available) {
    ctor.available = (o) => {
      FakeRecognition.availableCalls.push(o)
      return Promise.resolve(FakeRecognition.availability ?? 'unavailable')
    }
  }
  return opts.prefixed ? { webkitSpeechRecognition: ctor } : { SpeechRecognition: ctor }
}

export const flush = () => new Promise((r) => setTimeout(r, 0))
