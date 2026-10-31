// The plugin's own strings in the six languages the web app ships, following
// Obsidian's interface language (obsidian-plugin task 6.1). A message is its
// English text, as in the web app: tr('Send line to OpenTodo'). The catalogues
// in obsidian/locales/ map it to the translation; `make i18n-check` checks that
// every tr() message has an entry in each with the same placeholders
// (scripts/i18n/obsidian.mjs). Messages use the web app's formatter, so
// plurals work: tr('{n, plural, one {# task} other {# tasks}} waiting', { n }).
import { formatMessage } from '../../web/src/lib/i18n/format'
import de from '../locales/de.json'
import en from '../locales/en.json'
import es from '../locales/es.json'
import fr from '../locales/fr.json'
import it from '../locales/it.json'
import pt from '../locales/pt.json'

export const LANGUAGES = ['en', 'de', 'fr', 'es', 'it', 'pt'] as const
export type Language = (typeof LANGUAGES)[number]

const CATALOGS: Record<Language, Record<string, string>> = { en, de, fr, es, it, pt }

let language: Language = 'en'

/** Obsidian's language code ("de", "pt-BR", "zh-TW") to a shipped language, else English. */
export function pickLanguage(code: string | undefined | null): Language {
  const base = (code ?? '').toLowerCase().split(/[-_]/)[0]
  return (LANGUAGES as readonly string[]).includes(base) ? (base as Language) : 'en'
}

export function setLanguage(code: string | undefined | null): void {
  language = pickLanguage(code)
}

export function currentLanguage(): Language {
  return language
}

export function tr(message: string, values: Record<string, string | number> = {}): string {
  const text = CATALOGS[language][message] ?? message
  return formatMessage(text, values, language)
}
