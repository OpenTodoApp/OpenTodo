// Feature detection only, kept apart from the recognition engine so the main bundle
// can decide whether to show voice capture without loading it (OpenSpec `voice-capture`).
import type { SpeechRecognitionCtor } from './recognition'

type Win = { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }

/** The engine's constructor, standard or prefixed, or null (Firefox, old browsers, tests). */
export function recognitionConstructor(win: unknown = globalThis): SpeechRecognitionCtor | null {
  const w = win as Win | undefined
  return w?.SpeechRecognition ?? w?.webkitSpeechRecognition ?? null
}

export function isSupported(win: unknown = globalThis): boolean {
  return recognitionConstructor(win) !== null
}
