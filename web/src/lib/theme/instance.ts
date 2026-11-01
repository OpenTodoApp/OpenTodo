// The instance's themes on this device (OpenSpec change theme-instance-default,
// design D3): the owner's default light and dark theme and the server themes,
// read from `GET /api/v1/themes/instance` when the version `auth/status` reports
// differs from the one remembered here (`ot.instanceThemes`), so offline use and
// the first frame have them. A device that never read them has none: OpenTodo's
// themes. First-load code: small, no derivation (load.ts resolves a theme lazily).
import { createStore } from '../store'
import { readJSON, removeItem, writeJSON } from '../deviceStorage'
import { api } from '../api'
import type { ThemeDocument, ThemeKind } from './format'

export interface InstanceThemeEntry {
  /** The server id: `instance:<id>` in a choice; the document's id too. */
  id: string
  kind: ThemeKind
  doc: ThemeDocument
}

export interface InstanceThemes {
  version: number
  /** Each side's default: "" (OpenTodo's), `builtin:<id>` or `instance:<id>`. */
  default: { light: string; dark: string }
  themes: InstanceThemeEntry[]
}

export const INSTANCE_THEMES_KEY = 'ot.instanceThemes'
export const NO_INSTANCE_THEMES: InstanceThemes = { version: 0, default: { light: '', dark: '' }, themes: [] }

const ID = /^[a-z0-9]{1,40}$/

/** The answer of the server, or a remembered copy, with anything malformed dropped. */
export function parseInstanceThemes(raw: unknown): InstanceThemes | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Partial<InstanceThemes>
  if (typeof o.version !== 'number' || !Number.isFinite(o.version)) return null
  const d = (o.default ?? {}) as Partial<InstanceThemes['default']>
  const themes = Array.isArray(o.themes) ? o.themes.filter((x): x is InstanceThemeEntry =>
    !!x && typeof x === 'object' && typeof x.id === 'string' && ID.test(x.id) && (x.kind === 'light' || x.kind === 'dark') && !!x.doc && typeof x.doc === 'object' && x.doc.kind === x.kind) : []
  return {
    version: o.version,
    default: { light: typeof d.light === 'string' ? d.light : '', dark: typeof d.dark === 'string' ? d.dark : '' },
    themes: themes.map((x) => ({ id: x.id, kind: x.kind, doc: { ...x.doc, id: x.id } })),
  }
}

const read = () => readJSON<InstanceThemes>(INSTANCE_THEMES_KEY, NO_INSTANCE_THEMES, parseInstanceThemes)
const store = createStore<InstanceThemes>('instanceThemes', read(), read)

export const getInstanceThemes = store.get

/** The instance themes, re-rendering when they change. */
export const useInstanceThemes = store.use

/** Remembers what the server answered (never an op). */
export function setInstanceThemes(raw: unknown): void {
  const next = parseInstanceThemes(raw)
  if (!next) return
  if (next.version === 0 && !next.themes.length && !next.default.light && !next.default.dark) removeItem(INSTANCE_THEMES_KEY)
  else writeJSON(INSTANCE_THEMES_KEY, next)
  store.set(next)
}

/** The instance theme with this id, of the given kind when one is asked for. */
export function instanceTheme(id: string, kind?: ThemeKind, from: InstanceThemes = store.get()): InstanceThemeEntry | null {
  const e = from.themes.find((x) => x.id === id)
  return e && (!kind || e.kind === kind) ? e : null
}

let pending: Promise<void> | null = null

/**
 * Reads the instance themes again when the server reports another version than
 * the one remembered (`version` from auth/status; absent on older servers: nothing).
 * Offline, or on a refused request, the remembered copy stays.
 */
export function refreshInstanceThemes(version: number | undefined, force = false): Promise<void> {
  if (!force && (typeof version !== 'number' || version === store.get().version)) return Promise.resolve()
  pending ??= api.instanceThemes().then(setInstanceThemes, () => undefined).finally(() => { pending = null })
  return pending
}

const WATCH_INTERVAL_MS = 5 * 60_000
let lastCheck = 0
let watching = false

/**
 * Checks the version again when the device comes back online or the app comes
 * back to the front, at most every five minutes, so a change of the owner reaches
 * an app that stays open. Idempotent.
 */
export function watchInstanceThemes(now: () => number = Date.now): void {
  if (watching || typeof window === 'undefined') return
  watching = true
  lastCheck = now()
  const check = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    if (now() - lastCheck < WATCH_INTERVAL_MS) return
    lastCheck = now()
    api.authStatus().then((s) => refreshInstanceThemes(s.themes?.version), () => undefined)
  }
  window.addEventListener('online', check)
  document.addEventListener('visibilitychange', check)
}
