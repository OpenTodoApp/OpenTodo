// Dictation state machine for quick add (OpenSpec `voice-capture`, D2 and error
// handling). Framework-free so it can be unit tested: the host gives access to the
// input's text and caret, and receives view updates. The transcript only ever
// becomes input text; saving stays the quick-add Enter handler.
import { type RecognitionCallbacks, type RecognitionSession, startRecognition, type VoiceErrorKind } from './recognition'
import { t } from '../i18n'
import { resettable } from '../moduleState'

export type DictationStatus = 'idle' | 'starting' | 'listening'

export interface DictationView {
  status: DictationStatus
  /** Text for the polite live region ("Listening", "Stopped", or the message). */
  announcement: string
  /** Visible, non-blocking message after an error or a language fallback. */
  message: string | null
}

export interface DictationHost {
  getValue(): string
  getSelection(): { start: number; end: number }
  /** Replace the input text (through the normal change path) and put the caret at `caret`. */
  setValue(value: string, caret: number): void
  /** Spoken-token normalisation for the final transcript. */
  normalize(text: string): string
  /** BCP 47 recognition language, or undefined for the browser default. */
  lang(): string | undefined
  /** Human name of a language tag for the fallback notice ("Italian"). */
  languageName?(tag: string): string
  update(view: DictationView): void
}

export type Recognizer = (opts: { lang?: string } & RecognitionCallbacks) => RecognitionSession

export const MESSAGES = {
  get denied() { return t('Microphone access is blocked. Allow the microphone for this site in your browser’s site settings (usually the icon next to the address), then try again.') },
  get unavailable() { return t('Voice capture is unavailable right now. Typing works as usual.') },
  get noMicrophone() { return t('No microphone was found. Connect one, or keep typing.') },
  get service() { return t('The speech service did not answer. Try again, or keep typing.') },
  language: (name: string) => t('This browser cannot recognise {name}; listening in the browser’s default language instead.', { name }),
}

/** Tags the engine rejected this session; the fallback notice is shown once per tag. */
const unsupportedTags = new Set<string>()

/** For tests. */
export function resetLanguageFallbacks(): void {
  unsupportedTags.clear()
}
resettable('dictation', resetLanguageFallbacks)

/** Insert `text` between `prefix` and `suffix` with single spaces; the caret goes right after it. */
export function insertTranscript(prefix: string, text: string, suffix: string): { value: string; caret: number } {
  if (!text) return { value: prefix + suffix, caret: prefix.length }
  const before = prefix && !/\s$/.test(prefix) ? `${prefix} ` : prefix
  const after = suffix && !/^\s/.test(suffix) ? ` ${suffix}` : suffix
  return { value: before + text + after, caret: before.length + text.length }
}

export interface Dictation {
  start(): void
  stop(): void
  toggle(): void
  dismissMessage(): void
  readonly status: DictationStatus
  dispose(): void
}

export function createDictation(host: DictationHost, recognize: Recognizer = startRecognition): Dictation {
  let view: DictationView = { status: 'idle', announcement: '', message: null }
  let session: RecognitionSession | null = null
  let disposed = false

  const set = (patch: Partial<DictationView>) => {
    view = { ...view, ...patch }
    if (!disposed) host.update(view)
  }

  function begin(langOverride?: string | null) {
    const original = host.getValue()
    const sel = host.getSelection()
    const prefix = original.slice(0, sel.start)
    const suffix = original.slice(sel.end)
    const wanted = langOverride === null ? undefined : langOverride ?? host.lang()
    const lang = wanted && unsupportedTags.has(wanted) ? undefined : wanted
    let final = ''
    let touched = false
    let error: VoiceErrorKind | null = null
    set({ status: 'starting', message: view.message && langOverride === null ? view.message : null, announcement: '' })
    session = recognize({
      lang,
      onStart: () => set({ status: 'listening', announcement: 'Listening' }),
      onResult: (r) => {
        final = r.final
        const live = [r.final, r.interim].filter(Boolean).join(' ')
        const { value, caret } = insertTranscript(prefix, live, suffix)
        touched = true
        host.setValue(value, caret)
        if (view.status !== 'listening') set({ status: 'listening', announcement: 'Listening' })
      },
      onError: (kind) => {
        error = kind
      },
      onEnd: () => {
        session = null
        if (final) {
          const { value, caret } = insertTranscript(prefix, host.normalize(final), suffix)
          host.setValue(value, caret)
        } else if (touched) {
          // Only interim words were heard: put the line back as it was.
          host.setValue(original, sel.end)
        }
        if (error === 'language' && lang && !disposed) {
          unsupportedTags.add(lang)
          set({ message: MESSAGES.language(host.languageName?.(lang) ?? lang) })
          begin(null)
          return
        }
        // no-speech and aborted stop quietly; the input text is never cleared.
        const failure =
          error === 'denied' ? MESSAGES.denied
          : error === 'no-microphone' ? MESSAGES.noMicrophone
          : error === 'service' ? MESSAGES.service
          : error === 'unavailable' || error === 'language' ? MESSAGES.unavailable
          : null
        // A language fallback notice stays visible through the retried session.
        const message = failure ?? (langOverride === null ? view.message : null)
        set({ status: 'idle', message, announcement: failure ?? 'Stopped' })
      },
    })
  }

  return {
    start() {
      if (session || disposed) return
      begin()
    },
    stop() {
      session?.stop()
    },
    toggle() {
      if (session) session.stop()
      else if (!disposed) begin()
    },
    dismissMessage() {
      set({ message: null })
    },
    get status() {
      return view.status
    },
    dispose() {
      disposed = true
      session?.stop()
      session = null
    },
  }
}
