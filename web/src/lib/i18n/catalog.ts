// Interface translations (OpenSpec `app-localization`, design D2, D3): the
// English source text is the message id; one catalog per language is a Vite
// chunk loaded on demand; a missing entry shows the source text.
import { createElement, Fragment, type ReactNode } from 'react'
import { SHIPPED_LANGUAGES } from '../../locales'
import { formatMessage, formatParts, type Part, type Values } from './format'

type Catalog = Record<string, string>
type Loader = () => Promise<{ default: Catalog }>

let loaders: Record<string, Loader> = Object.fromEntries(
  Object.entries(import.meta.glob<{ default: Catalog }>(['../../locales/*.json', '!../../locales/messages.json'])).map(([path, load]) => [
    path.replace(/^.*\/([\w-]+)\.json$/, '$1'),
    load,
  ]),
)

/** Replaces the catalog loaders (tests). */
export function __setLoaders(next: Record<string, Loader>) {
  loaders = next
}

/** The localStorage key that carries the last applied language to the next first paint. */
export const MIRROR_KEY = 'opentodo.lang'

interface State {
  lang: string
  locale: string
  messages: Catalog
  version: number
}

let state: State = { lang: 'en', locale: 'en', messages: {}, version: 0 }
const listeners = new Set<() => void>()

/** The active catalog language ('en' when none is loaded). */
export const activeLanguage = () => state.lang
/** The active Intl locale. */
export const activeLocale = () => state.locale
/** Bumped on every language change; React consumers subscribe to it. */
export const catalogVersion = () => state.version

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Whether a catalog exists for lang (English always does). */
export function hasCatalog(lang: string): boolean {
  return lang === 'en' || lang in loaders
}

/**
 * Loads and applies a language: the catalog, the <html lang> attribute and the
 * localStorage mirror, then notifies subscribers. A failed load throws and keeps
 * the current language.
 */
export async function loadLanguage(lang: string, locale = lang): Promise<void> {
  let messages: Catalog = {}
  if (lang !== 'en') {
    const load = loaders[lang]
    if (!load) throw new Error(`no catalog for ${lang}`)
    messages = (await load()).default
  }
  state = { lang, locale, messages, version: state.version + 1 }
  if (typeof document !== 'undefined') document.documentElement.lang = locale
  try {
    localStorage.setItem(MIRROR_KEY, JSON.stringify({ lang, locale }))
  } catch {
    // Private mode or blocked storage: the next first paint follows the browser.
  }
  for (const fn of listeners) fn()
}

/** The language applied last on this browser, for the first paint (null when unknown). */
export function mirroredLanguage(): { lang: string; locale: string } | null {
  try {
    const raw = localStorage.getItem(MIRROR_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as { lang?: unknown; locale?: unknown }
    if (typeof v.lang !== 'string' || typeof v.locale !== 'string') return null
    if (v.lang !== 'en' && !SHIPPED_LANGUAGES.includes(v.lang)) return null
    return { lang: v.lang, locale: v.locale }
  } catch {
    return null
  }
}

export type TValues = Values & { context?: string }

function lookup(message: string, context?: string): string {
  const key = context ? `${message}|${context}` : message
  return state.messages[key] ?? message
}

function splitContext(values?: TValues): [string | undefined, Values] {
  if (!values) return [undefined, {}]
  const { context, ...rest } = values
  return [context, rest]
}

/** Renderers for the tags of a rich message: `{ b: (children) => <strong>{children}</strong> }`. */
export type Renderers = Record<string, (children: ReactNode) => ReactNode>

function render(parts: Part[], renderers: Renderers): ReactNode[] {
  return parts.map((p, i) => {
    if (typeof p === 'string') return p
    const fn = renderers[p.tag]
    const children = render(p.children, renderers)
    return createElement(Fragment, { key: i }, fn ? fn(children) : children)
  })
}

interface Translate {
  (message: string, values?: TValues): string
  /** A message with tags rendered by `renderers`, as one translatable unit. */
  rich(message: string, renderers: Renderers, values?: TValues): ReactNode
}

/** Translates a source message into the active language. */
export const t: Translate = Object.assign(
  (message: string, values?: TValues): string => {
    const [context, rest] = splitContext(values)
    return formatMessage(lookup(message, context), rest, state.locale)
  },
  {
    rich(message: string, renderers: Renderers, values?: TValues): ReactNode {
      const [context, rest] = splitContext(values)
      return createElement(Fragment, null, ...render(formatParts(lookup(message, context), rest, state.locale), renderers))
    },
  },
)

/** `<T b={(c) => <b>{c}</b>} values={{ n }}>Press <b>Save</b></T>`: JSX form of t.rich. */
export function T(props: { children: string; values?: TValues } & Record<string, unknown>): ReactNode {
  const { children, values, ...rest } = props
  const renderers: Renderers = {}
  for (const [k, v] of Object.entries(rest)) if (typeof v === 'function') renderers[k] = v as Renderers[string]
  return t.rich(children, renderers, values)
}

/**
 * Marks a message for translation without translating it yet (module-level
 * tables rendered later through t()); the extractor collects it.
 */
export const msg = (message: string): string => message
