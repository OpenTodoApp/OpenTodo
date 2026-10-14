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
