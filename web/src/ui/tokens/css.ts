// Reads the --ot-* token blocks out of index.css so tests check the real values.
export type ThemeTokens = Record<string, string>

function declarations(body: string): ThemeTokens {
  const out: ThemeTokens = {}
  for (const m of body.matchAll(/--ot-([\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}

function block(css: string, selector: string, from = 0): { body: string; end: number } {
  const at = css.indexOf(selector, from)
  if (at < 0) throw new Error(`token block not found: ${selector}`)
  const open = css.indexOf('{', at)
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) return { body: css.slice(open + 1, i), end: i }
  }
  throw new Error(`unterminated block: ${selector}`)
}

export function parseThemes(css: string) {
  const light = declarations(block(css, ':root, [data-theme="light"] {').body)
  const media = block(css, '@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"])')
  const darkMedia = declarations(media.body)
  const darkAttr = declarations(block(css, ':root[data-theme="dark"], [data-theme="dark"] {').body)
  return { light, darkMedia, darkAttr }
}

/**
 * The high-contrast override (display-mode D4): the raw values of its three
 * blocks, and the full token set of each mode with the override laid over it.
 */
export function parseContrastOverride(css: string) {
  const base = parseThemes(css)
  const light = declarations(block(css, 'html:root[data-contrast="high"], html[data-contrast="high"] [data-theme="light"] {').body)
  const darkMedia = declarations(block(css, 'html:root[data-contrast="high"]:not([data-theme="light"]) {').body)
  const darkAttr = declarations(block(css, 'html:root[data-contrast="high"][data-theme="dark"], html[data-contrast="high"] [data-theme="dark"] {').body)
  return {
    raw: { light, darkMedia, darkAttr },
    light: { ...base.light, ...light },
    dark: { ...base.darkAttr, ...darkAttr },
  }
}

export interface AccentTokens {
  /** The raw values the accent declares, by token name, per mode. */
  rawLight: ThemeTokens
  rawDark: ThemeTokens
  /** The full token set with the accent applied: base tokens overlaid with the accent's. */
  light: ThemeTokens
  dark: ThemeTokens
}

/** Every [data-accent="…"] block of index.css (theming D5), in file order. */
export function parseAccents(css: string): Record<string, AccentTokens> {
  const base = parseThemes(css)
  const out: Record<string, AccentTokens> = {}
  for (const m of css.matchAll(/\[data-accent="([a-z]+)"\]\s*\{([^}]*)\}/g)) {
    const rawLight: ThemeTokens = {}
    const rawDark: ThemeTokens = {}
    for (const d of m[2].matchAll(/--ot-a([ld])-([\w-]+):\s*([^;]+);/g)) (d[1] === 'l' ? rawLight : rawDark)[d[2]] = d[3].trim()
    out[m[1]] = { rawLight, rawDark, light: { ...base.light, ...rawLight }, dark: { ...base.darkAttr, ...rawDark } }
  }
  return out
}
