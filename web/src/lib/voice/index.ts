// Voice capture (OpenSpec change voice-capture): browser speech recognition feeding
// quick add. No dependency, no audio handling, no server involvement.
export { isSupported, recognitionConstructor, startRecognition } from './recognition'
export type { RecognitionSession, SpeechRecognitionCtor, SpeechRecognitionLike, VoiceErrorKind } from './recognition'
export { createDictation, insertTranscript, MESSAGES } from './dictation'
export type { Dictation, DictationHost, DictationStatus, DictationView } from './dictation'
export { normalizeSpoken, SPOKEN_TABLES } from './spoken'
export {
  DEFAULT_VOICE_SETTINGS, loadVoiceSettings, onVoiceSettingsChange, recognitionLanguage, recognitionTag, saveVoiceSettings,
} from './settings'
export type { VoiceSettings } from './settings'
