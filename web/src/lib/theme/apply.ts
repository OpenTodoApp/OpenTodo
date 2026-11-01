// Applying a resolved theme (OpenSpec change theme-engine, design D4, D5): one
// generated rule in a <style id="ot-theme"> element, scoped so that the
// high-contrast presentation always wins, and the device cache `ot.theme` that
// public/appearance.js applies before the first paint. Only names of the closed
// token list and values the app formatted itself are written, each checked against
// the same patterns as the boot script, so a document can never add a declaration.
// The OpenTodo themes write no sheet at all: the default path is exactly the
// stylesheet. First-load code; the derivation is lazy (load.ts).
import { readJSON, removeItem, writeJSON } from '../deviceStorage'
import { CSS_TOKENS, RADIUS_STEPS, type RadiusStep } from './tokens'
import type { ThemeKind } from './format'

/** A resolved theme as cached on the device and applied (derive.ts ResolvedTheme plus its source hash). */
export interface AppliedTheme {
  id: string
  /** A short hash of the source document and the derivation version (design D5). */
  hash: string
  kind: ThemeKind
  tokens: Record<string, string>
  bar: string
  radius?: Record<RadiusStep, number>
  font?: string
  list?: 14 | 15
}

export const THEME_STYLE_ID = 'ot-theme'
export const THEME_CACHE_KEY = 'ot.theme'

/** The same patterns as public/appearance.js. */
export const NAME = /^[a-z0-9-]{1,40}$/
export const VALUE = /^(#[0-9a-f]{6}|oklch\([0-9.]+ [0-9.]+ [0-9.]+( \/ [0-9.]+)?\))$/
export const FONT = /^[A-Za-z0-9 ,"-]{1,200}$/
const HEX = /^#[0-9a-f]{6}$/

/** Whether a value read from storage is a theme this code may apply (the boot script checks the same). */
export function validApplied(t: unknown): t is AppliedTheme {
  const o = t as Partial<AppliedTheme> | null
  if (!o || typeof o !== 'object' || typeof o.id !== 'string' || !NAME.test(o.id) || typeof o.hash !== 'string' || (o.kind !== 'light' && o.kind !== 'dark')) return false
  if (typeof o.bar !== 'string' || !HEX.test(o.bar) || !o.tokens || typeof o.tokens !== 'object') return false
  for (const [k, v] of Object.entries(o.tokens)) if (!NAME.test(k) || typeof v !== 'string' || !VALUE.test(v)) return false
  if (o.radius !== undefined && (typeof o.radius !== 'object' || !RADIUS_STEPS.every((s) => Number.isInteger(o.radius![s]) && o.radius![s] >= 0 && o.radius![s] <= 20))) return false
  if (o.font !== undefined && (typeof o.font !== 'string' || !FONT.test(o.font))) return false
  if (o.list !== undefined && o.list !== 14 && o.list !== 15) return false
  return true
}

/**
 * The style sheet of a theme. Colours go in a rule that does not match under high
 * contrast; shape and type in one that does (they do not affect contrast). The
 * selector outranks every mode and accent block of index.css, whatever the order.
 * public/appearance.js writes the same text (appearanceBoot.test.ts compares them).
 */
export function themeCss(t: AppliedTheme): string {
  const colours = CSS_TOKENS.filter((n) => typeof t.tokens[n] === 'string' && VALUE.test(t.tokens[n])).map((n) => `--ot-${n}:${t.tokens[n]}`)
  let css = `html:root[data-ot-theme]:not([data-contrast="high"]){${colours.join(';')};color-scheme:${t.kind}}`
  const shape: string[] = []
  if (t.radius) for (const s of RADIUS_STEPS) shape.push(`--ot-radius-${s}:${t.radius[s]}px`)
  if (t.font && FONT.test(t.font)) shape.push(`--ot-font:${t.font}`)
  if (t.list) shape.push(`--ot-text-list:${t.list / 16}rem`)
  if (shape.length) css += `html:root[data-ot-theme]{${shape.join(';')}}`
  return css
}

/**
 * Applies a theme to the document root, or removes it (null: the OpenTodo theme of
 * the side). `data-theme` follows the theme's kind, so every light and dark rule of
 * the stylesheet (shadows, images, color-scheme) follows it too.
 */
export function applyTheme(t: AppliedTheme | null, doc: Document = document): void {
  const root = doc.documentElement
  let el = doc.getElementById(THEME_STYLE_ID)
  if (!t) {
    el?.remove()
    root.removeAttribute('data-ot-theme')
    return
  }
  if (!el) {
    el = doc.createElement('style')
    el.id = THEME_STYLE_ID
    doc.head.append(el)
  }
  const css = themeCss(t)
  if (el.textContent !== css) el.textContent = css
  root.setAttribute('data-theme', t.kind)
  root.setAttribute('data-ot-theme', t.id)
}

export type ThemeCache = Partial<Record<ThemeKind, AppliedTheme>>

/** The cached themes of both sides; a malformed side is dropped. */
export function readThemeCache(): ThemeCache {
  const c = readJSON<Record<string, unknown> | null>(THEME_CACHE_KEY, null)
  const out: ThemeCache = {}
  if (!c || typeof c !== 'object') return out
  for (const side of ['light', 'dark'] as const) if (validApplied(c[side]) && (c[side] as AppliedTheme).kind === side) out[side] = c[side] as AppliedTheme
  return out
}

/** Remembers the resolved theme of each side (never an op); the OpenTodo themes are not cached. */
export function writeThemeCache(c: ThemeCache): void {
  if (!c.light && !c.dark) removeItem(THEME_CACHE_KEY)
  else writeJSON(THEME_CACHE_KEY, c)
}

/** A short, stable hash (FNV-1a, 32 bits) of a document's text and the derivation version. */
export function themeHash(source: string, version: number): string {
  let h = 0x811c9dc5
  const s = `${version}:${source}`
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}
