// The theme document, format 1 (OpenSpec change theme-engine, design D1, D2;
// themes "Theme document format", "Format versions and migration"). A theme is a
// small JSON document of seeds and optional explicit token values; it is data,
// never CSS: every colour is `#rrggbb` or an in-gamut `oklch(L C H)` (alpha only on
// the scrim), so a document cannot carry `url()`, `var()` or a keyword. The source
// is a credit shown as text and never fetched. internal/themes is the same
// validator in Go; both accept and refuse exactly the files of
// internal/themes/testdata (format.test.ts, docs/contracts.md).
import { labToRgbRaw, lchToLab } from '../colourMath'
import { ALPHA_TOKEN, LIST_SIZES, LOCAL_FONT, RADIUS_STEPS, type RadiusStep } from './tokens'

/** The format this app reads and writes. */
export const THEME_FORMAT = 1
/** The largest document, in bytes of UTF-8 JSON. */
export const MAX_THEME_BYTES = 16 * 1024

export type ThemeKind = 'light' | 'dark'
export type FontFamily = 'inter' | 'system' | 'serif' | 'mono' | { local: string }

export interface ThemeSeeds {
  canvas: string
  surface: string
  text: string
  accent: string
  success?: string
  warning?: string
  danger?: string
  info?: string
  [name: string]: string | undefined
}

export interface ThemeDocument {
  opentodoTheme: number
  id: string
  name: string
  author: string
  licence: string
  source?: string
  kind: ThemeKind
  seeds: ThemeSeeds
  tokens?: Record<string, string>
  bar?: string
  notes?: { adapted?: Record<string, string>; text?: string }
  shape?: { radius?: Partial<Record<RadiusStep, number>> }
  type?: { family?: FontFamily; list?: (typeof LIST_SIZES)[number] }
  [key: string]: unknown
}

/**
 * Why a document is refused. The Go validator returns the same codes, so the
 * shared examples pin both sides to the same answer.
 */
export type ThemeError =
  | 'json' | 'size' | 'version' | 'newer' | 'id' | 'name' | 'text' | 'kind'
  | 'seeds' | 'tokens' | 'colour' | 'alpha' | 'gamut' | 'bar' | 'notes' | 'shape' | 'type' | 'key'

export type ThemeResult = { ok: true; doc: ThemeDocument } | { ok: false; error: ThemeError; path: string }

const NUM = '(\\d+(?:\\.\\d+)?|\\.\\d+)'
const SP = '[ \\t]'
const OKLCH = new RegExp(`^oklch\\(${SP}*${NUM}${SP}+${NUM}${SP}+${NUM}${SP}*(?:/${SP}*${NUM}${SP}*)?\\)$`)
const HEX = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/
const ID = /^[a-z0-9-]{1,64}$/
const TOKEN_NAME = /^[a-z0-9-]{1,40}$/
const TOP_KEY = /^[A-Za-z][A-Za-z0-9]{0,39}$/
const SEEDS_REQUIRED = ['canvas', 'surface', 'text', 'accent'] as const
/** How far outside 0..1 a channel may land and still count as inside the sRGB gamut (rounding of written values). */
export const GAMUT_TOLERANCE = 0.001

const KNOWN_KEYS = new Set(['opentodoTheme', 'id', 'name', 'author', 'licence', 'source', 'kind', 'seeds', 'tokens', 'bar', 'notes', 'shape', 'type'])

class Refused extends Error {
  constructor(readonly code: ThemeError, readonly at: string) {
    super(`${code} at ${at}`)
  }
}

const fail = (code: ThemeError, at: string): never => {
  throw new Refused(code, at)
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const chars = (s: string) => [...s].length
const sorted = (o: Record<string, unknown>) => Object.keys(o).sort()

/**
 * Checks a colour value. `alpha` allows transparency (the scrim only).
 * Returns the code of the first rule it breaks, or null.
 */
export function colourError(v: unknown, alpha = false): ThemeError | null {
  if (typeof v !== 'string') return 'colour'
  const hex = HEX.exec(v)
  if (hex) return hex[1] && !alpha ? 'alpha' : null
  const m = OKLCH.exec(v)
  if (!m) return 'colour'
  const [L, C, H] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (m[4] !== undefined) {
    if (!alpha) return 'alpha'
    if (Number(m[4]) > 1) return 'colour'
  }
  if (L > 1 || C > 0.4 || H > 360) return 'colour'
  const { r, g, b } = labToRgbRaw(lchToLab(L, C, H))
  if (![r, g, b].every((x) => x >= -GAMUT_TOLERANCE && x <= 1 + GAMUT_TOLERANCE)) return 'gamut'
  return null
}

function colour(v: unknown, at: string, alpha = false) {
  const e = colourError(v, alpha)
  if (e) fail(e, at)
}

function text(v: unknown, at: string, max: number, code: ThemeError = 'text', min = 0) {
  if (typeof v !== 'string' || chars(v) > max || chars(v.trim()) < min) fail(code, at)
}

function checkSeeds(v: unknown) {
  if (!isObject(v)) return fail('seeds', 'seeds')
  for (const k of SEEDS_REQUIRED) if (!(k in v)) fail('seeds', `seeds.${k}`)
  for (const k of sorted(v)) {
    if (!TOKEN_NAME.test(k)) fail('seeds', `seeds.${k}`)
    colour(v[k], `seeds.${k}`)
  }
}

function checkTokens(v: unknown) {
  if (!isObject(v)) return fail('tokens', 'tokens')
  // An unknown name is kept and ignored (a newer app's token), but it must still be a name and a colour.
  for (const k of sorted(v)) {
    if (!TOKEN_NAME.test(k)) fail('tokens', `tokens.${k}`)
    colour(v[k], `tokens.${k}`, k === ALPHA_TOKEN)
  }
}

function checkNotes(v: unknown) {
  if (!isObject(v)) return fail('notes', 'notes')
  for (const k of sorted(v)) {
    if (k === 'text') text(v.text, 'notes.text', 500, 'notes')
    else if (k === 'adapted') {
      const a = v.adapted
      if (!isObject(a)) return fail('notes', 'notes.adapted')
      for (const t of sorted(a)) {
        if (!TOKEN_NAME.test(t)) fail('notes', `notes.adapted.${t}`)
        colour(a[t], `notes.adapted.${t}`)
      }
    } else fail('notes', `notes.${k}`)
  }
}

function checkShape(v: unknown) {
  if (!isObject(v)) return fail('shape', 'shape')
  for (const k of sorted(v)) {
    if (k !== 'radius') fail('shape', `shape.${k}`)
    const r = v.radius
    if (!isObject(r)) return fail('shape', 'shape.radius')
    for (const s of sorted(r)) {
      const n = r[s]
      if (!(RADIUS_STEPS as readonly string[]).includes(s) || typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 20) fail('shape', `shape.radius.${s}`)
    }
  }
}

function checkType(v: unknown) {
  if (!isObject(v)) return fail('type', 'type')
  for (const k of sorted(v)) {
    if (k === 'list') {
      if (!(LIST_SIZES as readonly unknown[]).includes(v.list)) fail('type', 'type.list')
    } else if (k === 'family') {
      const f = v.family
      if (typeof f === 'string') {
        if (!['inter', 'system', 'serif', 'mono'].includes(f)) fail('type', 'type.family')
      } else if (!isObject(f) || Object.keys(f).length !== 1 || typeof f.local !== 'string' || !LOCAL_FONT.test(f.local)) fail('type', 'type.family')
    } else fail('type', `type.${k}`)
  }
}

/** Validates a parsed document (design D1). A document of a newer format is refused with `newer`. */
export function validateTheme(value: unknown): ThemeResult {
  try {
    if (!isObject(value)) fail('json', '')
    const d = value as Record<string, unknown>
    const v = d.opentodoTheme
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) fail('version', 'opentodoTheme')
    if ((v as number) > THEME_FORMAT) fail('newer', 'opentodoTheme')
    if (typeof d.id !== 'string' || !ID.test(d.id)) fail('id', 'id')
    text(d.name, 'name', 60, 'name', 1)
    text(d.author, 'author', 120)
    text(d.licence, 'licence', 120)
    if ('source' in d) text(d.source, 'source', 300)
    if (d.kind !== 'light' && d.kind !== 'dark') fail('kind', 'kind')
    checkSeeds(d.seeds)
    if ('tokens' in d) checkTokens(d.tokens)
    if ('bar' in d) {
      const e = colourError(d.bar)
      if (e) fail(e === 'colour' ? 'bar' : e, 'bar')
    }
    if ('notes' in d) checkNotes(d.notes)
    if ('shape' in d) checkShape(d.shape)
    if ('type' in d) checkType(d.type)
    // A key a newer app adds is kept and ignored, as long as it is a plain name.
    for (const k of sorted(d)) if (!KNOWN_KEYS.has(k) && !TOP_KEY.test(k)) fail('key', k)
    return { ok: true, doc: migrate(d as ThemeDocument) }
  } catch (e) {
    if (e instanceof Refused) return { ok: false, error: e.code, path: e.at }
    throw e
  }
}

/** Reads a document from its text: the size limit, then JSON, then the rules. */
export function parseTheme(source: string): ThemeResult {
  if (new TextEncoder().encode(source).length > MAX_THEME_BYTES) return { ok: false, error: 'size', path: '' }
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch {
    return { ok: false, error: 'json', path: '' }
  }
  return validateTheme(value)
}

/**
 * Brings a document of an older known format to the current one, step by step
 * (design D2). Pure: the input is not changed. There is only format 1, so this is
 * the identity; a step for format N → N+1 goes here when a key changes meaning.
 */
export function migrate(doc: ThemeDocument): ThemeDocument {
  return doc
}
