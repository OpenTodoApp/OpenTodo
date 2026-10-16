// The message layer (OpenSpec change app-localization, design D2 and D3).
//
// The English source text is the message id: `t('Snooze 10 min')`. English needs
// no catalog; every other shipped language is one JSON file in web/src/locales/
// that Vite turns into its own chunk, loaded only when chosen and precached by the
// service worker like every chunk. One catalog is kept in memory; an entry that is
// missing falls back to the English source text.
//
// Pure helpers in web/src/lib read the module-level catalog, the way the date
// formatters read their snapshot; components re-render through useT() or because
// the LanguageProvider re-renders the tree.
import { createElement, Fragment, type ReactNode } from 'react'
import { SHIPPED, isShipped, type LanguageCode } from '../../locales'
import { compile, formatNumberIn, render, type TagFn, type Values } from './format'

type Catalog = Record<string, string>

// One lazy chunk per catalog (messages.json is the translators' source list, not a catalog).
const loaders = import.meta.glob<{ default: Catalog }>(['../../locales/*.json', '!../../locales/messages.json'])

const loaderFor = (code: string) => loaders[`../../locales/${code}.json`]

let preference = 'system'
let language: LanguageCode = 'en'
let locale = 'en'
let catalog: Catalog = {}
let version = 0
const listeners = new Set<() => void>()

/** The stored preference last applied on this device: 'system' or a shipped code. */
export function currentPreference(): string { return preference }
export function setCurrentPreference(pref: string): void { preference = pref }
/** The language whose catalog is active. */
export function currentLanguage(): LanguageCode { return language }
/** The BCP 47 locale for Intl (the language with the browser's region where it matches). */
export function currentLocale(): string { return locale }
/** Bumped on every language change; React subscribes through useT(). */
export function languageVersion(): number { return version }
export function onLanguageChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

const LANG_KEY = 'opentodo.lang'

/** The last applied language preference on this device (a first-paint convenience, never synced). */
export function mirroredPreference(): string | null {
  try { return localStorage.getItem(LANG_KEY) } catch { return null }
}
export function mirrorPreference(pref: string): void {
  try { localStorage.setItem(LANG_KEY, pref) } catch { /* storage blocked: first paint follows the browser */ }
}

/** Fetches a catalog without applying it. English resolves to an empty catalog. */
export async function fetchCatalog(code: LanguageCode): Promise<Catalog> {
  if (code === 'en') return {}
  const load = loaderFor(code)
  if (!load) throw new Error(`no catalog for ${code}`)
  return (await load()).default
}

/** Makes a catalog active and notifies subscribers; sets the document language. */
export function applyCatalog(code: LanguageCode, intlLocale: string, entries: Catalog): void {
  language = code
  locale = intlLocale
  catalog = entries
  version++
  if (typeof document !== 'undefined') document.documentElement.lang = code
  for (const fn of [...listeners]) fn()
}

/** Loads and applies a language. Rejects (and keeps the current language) when the catalog cannot be fetched. */
export async function loadLanguage(code: LanguageCode, intlLocale: string = code): Promise<void> {
  if (code === language && intlLocale === locale && (code === 'en' || Object.keys(catalog).length)) return
  const entries = await fetchCatalog(code)
  applyCatalog(code, intlLocale, entries)
}

/** The translation of a source message in the active catalog, or the source itself. */
function lookup(message: string, context?: string): string {
  if (language === 'en') return message
  return (context ? catalog[`${message}|${context}`] : undefined) ?? catalog[message] ?? message
}

export type TValues = Values & { context?: string }
/** Values of a rich message: text, numbers, elements, or functions that render a tag's content. */
export type RichValues = Record<string, ReactNode | ((chunks: ReactNode) => ReactNode)>

export interface TFunction {
  /** Translates and formats a message: `t('Delete {name}?', { name })`. */
  (message: string, values?: TValues): string
  /**
   * A message with tags rendered by functions, as one React node:
   * `t.rich('Read the <a>guide</a>', { a: (s) => <a href="/help">{s}</a> })`.
   * Values may be elements too.
   */
  rich(message: string, values?: RichValues): ReactNode
}

export const t: TFunction = Object.assign(
  (message: string, values?: TValues): string => {
    const text = lookup(message, values?.context)
    if (!values && !/[{'<#]/.test(text)) return text
    return render<string>(compile(text), values ?? {}, locale).join('')
  },
  {
    rich(message: string, values: RichValues = {}): ReactNode {
      const text = lookup(message, typeof values.context === 'string' ? values.context : undefined)
      const tags: Record<string, TagFn<ReactNode>> = {}
      for (const [k, v] of Object.entries(values)) {
        if (typeof v === 'function') tags[k] = (children) => (v as (c: ReactNode) => ReactNode)(createElement(Fragment, null, ...children))
      }
      const parts = render<ReactNode>(compile(text), values as Values, locale, tags)
      return createElement(Fragment, null, ...parts.map((p, i) => (typeof p === 'string' ? p : createElement(Fragment, { key: i }, p))))
    },
  },
)

/**
 * Marks a message for extraction without translating it yet, for text defined at
 * module level and translated where it is shown: `const LABEL = msg('Inbox')` and
 * later `t(LABEL)`.
 */
export function msg<S extends string>(message: S): S { return message }

/**
 * A label table defined at module level, read through t() on every access, so it
 * follows the active language: `const LABEL = translatedMap({ on: msg('On'), off: msg('Off') })`.
 */
export function translatedMap<K extends string>(source: Record<K, string>): Record<K, string> {
  const out = {} as Record<K, string>
  for (const k of Object.keys(source) as K[]) Object.defineProperty(out, k, { get: () => t(source[k]), enumerable: true })
  return out
}

/**
 * A list of options defined at module level whose named text fields are read
 * through t() on every access: `translatedList([{ value: 'a', label: msg('All') }], 'label')`.
 */
export function translatedList<T extends object, K extends keyof T>(items: readonly T[], ...keys: K[]): T[] {
  return items.map((item) => {
    const out = { ...item }
    for (const k of keys) {
      const source = item[k]
      if (typeof source === 'string') Object.defineProperty(out, k, { get: () => t(source), enumerable: true })
    }
    return out
  })
}

/** A count or number with the active language's digit grouping. */
export function formatNumber(n: number): string { return formatNumberIn(locale, n) }

export { SHIPPED, isShipped }
export type { LanguageCode }
