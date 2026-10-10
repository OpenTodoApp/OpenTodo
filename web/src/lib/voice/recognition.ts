// Browser speech recognition wrapper (OpenSpec `voice-capture`, D1).
//
// The Web Speech API returns text only: this module never touches audio, opens no
// connection and sends nothing anywhere. Whether the *browser* sends audio to its
// vendor's service depends on the engine; on-device processing is requested when the
// engine says it is available for the language, and otherwise the engine's default
// applies (the user accepted that when enabling voice capture).

/** The slice of `SpeechRecognition` we use; declared here because DOM typings vary. */
export interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  processLocally?: boolean
  onstart: (() => void) | null
  onresult: ((e: { resultIndex?: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string; message?: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

export interface SpeechRecognitionCtor {
  new (): SpeechRecognitionLike
  /** Chromium 139+: whether recognition for the languages can run (on device with `processLocally`). */
  available?: (opts: { langs: string[]; processLocally: boolean }) => Promise<string>
}

/** Why a session ended early; `no-speech` and `aborted` are quiet. */
export type VoiceErrorKind = 'denied' | 'no-speech' | 'aborted' | 'unavailable' | 'no-microphone' | 'language'

export interface RecognitionCallbacks {
  onStart?: () => void
  /** Text recognised so far: the settled part and the part still changing. */
  onResult: (r: { final: string; interim: string }) => void
  onError: (kind: VoiceErrorKind, raw: string) => void
  /** Always called once when the session is over, after any error. */
  onEnd: () => void
}

export interface RecognitionSession {
  /** Stop listening; recognised words are still delivered before `onEnd`. */
  stop(): void
  /** Whether on-device recognition was requested for this session. */
  readonly local: boolean
}

type Win = { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }

/** The engine's constructor, standard or prefixed, or null (Firefox, old browsers, tests). */
export function recognitionConstructor(win: unknown = globalThis): SpeechRecognitionCtor | null {
  const w = win as Win | undefined
  return w?.SpeechRecognition ?? w?.webkitSpeechRecognition ?? null
}

export function isSupported(win: unknown = globalThis): boolean {
  return recognitionConstructor(win) !== null
}

export function errorKind(code: string): VoiceErrorKind {
  switch (code) {
    case 'not-allowed':
      return 'denied'
    case 'no-speech':
      return 'no-speech'
    case 'aborted':
      return 'aborted'
    case 'audio-capture':
      return 'no-microphone'
    case 'language-not-supported':
      return 'language'
    default:
      // network, service-not-allowed, bad-grammar, anything new
      return 'unavailable'
  }
}

/** Joins recognised segments ("call the dentist" + "tomorrow") with single spaces. */
function join(parts: string[]): string {
  return parts.map((p) => p.trim()).filter(Boolean).join(' ')
}

async function localAvailable(ctor: SpeechRecognitionCtor, lang: string | undefined): Promise<boolean> {
  if (!lang || typeof ctor.available !== 'function') return false
  try {
    return (await ctor.available({ langs: [lang], processLocally: true })) === 'available'
  } catch {
    return false
  }
}

/**
 * Start one dictation: single utterance (`continuous: false`, so the engine stops on
 * silence), interim results on, one alternative. `lang` undefined means the
 * browser's default language. Errors arrive through `onError`, never as throws.
 */
export function startRecognition(opts: { lang?: string } & RecognitionCallbacks, win: unknown = globalThis): RecognitionSession {
  const ctor = recognitionConstructor(win)
  let rec: SpeechRecognitionLike | null = null
  let stopped = false
  let ended = false
  let errored = false
  const session = { local: false, stop: () => undefined as void }
  const end = () => {
    if (ended) return
    ended = true
    opts.onEnd()
  }
  const fail = (kind: VoiceErrorKind, raw: string) => {
    if (errored) return
    errored = true
    opts.onError(kind, raw)
  }
  session.stop = () => {
    stopped = true
    if (rec) {
      try {
        rec.stop()
      } catch {
        end()
      }
    } else end()
  }
  if (!ctor) {
    fail('unavailable', 'unsupported')
    end()
    return session
  }
  void localAvailable(ctor, opts.lang).then((local) => {
    if (stopped) return
    try {
      const r = new ctor()
      rec = r
      if (opts.lang) r.lang = opts.lang
      r.continuous = false
      r.interimResults = true
      r.maxAlternatives = 1
      if (local && 'processLocally' in r) {
        r.processLocally = true
        session.local = true
      }
      r.onstart = () => opts.onStart?.()
      r.onresult = (e) => {
        const final: string[] = []
        const interim: string[] = []
        for (let i = 0; i < e.results.length; i++) {
          const res = e.results[i]
          const text = res[0]?.transcript ?? ''
          ;(res.isFinal ? final : interim).push(text)
        }
        opts.onResult({ final: join(final), interim: join(interim) })
      }
      r.onerror = (e) => fail(errorKind(e.error), e.error)
      r.onend = end
      r.start()
    } catch (err) {
      fail('unavailable', err instanceof Error ? err.name : String(err))
      end()
    }
  })
  return session
}
