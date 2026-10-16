// Per-device voice capture preferences (OpenSpec `voice-capture`, D4/D5). Stored only
// in this browser's localStorage, like the quick-add parsing settings: never an op,
// never synced, so turning dictation on for a phone does not turn it on elsewhere.
import { VOCABULARIES } from '../nlp/vocab'

export interface VoiceSettings {
  /** Off by default; switched on only after the privacy statement was confirmed. */
  enabled: boolean
  /** Recognition language override (a bundled quick-add language), or null to follow quick add. */
  lang: string | null
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = { enabled: false, lang: null }

const KEY = 'opentodo.voice'
const EVENT = 'opentodo:voice-settings'

export function loadVoiceSettings(): VoiceSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_VOICE_SETTINGS }
    const v = JSON.parse(raw) as Partial<VoiceSettings>
    return {
      enabled: v.enabled === true,
      lang: typeof v.lang === 'string' && v.lang in VOCABULARIES ? v.lang : null,
    }
  } catch {
    return { ...DEFAULT_VOICE_SETTINGS }
  }
}

export function saveVoiceSettings(s: VoiceSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // Per-device convenience only.
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT))
}

/** Call `fn` whenever the settings change in this tab or another tab. */
export function onVoiceSettingsChange(fn: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) fn()
  }
  window.addEventListener(EVENT, fn)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(EVENT, fn)
    window.removeEventListener('storage', onStorage)
  }
}

/** Region used when the browser's own languages name none for the chosen language. */
const DEFAULT_REGION: Record<string, string> = { en: 'en-US', de: 'de-DE', fr: 'fr-FR', it: 'it-IT', es: 'es-ES', pt: 'pt-BR' }

/** Primary subtag of the recognition language: the override, else the first quick-add language. */
export function recognitionLanguage(s: VoiceSettings, quickAddLanguages: readonly string[]): string {
  return s.lang ?? quickAddLanguages[0] ?? 'en'
}

/**
 * BCP 47 tag handed to the engine: the browser's own regional tag for that language
 * when it has one ("de-AT" stays Austrian), else a default region.
 */
export function recognitionTag(code: string, browser: readonly string[]): string {
  const own = browser.find((item) => {
    const [lang, region] = item.split(/[-_]/)
    return lang.toLowerCase() === code && !!region
  })
  return own ? own.replace('_', '-') : DEFAULT_REGION[code] ?? code
}
