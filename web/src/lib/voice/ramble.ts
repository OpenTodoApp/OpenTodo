// Long dictation into the assistant composer (OpenSpec change voice-ramble,
// design D2; voice-capture "Long dictation into the assistant composer"). The
// same recognisers as quick add in a continuous mode: the browser's recogniser
// restarted across its own segment ends, or the server's speech service fed in
// pieces cut at pauses and at 55 seconds, sent in order to the existing
// transcription route. A ramble stops on the button, Escape, 8 seconds of
// silence or 5 minutes. The text is never normalised into quick-add tokens: the
// model reads natural language. Nothing is stored; the text only goes to the
// composer's field. Loaded with the voice engine chunk.
import { api, ApiError } from '../api'
import { t } from '../i18n'
import { MESSAGES } from './dictation'
import { errorKind, join, localAvailable, type RecognitionCallbacks, type RecognitionSession, type SpeechRecognitionLike, type VoiceErrorKind } from './recognition'
import { recordingType, transcribeError } from './serverRecognition'
import { recognitionConstructor } from './support'

/** Longest ramble, silence that ends it, and the longest piece sent to the server's service. */
export const RAMBLE_MAX_MS = 5 * 60_000
export const RAMBLE_SILENCE_MS = 8_000
export const PIECE_MAX_MS = 55_000

/** A recogniser in long mode: like a quick-add one, plus a signal that the person is speaking. */
export type LongRecognizer = (opts: { lang?: string; onActivity?: () => void } & RecognitionCallbacks) => RecognitionSession

// ------------------------------------------------------------------ browser

/**
 * Continuous browser recognition: `continuous = true`, and a new session when
 * the browser ends one on its own (most engines stop after a minute or a
 * pause), keeping what was already recognised. `no-speech` restarts quietly.
 */
export function startLongRecognition(opts: { lang?: string; onActivity?: () => void } & RecognitionCallbacks, win: unknown = globalThis): RecognitionSession {
  const ctor = recognitionConstructor(win)
  let rec: SpeechRecognitionLike | null = null
  let stopped = false
  let ended = false
  let failed = false
  let settled: string[] = [] // finals of earlier sessions
  let restarts = 0
  const session = { local: false, stop: () => undefined as void }
  const end = () => {
    if (ended) return
    ended = true
    opts.onEnd()
  }
  session.stop = () => {
    stopped = true
    if (rec) {
      try { rec.stop() } catch { end() }
    } else end()
  }
  if (!ctor) {
    opts.onError('unavailable', 'unsupported')
    end()
    return session
  }
  const begin = (local: boolean) => {
    let finals: string[] = []
    try {
      const r = new ctor()
      rec = r
      if (opts.lang) r.lang = opts.lang
      r.continuous = true
      r.interimResults = true
      r.maxAlternatives = 1
      if (local && 'processLocally' in r) {
        r.processLocally = true
        session.local = true
      }
      r.onstart = () => { if (restarts === 0) opts.onStart?.() }
      r.onresult = (e) => {
        const final: string[] = []
        const interim: string[] = []
        for (let i = 0; i < e.results.length; i++) {
          const res = e.results[i]
          ;(res.isFinal ? final : interim).push(res[0]?.transcript ?? '')
        }
        finals = final
        opts.onActivity?.()
        opts.onResult({ final: join([...settled, ...final]), interim: join(interim) })
      }
      r.onerror = (e) => {
        if (e.error === 'no-speech' || (e.error === 'aborted' && stopped)) return
        failed = true
        opts.onError(errorKind(e.error), e.error)
      }
      r.onend = () => {
        settled = [...settled, ...finals]
        rec = null
        // The browser ended a segment: listen on, unless stopped or failed.
        if (!stopped && !failed && restarts < 200) {
          restarts++
          begin(local)
          return
        }
        end()
      }
      r.start()
    } catch (err) {
      opts.onError('unavailable', err instanceof Error ? err.name : String(err))
      end()
    }
  }
  void localAvailable(ctor, opts.lang).then((local) => { if (!stopped) begin(local); else end() })
  return session
}

// ------------------------------------------------------------------ server

interface RecorderLike {
  state: string
  mimeType: string
  ondataavailable: ((e: { data: Blob }) => void) | null
  onstop: (() => void) | null
  start(): void
  stop(): void
}
type RecorderCtor = (new (stream: MediaStream, opts?: { mimeType?: string }) => RecorderLike) & { isTypeSupported?: (t: string) => boolean }

/** How loud the microphone is right now (0–1), or null when the browser cannot tell. */
export type LevelMeter = () => number | null

/** A level meter over the stream with the Web Audio API, or null without it. */
function audioMeter(win: unknown, stream: MediaStream): { level: LevelMeter; close: () => void } | null {
  const w = win as { AudioContext?: new () => AudioContext; webkitAudioContext?: new () => AudioContext }
  const Ctx = w.AudioContext ?? w.webkitAudioContext
  if (!Ctx) return null
  try {
    const ctx = new Ctx()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    ctx.createMediaStreamSource(stream).connect(analyser)
    const buf = new Float32Array(analyser.fftSize)
    return {
      level: () => {
        analyser.getFloatTimeDomainData(buf)
        let sum = 0
        for (const v of buf) sum += v * v
        return Math.sqrt(sum / buf.length)
      },
      close: () => { void ctx.close().catch(() => {}) },
    }
  } catch {
    return null
  }
}

export interface PieceTiming {
  /** A piece is cut at this length at the latest. */
  pieceMs: number
  /** A pause this long cuts a piece once it is at least minPieceMs long. */
  pauseMs: number
  minPieceMs: number
  /** How often the level is read. */
  tickMs: number
  /** RMS level above which the person is speaking. */
  threshold: number
}

export const PIECE_TIMING: PieceTiming = { pieceMs: PIECE_MAX_MS, pauseMs: 900, minPieceMs: 10_000, tickMs: 100, threshold: 0.02 }

/**
 * The server's speech service in pieces: one recording cut at pauses and at
 * 55 s, each piece a complete file sent to POST /api/v1/voice/transcribe one
 * after another (within that route's 60 s / 5 MB and its rate limit), their text
 * joined in order. A failed piece keeps the text so far, stops listening and
 * reports the error; nothing is retried silently.
 */
export function startServerPieces(
  opts: { lang?: string; onActivity?: () => void } & RecognitionCallbacks,
  win: unknown = globalThis,
  transcribe: (piece: Blob, language: string, seconds: number) => Promise<{ text: string }> = api.transcribe,
  timing: PieceTiming = PIECE_TIMING,
  meter?: (stream: MediaStream) => { level: LevelMeter; close: () => void } | null,
): RecognitionSession {
  const w = win as { MediaRecorder?: RecorderCtor; navigator?: Navigator }
  let stream: MediaStream | null = null
  let recorder: RecorderLike | null = null
  let stopped = false
  let failed = false
  let ended = false
  let pending = 0
  let chain: Promise<void> = Promise.resolve()
  const texts: string[] = []
  let ticker: ReturnType<typeof setInterval> | undefined
  let cutTimer: ReturnType<typeof setTimeout> | undefined
  let levels: { level: LevelMeter; close: () => void } | null = null
  const language = (opts.lang ?? 'en').split('-')[0].toLowerCase()
  const finish = () => {
    if (ended || pending > 0 || (recorder && recorder.state === 'recording')) return
    ended = true
    clearInterval(ticker)
    clearTimeout(cutTimer)
    levels?.close()
    stream?.getTracks().forEach((tr) => tr.stop())
    opts.onEnd()
  }
  const session: RecognitionSession = {
    local: false,
    stop: () => {
      stopped = true
      if (recorder && recorder.state === 'recording') recorder.stop()
      else finish()
    },
  }
  const Ctor = w.MediaRecorder
  const media = w.navigator?.mediaDevices
  if (!Ctor || !media?.getUserMedia) {
    opts.onError('unavailable', 'unsupported')
    ended = true
    opts.onEnd()
    return session
  }
  const send = (piece: Blob, seconds: number) => {
    pending++
    chain = chain.then(async () => {
      if (failed) return
      try {
        const { text } = await transcribe(piece, language, seconds)
        if (text) texts.push(text)
        opts.onResult({ final: join(texts), interim: '' })
      } catch (err) {
        failed = true
        stopped = true
        opts.onError(transcribeError(err), err instanceof ApiError ? err.code : 'network')
        if (recorder && recorder.state === 'recording') recorder.stop()
      }
    }).finally(() => {
      pending--
      finish()
    })
  }
  const record = (type: string) => {
    if (!stream) return
    const rec = new Ctor(stream, type ? { mimeType: type } : undefined)
    recorder = rec
    const chunks: Blob[] = []
    const startedAt = Date.now()
    let spoke = levels === null // without a meter every piece is sent
    let lastLoud = startedAt
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
    rec.onstop = () => {
      clearTimeout(cutTimer)
      const piece = new Blob(chunks, { type: (rec.mimeType || type || 'audio/webm').split(';')[0] })
      if (piece.size && spoke && !failed) send(piece, (Date.now() - startedAt) / 1000)
      if (!stopped && !failed) record(type)
      else finish()
    }
    const cut = () => { if (rec.state === 'recording') rec.stop() }
    clearInterval(ticker)
    if (levels) {
      const meterOf = levels
      ticker = setInterval(() => {
        const v = meterOf.level()
        const now = Date.now()
        if (v !== null && v > timing.threshold) {
          spoke = true
          lastLoud = now
          opts.onActivity?.()
        } else if (spoke && now - startedAt >= timing.minPieceMs && now - lastLoud >= timing.pauseMs) cut()
      }, timing.tickMs)
    }
    cutTimer = setTimeout(cut, timing.pieceMs)
    rec.start()
  }
  void media.getUserMedia({ audio: true }).then((s) => {
    stream = s
    if (stopped) { finish(); return }
    levels = (meter ?? ((st) => audioMeter(win, st)))(s)
    record(recordingType(Ctor))
    opts.onStart?.()
  }, (err: { name?: string }) => {
    opts.onError(err?.name === 'NotAllowedError' ? 'denied' : err?.name === 'NotFoundError' ? 'no-microphone' : 'unavailable', err?.name ?? 'error')
    ended = true
    opts.onEnd()
  })
  return session
}

// ------------------------------------------------------------------ the ramble

export type RambleStatus = 'idle' | 'starting' | 'listening'

export interface RambleView {
  status: RambleStatus
  /** Time listened so far, for "1:24 / 5:00". */
  elapsedMs: number
  /** Polite live region: "Listening", "Stopped" or the message. */
  announcement: string
  /** Visible message after the limit or an error. */
  message: string | null
}

export interface RambleHost {
  getValue(): string
  /** Replace the field's text; the caret goes to its end. */
  setValue(value: string): void
  lang(): string | undefined
  update(view: RambleView): void
}

export interface Clock {
  now(): number
  setInterval(fn: () => void, ms: number): ReturnType<typeof setInterval>
  clearInterval(id: ReturnType<typeof setInterval>): void
}

const realClock: Clock = { now: () => Date.now(), setInterval: (fn, ms) => setInterval(fn, ms), clearInterval: (id) => clearInterval(id) }

export const RAMBLE_MESSAGES = {
  get limit() { return t('Stopped at 5:00, the longest recording. The text so far is in the field.') },
  get rateLimited() { return t('The speech service’s limit was reached. The text so far is in the field; try again in a minute.') },
}

/** "1:24 / 5:00". */
export function elapsedLabel(ms: number): string {
  const s = Math.min(Math.floor(ms / 1000), RAMBLE_MAX_MS / 1000)
  const mm = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`
  return `${mm(s)} / ${mm(RAMBLE_MAX_MS / 1000)}`
}

/** Append a transcript to what the field held before listening started. */
export function appendTranscript(before: string, text: string): string {
  if (!text) return before
  if (!before.trim()) return text
  return /\s$/.test(before) ? before + text : `${before} ${text}`
}

export interface Ramble {
  start(): void
  stop(): void
  toggle(): void
  readonly status: RambleStatus
  dispose(): void
}

export function createRamble(host: RambleHost, recognize: LongRecognizer, clock: Clock = realClock): Ramble {
  let view: RambleView = { status: 'idle', elapsedMs: 0, announcement: '', message: null }
  let session: RecognitionSession | null = null
  let disposed = false
  const set = (patch: Partial<RambleView>) => {
    view = { ...view, ...patch }
    if (!disposed) host.update(view)
  }
  function begin() {
    const before = host.getValue()
    const startedAt = clock.now()
    let lastActivity = startedAt
    let spoke = false
    let reason: 'limit' | null = null
    let error: { kind: VoiceErrorKind; raw: string } | null = null
    let text = ''
    set({ status: 'starting', elapsedMs: 0, message: null, announcement: '' })
    const tick = clock.setInterval(() => {
      const now = clock.now()
      set({ elapsedMs: now - startedAt })
      if (now - startedAt >= RAMBLE_MAX_MS) { reason = 'limit'; session?.stop() }
      else if (spoke && now - lastActivity >= RAMBLE_SILENCE_MS) session?.stop()
    }, 250)
    session = recognize({
      lang: host.lang(),
      onStart: () => set({ status: 'listening', announcement: 'Listening' }),
      onActivity: () => { spoke = true; lastActivity = clock.now() },
      onResult: (r) => {
        text = [r.final, r.interim].filter(Boolean).join(' ')
        host.setValue(appendTranscript(before, text))
        if (view.status !== 'listening') set({ status: 'listening', announcement: 'Listening' })
      },
      onError: (kind, raw) => { if (!error) error = { kind, raw } },
      onEnd: () => {
        session = null
        clock.clearInterval(tick)
        const err = error as { kind: VoiceErrorKind; raw: string } | null
        const failure = !err || err.kind === 'no-speech' || err.kind === 'aborted' ? null
          : err.raw === 'rate_limited' ? RAMBLE_MESSAGES.rateLimited
          : err.kind === 'denied' ? MESSAGES.denied
          : err.kind === 'no-microphone' ? MESSAGES.noMicrophone
          : err.kind === 'service' ? MESSAGES.service
          : MESSAGES.unavailable
        const message = failure ?? (reason === 'limit' ? RAMBLE_MESSAGES.limit : null)
        set({ status: 'idle', message, announcement: failure ?? 'Stopped' })
      },
    })
  }
  return {
    start() { if (!session && !disposed) begin() },
    stop() { session?.stop() },
    toggle() { if (session) session.stop(); else if (!disposed) begin() },
    get status() { return view.status },
    dispose() {
      disposed = true
      session?.stop()
      session = null
    },
  }
}
