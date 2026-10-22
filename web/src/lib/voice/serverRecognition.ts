// Recognition through the server's speech service (OpenSpec change
// settings-refresh, design D7; voice-capture "Privacy contract" and
// "Transcription route"). The microphone records one phrase with MediaRecorder
// (Opus in WebM, or MP4 on Safari) until the user stops it or 60 seconds pass;
// the phrase is sent once to POST /api/v1/voice/transcribe and dropped; the text
// comes back as the final result. Same interface as the browser recogniser, so
// the dictation state machine is unchanged.
import { api, ApiError, isNetworkError } from '../api'
import type { RecognitionCallbacks, RecognitionSession, VoiceErrorKind } from './recognition'

/** Longest phrase, in milliseconds. */
export const MAX_PHRASE_MS = 60_000

const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']

/** The first recording type this browser supports, or '' for its default. */
export function recordingType(rec: { isTypeSupported?: (t: string) => boolean } | undefined): string {
  return TYPES.find((t) => rec?.isTypeSupported?.(t)) ?? ''
}

/** What a failed request means for the dictation: the service did not answer, or the server could not be reached. */
export function transcribeError(err: unknown): VoiceErrorKind {
  return isNetworkError(err) ? 'unavailable' : 'service'
}

interface RecorderLike {
  state: string
  mimeType: string
  ondataavailable: ((e: { data: Blob }) => void) | null
  onstop: (() => void) | null
  start(): void
  stop(): void
}

type RecorderCtor = (new (stream: MediaStream, opts?: { mimeType?: string }) => RecorderLike) & { isTypeSupported?: (t: string) => boolean }

/**
 * Start one phrase. `lang` is a BCP 47 tag; its language subtag goes to the
 * service. `transcribe` is replaceable for tests.
 */
export function startServerRecognition(
  opts: { lang?: string } & RecognitionCallbacks,
  win: unknown = globalThis,
  transcribe: (phrase: Blob, language: string, seconds: number) => Promise<{ text: string }> = api.transcribe,
): RecognitionSession {
  const w = win as { MediaRecorder?: RecorderCtor; navigator?: Navigator }
  let recorder: RecorderLike | null = null
  let stream: MediaStream | null = null
  let stopped = false
  let ended = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const end = () => {
    if (ended) return
    ended = true
    clearTimeout(timer)
    stream?.getTracks().forEach((t) => t.stop())
    opts.onEnd()
  }
  const session: RecognitionSession = {
    local: false,
    stop: () => {
      stopped = true
      if (recorder && recorder.state === 'recording') recorder.stop()
      else if (!recorder) end()
    },
  }
  const Ctor = w.MediaRecorder
  const media = w.navigator?.mediaDevices
  if (!Ctor || !media?.getUserMedia) {
    opts.onError('unavailable', 'unsupported')
    end()
    return session
  }
  void media.getUserMedia({ audio: true }).then((s) => {
    stream = s
    if (stopped) return end()
    const type = recordingType(Ctor)
    const rec = new Ctor(s, type ? { mimeType: type } : undefined)
    recorder = rec
    const chunks: Blob[] = []
    const startedAt = Date.now()
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
    rec.onstop = () => {
      stream?.getTracks().forEach((t) => t.stop())
      const phrase = new Blob(chunks, { type: (rec.mimeType || type || 'audio/webm').split(';')[0] })
      chunks.length = 0
      if (!phrase.size) return end()
      const language = (opts.lang ?? 'en').split('-')[0].toLowerCase()
      transcribe(phrase, language, (Date.now() - startedAt) / 1000)
        .then(({ text }) => { if (text) opts.onResult({ final: text, interim: '' }) })
        .catch((err) => opts.onError(transcribeError(err), err instanceof ApiError ? err.code : 'network'))
        .finally(end)
    }
    rec.start()
    opts.onStart?.()
    timer = setTimeout(() => { if (rec.state === 'recording') rec.stop() }, MAX_PHRASE_MS)
  }, (err: { name?: string }) => {
    opts.onError(err?.name === 'NotAllowedError' ? 'denied' : err?.name === 'NotFoundError' ? 'no-microphone' : 'unavailable', err?.name ?? 'error')
    end()
  })
  return session
}
