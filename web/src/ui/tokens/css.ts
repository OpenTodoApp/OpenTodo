// Reads the --ot-* token blocks out of index.css so tests check the real values.
// Values are raw declarations (`oklch(…)`, `color-mix(…)`, `var(…)`); resolve.ts
// turns a token of a map into the colour the browser draws (tokens-v2 D2).
export type ThemeTokens = Record<string, string>

export function declarations(body: string): ThemeTokens {
  const out: ThemeTokens = {}
  for (const m of body.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/--ot-([\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}

export function block(css: string, selector: string, from = 0): { body: string; start: number; end: number } {
  const at = css.indexOf(selector, from)
  if (at < 0) throw new Error(`token block not found: ${selector}`)
  const open = css.indexOf('{', at)
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) return { body: css.slice(open + 1, i), start: at, end: i }
  }
  throw new Error(`unterminated block: ${selector}`)
}

export const SELECTORS = {
  light: ':root, [data-theme="light"] {',
  darkMedia: '@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"])',
  darkAttr: ':root[data-theme="dark"], [data-theme="dark"] {',
  constants: ':root {\n  --duration-ui',
  hcLight: 'html:root[data-contrast="high"], html[data-contrast="high"] [data-theme="light"] {',
  hcDarkMedia: 'html:root[data-contrast="high"]:not([data-theme="light"]) {',
  hcDarkAttr: 'html:root[data-contrast="high"][data-theme="dark"], html[data-contrast="high"] [data-theme="dark"] {',
} as const

/** The mode-independent `--ot-*` values (the derivation ratios, tokens-v2 D4). */
export function parseConstants(css: string): ThemeTokens {
  return declarations(block(css, SELECTORS.constants).body)
}

/**
 * The declarations of each mode block (`light`, `darkMedia`, `darkAttr`) as written,
 * and `lightTokens` / `darkTokens`: the full map a mode resolves against, with the
 * derivation ratios merged in.
 */
export function parseThemes(css: string) {
  const constants = parseConstants(css)
  const light = declarations(block(css, SELECTORS.light).body)
  const darkMedia = declarations(block(css, SELECTORS.darkMedia).body)
  const darkAttr = declarations(block(css, SELECTORS.darkAttr).body)
  return { light, darkMedia, darkAttr, lightTokens: { ...constants, ...light }, darkTokens: { ...constants, ...darkAttr } }
}

/**
 * The high-contrast override (display-mode D4): the raw values of its three
 * blocks, and the full token set of each mode with the override laid over it.
 */
export function parseContrastOverride(css: string) {
  const base = parseThemes(css)
  const light = declarations(block(css, SELECTORS.hcLight).body)
  const darkMedia = declarations(block(css, SELECTORS.hcDarkMedia).body)
  const darkAttr = declarations(block(css, SELECTORS.hcDarkAttr).body)
  return {
    raw: { light, darkMedia, darkAttr },
    light: { ...base.lightTokens, ...light },
    dark: { ...base.darkTokens, ...darkAttr },
  }
}

export interface AccentTokens {
  /** The values the accent declares (`al-accent`, `ad-accent-text`, `a-on-accent` and any override). */
  declared: ThemeTokens
  /** The full token set of each mode with the accent's values applied. */
  light: ThemeTokens
  dark: ThemeTokens
}

/** Every [data-accent="…"] block of index.css (theming D5, tokens-v2 D4), in file order. */
export function parseAccents(css: string): Record<string, AccentTokens> {
  const base = parseThemes(css)
  const out: Record<string, AccentTokens> = {}
  for (const m of css.matchAll(/\[data-accent="([a-z]+)"\]\s*\{([^}]*)\}/g)) {
    const declared = declarations(m[2])
    out[m[1]] = { declared, light: { ...base.lightTokens, ...declared }, dark: { ...base.darkTokens, ...declared } }
  }
  return out
}

/** The accent mapping blocks on [data-accent] elements: light, dark by preference, dark by attribute. */
export function parseAccentMapping(css: string) {
  return {
    light: declarations(block(css, ':root[data-accent], [data-accent] {').body),
    darkMedia: declarations(block(css, ':root[data-accent]:where(:not([data-theme="light"]))').body),
    darkAttr: declarations(block(css, ':root[data-accent][data-theme="dark"],').body),
  }
}
