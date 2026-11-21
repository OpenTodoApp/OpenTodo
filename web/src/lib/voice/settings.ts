// Per-device voice capture preferences (OpenSpec `voice-capture`, D4/D5). Stored only
// in this browser's localStorage, like the quick-add parsing settings: never an op,
// never synced, so turning dictation on for a phone does not turn it on elsewhere.
import { VOCABULARIES } from '../nlp/vocab'
import { createStoredValue, jsonCodec } from '../deviceStorage'

export interface VoiceSettings {
  /** Off by default; switched on only after the privacy statement was confirmed. */
  enabled: boolean
  /** Recognition language override (a bundled quick-add language), or null to follow quick add. */
  lang: string | null
  /**
   * Who recognises speech (settings-refresh D7): this browser (default), or the
   * server's speech service when the owner connected one. Each choice is
   * confirmed after its own statement.
   */
  recognizer: Recognizer
}

export type Recognizer = 'browser' | 'server'

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = { enabled: false, lang: null, recognizer: 'browser' }

const stored = createStoredValue('opentodo.voice', jsonCodec<VoiceSettings>(DEFAULT_VOICE_SETTINGS, (raw) => {
  if (raw === null || typeof raw !== 'object') return null
  const v = raw as Partial<VoiceSettings>
  return {
    enabled: v.enabled === true,
    lang: typeof v.lang === 'string' && v.lang in VOCABULARIES ? v.lang : null,
    recognizer: v.recognizer === 'server' ? 'server' : 'browser',
  }
}), { crossTab: true })

export const loadVoiceSettings: () => VoiceSettings = stored.get

/** Stores the settings on this device (a per-device convenience only). */
export const saveVoiceSettings: (s: VoiceSettings) => void = stored.set

/** Call `fn` whenever the settings change in this tab or another tab. */
export const onVoiceSettingsChange: (fn: () => void) => () => void = stored.subscribe

/** Region used when the browser's own languages name none for the chosen language. */
const DEFAULT_REGION: Record<string, string> = { en: 'en-US', de: 'de-DE', fr: 'fr-FR', it: 'it-IT', es: 'es-ES', pt: 'pt-BR' }

/** Primary subtag of the recognition language: the override, else the first quick-add language. */
export function recognitionLanguage(s: Pick<VoiceSettings, 'lang'> & Partial<VoiceSettings>, quickAddLanguages: readonly string[]): string {
  return s.lang ?? quickAddLanguages[0] ?? 'en'
}

/**
 * BCP 47 tag handed to the engine: the browser's own regional tag for that language
 * when it has one ("de-AT" stays Austrian), else a default region.
 */
export function recognitionTag(code: string, browser: readonly string[]): string {
  const own = browser.find((t) => {
    const [lang, region] = t.split(/[-_]/)
    return lang.toLowerCase() === code && !!region
  })
  return own ? own.replace('_', '-') : DEFAULT_REGION[code] ?? code
}
