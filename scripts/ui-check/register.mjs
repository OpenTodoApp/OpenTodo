// The accessibility exceptions register, resolved to colours (OpenSpec accessibility
// "Automated AAA gate", accessibility-aaa D12): every registered token pair as the
// sRGB colours the browser renders, in light and dark and for every accent theme, so
// the story audit can tell a registered enhanced-contrast finding from a new one. The
// token resolver is the web app's own (web/src/ui/tokens/*.ts), compiled on the fly.
import { readFileSync } from 'node:fs'
import { repo, ts } from '../i18n/source.mjs'

/** Imports a dependency-free TypeScript module of the web app. */
async function load(rel) {
  const src = readFileSync(`${repo}web/src/${rel}`, 'utf8')
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
}

/** Backgrounds a wildcard pair (`bg: "*"`) is measured over. */
const ANY_BG = ['canvas', 'surface', 'raised', 'sunken', 'sidebar', 'accent-soft']

/** How close two rendered colours must be to count as the same token (ΔE OK × 100). */
export const TOLERANCE = 2

/**
 * Resolves the register: `covers(theme, fg, bg)` is true when a registered pair renders
 * within the tolerance of both colours (axe reports them as hex) in that theme, for
 * the default tokens or any accent.
 */
export async function registeredColours(indexCssPath, registerPath) {
  const [resolve, parse, pairs] = await Promise.all([load('ui/tokens/resolve.ts'), load('ui/tokens/css.ts'), load('ui/tokens/pairs.ts')])
  const css = readFileSync(indexCssPath, 'utf8')
  const register = JSON.parse(readFileSync(registerPath, 'utf8'))
  const themes = parse.parseThemes(css)
  const accents = Object.values(parse.parseAccents(css))
  const sets = {
    light: [themes.lightTokens, ...accents.map((a) => a.light)].map((t) => ({ ...t, ...pairs.DERIVED_TOKENS })),
    dark: [themes.darkTokens, ...accents.map((a) => a.dark)].map((t) => ({ ...t, ...pairs.DERIVED_TOKENS })),
  }
  const rendered = { light: [], dark: [] }
  for (const theme of ['light', 'dark']) {
    for (const tokens of sets[theme]) {
      for (const e of register) {
        for (const p of e.pairs ?? []) {
          const bgs = p.bg === '*' ? ANY_BG.filter((b) => b in tokens) : [p.bg]
          for (const bg of bgs) {
            if (!(p.fg in tokens) || !(bg in tokens)) continue
            const back = resolve.resolveToken(tokens, bg)
            rendered[theme].push({ id: e.id, fg: resolve.resolveToken(tokens, p.fg, bg), bg: back, anyBg: p.bg === '*' })
          }
        }
      }
    }
  }
  const near = (a, b) => resolve.deltaE(a, b) <= TOLERANCE
  return {
    rendered,
    // A story's theme is the default; a `data-theme` subtree (the theme tiles, the
    // workbench frame) renders the other one, so both are consulted.
    covers(theme, fgHex, bgHex) {
      let fg, bg
      try { fg = resolve.parseRgba(fgHex); bg = resolve.parseRgba(bgHex) } catch { return false }
      const order = theme === 'dark' ? ['dark', 'light'] : ['light', 'dark']
      return order.some((t) => rendered[t].some((r) => near(r.fg, fg) && (r.anyBg || near(r.bg, bg))))
    },
  }
}
