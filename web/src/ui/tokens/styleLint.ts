// Style lint over screens (OpenSpec change ux-overhaul, design-system "Token lint
// covers the screens", "Three surfaces", "Secondary text is one size", "Tooltip
// primitive"): raw text sizes, pixel font sizes, raw radii, raw shadows, the
// legacy component classes and the native `title` attribute each fail it. Pure
// functions, shared by the test and the seed script.

const VARIANT = '(?:[\\w-]+:)*'
/** Raw type sizes: the token scale is text-hint, text-meta, text-body, text-h3, text-h2, text-h1, text-display. */
const RAW_SIZE = new RegExp(`(?<![\\w-])${VARIANT}text-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|\\[\\d+(?:\\.\\d+)?(?:px|rem|em)\\])(?![\\w-])`, 'g')
/** Raw radii: the tokens are rounded-chip, rounded-control and rounded-card (plus full and none). */
const RAW_RADIUS = new RegExp(`(?<![\\w-])${VARIANT}rounded(?:-(?:t|b|l|r|tl|tr|bl|br|s|e|ss|se|es|ee))?(?:-(?:xs|sm|md|lg|xl|2xl|3xl))?(?!-(?:full|none|chip|control|card))(?![\\w-])`, 'g')
/** Raw shadows: the tokens are shadow-1, shadow-2 and shadow-3 (plus none). */
const RAW_SHADOW = new RegExp(`(?<![\\w-])${VARIANT}shadow(?:-(?:2xs|xs|sm|md|lg|xl|2xl|inner))?(?!-(?:[123]|none|\\(|\\[))(?![\\w-])`, 'g')
/** The legacy classes, as tokens of a className value. */
const LEGACY = /(?<![\w-])(?:btn|btn-primary|btn-secondary|btn-ghost|btn-danger|input|kbd)(?![\w-])/g
/** `className="…"`, `className='…'` or `className={…}` (one level of braces). */
const CLASS_ATTR = /className=(?:(["'])((?:\\.|(?!\1).)*)\1|\{((?:[^{}]|\{[^{}]*\})*)\})/g
const STRING = /(["'`])((?:\\.|(?!\1).)*)\1/g

/** The class tokens a line's className values hold (string literals only; expressions are skipped). */
function classTokens(line: string): string[] {
  const out: string[] = []
  for (const m of line.matchAll(CLASS_ATTR)) {
    if (m[2] !== undefined) out.push(m[2])
    else for (const s of m[3].matchAll(STRING)) out.push(s[2].replace(/\$\{[^}]*\}/g, ' '))
  }
  return out
}

export interface Finding {
  path: string
  line: number
  text: string
}

/** Lines marked `style-lint-allow` keep a raw class on purpose (a size inside a QR code, a hairline). */
export function rawStyles(path: string, source: string): Finding[] {
  const out: Finding[] = []
  source.split('\n').forEach((line, i) => {
    if (line.includes('style-lint-allow')) return
    for (const m of line.matchAll(RAW_SIZE)) out.push({ path, line: i + 1, text: m[0] })
    for (const m of line.matchAll(RAW_RADIUS)) out.push({ path, line: i + 1, text: m[0] })
    for (const m of line.matchAll(RAW_SHADOW)) out.push({ path, line: i + 1, text: m[0] })
    for (const value of classTokens(line)) for (const m of value.matchAll(LEGACY)) out.push({ path, line: i + 1, text: m[0] })
  })
  return out
}

/**
 * `title=` on an HTML element (a lowercase tag). A `title` prop of a component
 * (Dialog, PageHeader, SettingsSection) is content, not a native tooltip, and is
 * not reported. Lines marked `tooltip-lint-allow` are skipped.
 */
export function nativeTitles(path: string, source: string): Finding[] {
  const out: Finding[] = []
  const lines = source.split('\n')
  const offsets: number[] = []
  let acc = 0
  for (const l of lines) { offsets.push(acc); acc += l.length + 1 }
  const lineOf = (index: number) => { let lo = 0, hi = offsets.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (offsets[mid] <= index) lo = mid; else hi = mid - 1 } return lo }
  for (const m of source.matchAll(/\btitle=/g)) {
    const at = m.index ?? 0
    const line = lineOf(at)
    if (lines[line].includes('tooltip-lint-allow')) continue
    // The tag this attribute belongs to: the nearest `<name` before it that is not closed yet.
    const before = source.slice(0, at)
    const open = before.lastIndexOf('<')
    if (open < 0) continue
    const tag = /^<([A-Za-z][\w.]*)/.exec(before.slice(open))
    if (!tag) continue
    // Still inside the tag? Arrow functions and `{…}` expressions are not the tag's end.
    const tagText = before.slice(open).replace(/=>/g, '').replace(/\{[^{}]*\}/g, '').replace(/\{[^{}]*\}/g, '')
    if (tagText.includes('>')) continue
    if (/^[a-z]/.test(tag[1])) out.push({ path, line: line + 1, text: `<${tag[1]} title=` })
  }
  return out
}

/**
 * Hand-made card surfaces in a settings panel (OpenSpec change surfaces-v2, settings
 * "Card tiers"): a file that renders `SettingsSection` gets its card or flat section
 * from that component's `tier`, so a className holding both `rounded-card` and a
 * `shadow-<n>` there is a card the tiers cannot see. Lines marked
 * `surface-lint-allow` are a deliberate standalone card (a gate shown instead of the page).
 */
export function handMadeSurfaces(path: string, source: string): Finding[] {
  if (!/\bSettingsSection\b/.test(source)) return []
  const out: Finding[] = []
  source.split('\n').forEach((line, i) => {
    if (line.includes('surface-lint-allow')) return
    for (const value of classTokens(line)) {
      const tokens = value.split(/\s+/)
      if (tokens.includes('rounded-card') && tokens.some((tk) => /^(?:[\w-]+:)*shadow-[123]$/.test(tk))) out.push({ path, line: i + 1, text: value.trim() })
    }
  })
  return out
}

/**
 * The moment duration on a hover, focus or menu transition (OpenSpec change tokens-v2,
 * design-system "Reduced motion", "Moment used for a hover"): the 400 ms moment is
 * kept for the completion sequence, list reflow and overlay entrances. A className
 * holding `duration-(--duration-moment)` with a `hover:` or `focus` variant fails, and
 * so does any use of the moment in a menu or tooltip file.
 */
export function momentOnHover(path: string, source: string): Finding[] {
  const menuFile = /(?:^|\/)(?:Menu|Tooltip|ActionMenu)\.tsx$|\/menus\//.test(path)
  const out: Finding[] = []
  source.split('\n').forEach((line, i) => {
    for (const value of classTokens(line)) {
      const tokens = value.split(/\s+/)
      if (!tokens.some((tk) => /^(?:[\w-]+:)*duration-\(--duration-moment\)$/.test(tk))) continue
      if (menuFile || tokens.some((tk) => /^(?:[\w-]+:)*(?:hover|focus|focus-visible|focus-within|group-hover):/.test(tk))) out.push({ path, line: i + 1, text: value.trim() })
    }
  })
  return out
}

export const format = (f: Finding) => `${f.path}:${f.line}: ${f.text}`
