import { describe, expect, it } from 'vitest'
import css from '../../index.css?raw'
import { STYLE_NOT_YET_MIGRATED, STYLE_NOT_YET_MIGRATED_MAX, TITLE_NOT_YET_MIGRATED, TITLE_NOT_YET_MIGRATED_MAX } from './notYetMigrated'
import { cancelledRings, format, handMadeSurfaces, momentOnHover, nativeTitles, rawStyles } from './styleLint'

// OpenSpec design-system "Semantic design tokens": shared UI, screens and the
// component style classes colour through tokens, never raw Tailwind palette
// classes, fixed white/black or hex literals. Tests and stories are not UI. A hex
// passed as `color=` is stored data (a project or label colour mapped through the
// palette), not styling.
const ui = import.meta.glob<string>(['../**/*.tsx', '!../**/*.test.tsx'], { query: '?raw', import: 'default', eager: true })
const app = import.meta.glob<string>(['../../app/**/*.tsx', '!../../app/**/*.test.tsx', '!../../app/**/*.stories.tsx'], {
  query: '?raw', import: 'default', eager: true,
})

const PALETTE = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const UTILITY = 'bg|text|border|ring|fill|stroke|outline|divide|placeholder|decoration|shadow|accent|caret|from|via|to'
const RAW_CLASS = new RegExp(`(?<![\\w-])(?:[\\w-]+:)*(?:${UTILITY})-(?:(?:${PALETTE})-\\d{2,3}|white|black)(?:\\/\\d+)?(?![\\w-])`, 'g')
const HEX = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?:[0-9a-fA-F]{2})?\b/g
/** Colour functions with literal values (`rgb(148 163 184 / 0.35)`); `color-mix()` over tokens is fine. */
const COLOUR_FN = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(\s*[\d.][^)]*\)/g

/** A line marked `token-lint-allow` keeps a fixed colour on purpose (for example a QR code). */
export function rawColours(path: string, source: string): string[] {
  return source.split('\n').flatMap((line, i) => line.includes('token-lint-allow') ? [] :
    [...line.matchAll(RAW_CLASS), ...(/\bcolor=/.test(line) ? [] : line.matchAll(HEX)), ...line.matchAll(COLOUR_FN)].map((m) => `${path}:${i + 1}: ${m[0]}`),
  )
}

/**
 * Screens being rewritten by an open change keep their raw colours until that
 * change lands (screen-token-migration design D3). This list may only shrink.
 */
export const REDESIGN_ALLOW_LIST: readonly string[] = []
const REDESIGN_ALLOW_LIST_MAX = 0

/** Files the migration has not reached yet; removed as each slice lands, empty at the end. */
export const NOT_YET_MIGRATED: readonly string[] = []

/** The @layer components blocks of index.css, with their line offsets. */
function componentLayers(source: string): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = []
  let at = source.indexOf('@layer components')
  while (at >= 0) {
    const open = source.indexOf('{', at)
    let depth = 0
    let end = open
    for (let i = open; i < source.length; i++) {
      if (source[i] === '{') depth++
      else if (source[i] === '}' && --depth === 0) {
        end = i
        break
      }
    }
    out.push({ text: source.slice(open, end), line: source.slice(0, open).split('\n').length })
    at = source.indexOf('@layer components', end)
  }
  return out
}

/**
 * The tone scale (OpenSpec change tokens-v2, design D6): text and icons get quieter by
 * stepping down a tone (strong, default, muted, faint), never with an opacity utility
 * or an alpha suffix on a text or border token. Opacity 0 and 100 (show and hide) and
 * disabled states are not quieting; a dragged ghost, a fading row or the scrim carry a
 * `tone-lint-allow` marker on the line.
 */
const OPACITY = /(?<![\w-])((?:[\w-]+:)*)opacity-(\d+)(?![\w-])/g
const TONE_ALPHA = /(?<![\w-])(?:[\w-]+:)*(?:text-[a-z][\w-]*|border-(?:default|soft|input))\/\d+(?![\w-])/g

export function toneProblems(path: string, source: string): string[] {
  return source.split('\n').flatMap((line, i) => {
    if (line.includes('tone-lint-allow')) return []
    const out: string[] = []
    for (const m of line.matchAll(OPACITY)) {
      const variants = m[1].split(':')
      if (m[2] === '0' || m[2] === '100' || variants.some((v) => /(?:^|-)disabled$/.test(v))) continue
      out.push(`${path}:${i + 1}: ${m[0]}`)
    }
    for (const m of line.matchAll(TONE_ALPHA)) out.push(`${path}:${i + 1}: ${m[0]}`)
    return out
  })
}

/**
 * Token blocks hold OKLCH only (tokens-v2 D10): inside the mode blocks, the accent and
 * hue blocks, the ratios, the chart ramp and the high-contrast override, a colour is an
 * `oklch()` literal, a `color-mix(in oklch | oklab, …)` over tokens or literals, a
 * `var()` or `transparent`; lengths, times and percentages are fine. A hex, `rgb()`,
 * `hsl()` or named colour fails, naming the stylesheet line.
 */
const NAMED = /(?<![\w-])(?:white|black|red|green|blue|gray|grey|silver|yellow|orange|purple|pink|navy|teal|olive|maroon|lime|aqua|fuchsia|currentcolor)(?![\w-])/i
const FORBIDDEN = [/#[0-9a-fA-F]{3,8}\b/, /\b(?:rgba?|hsla?|hwb|lab|lch)\(/, /color-mix\(in (?!ok(?:lch|lab)\b)/, NAMED]

export function tokenBlockSelectors(source: string): string[] {
  return [
    ':root, [data-theme="light"] {',
    '@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"])',
    ':root[data-theme="dark"], [data-theme="dark"] {',
    ':root {\n  --duration-ui',
    ':root[data-accent], [data-accent] {',
    ':root[data-accent]:where(:not([data-theme="light"]))',
    ':root[data-accent][data-theme="dark"],',
    ':root, [data-theme], [data-accent] {',
    'html:root[data-contrast="high"], html[data-contrast="high"] [data-theme="light"] {',
    'html:root[data-contrast="high"]:not([data-theme="light"]) {',
    'html:root[data-contrast="high"][data-theme="dark"], html[data-contrast="high"] [data-theme="dark"] {',
    ...[...source.matchAll(/^\[data-(?:accent|hue)="[a-z]+"\] \{/gm)].map((m) => m[0]),
  ]
}

export function tokenBlockProblems(source: string): string[] {
  const out: string[] = []
  for (const sel of tokenBlockSelectors(source)) {
    const at = source.indexOf(sel)
    if (at < 0) {
      out.push(`src/index.css: token block not found: ${sel.split('\n').pop()}`)
      continue
    }
    const open = source.indexOf('{', at)
    let depth = 0
    let end = open
    for (let i = open; i < source.length; i++) {
      if (source[i] === '{') depth++
      else if (source[i] === '}' && --depth === 0) {
        end = i
        break
      }
    }
    // Comments keep their line breaks so line numbers stay true.
    const body = source.slice(open, end).replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    const firstLine = source.slice(0, open).split('\n').length
    for (const m of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
      const value = m[2].trim().replace(/var\(--[\w-]+/g, 'var(')
      if (FORBIDDEN.some((re) => re.test(value))) out.push(`src/index.css:${firstLine + body.slice(0, m.index).split('\n').length - 1}: ${m[1]}: ${m[2].trim()}`)
    }
  }
  return out
}

describe('token lint', () => {
  it('finds literal colour functions as well as hex (ui-correctness)', () => {
    const src = "a: 'rgb(148 163 184 / 0.35)'\nb: 'hsl(210 40% 50%)'\nc: 'oklch(0.7 0.1 250)'\nd: 'color-mix(in srgb, var(--ot-border) 45%, transparent)'"
    expect(rawColours('x.tsx', src)).toEqual(['x.tsx:1: rgb(148 163 184 / 0.35)', 'x.tsx:2: hsl(210 40% 50%)', 'x.tsx:3: oklch(0.7 0.1 250)'])
  })

  it('src/ui uses tokens instead of raw colours', () => {
    const found = Object.entries(ui).flatMap(([path, src]) => rawColours(path.replace(/^\.\.\//, 'src/ui/'), src))
    expect(found).toEqual([])
  })

  it('screens in src/app use tokens instead of raw colours', () => {
    const skip = new Set([...REDESIGN_ALLOW_LIST, ...NOT_YET_MIGRATED])
    const found = Object.entries(app)
      .map(([path, src]) => [path.replace(/^\.\.\/\.\.\//, 'src/'), src] as const)
      .filter(([path]) => !skip.has(path))
      .flatMap(([path, src]) => rawColours(path, src))
    expect(found).toEqual([])
  })

  it('component style classes in index.css use tokens', () => {
    if (NOT_YET_MIGRATED.includes('src/index.css')) return
    const found = componentLayers(css).flatMap(({ text, line }) =>
      rawColours('src/index.css', text).map((f) => f.replace(/:(\d+):/, (_, n) => `:${Number(n) + line - 1}:`)),
    )
    expect(found).toEqual([])
  })

  it('the redesign allow-list only shrinks and names real files', () => {
    expect(REDESIGN_ALLOW_LIST.length).toBeLessThanOrEqual(REDESIGN_ALLOW_LIST_MAX)
    const files = new Set(Object.keys(app).map((p) => p.replace(/^\.\.\/\.\.\//, 'src/')))
    files.add('src/index.css')
    for (const f of [...REDESIGN_ALLOW_LIST, ...NOT_YET_MIGRATED]) expect(files.has(f), f).toBe(true)
  })

  it('detects raw classes, white and black, and hex literals', () => {
    expect(rawColours('x.tsx', '<div className="p-2 dark:bg-slate-200" style={{ color: "#fff" }} />')).toEqual([
      'x.tsx:1: dark:bg-slate-200',
      'x.tsx:1: #fff',
    ])
    expect(rawColours('x.tsx', '<div className="bg-white text-black/80 dark:bg-black/40" />')).toEqual([
      'x.tsx:1: bg-white',
      'x.tsx:1: text-black/80',
      'x.tsx:1: dark:bg-black/40',
    ])
    expect(rawColours('x.css', '  @apply border border-slate-300 bg-white;')).toEqual(['x.css:1: border-slate-300', 'x.css:1: bg-white'])
    expect(rawColours('x.tsx', '<div className="bg-surface text-muted rounded-card whitespace-nowrap" />')).toEqual([])
    expect(rawColours('x.tsx', '<Badge color="#a0522d">stored</Badge>')).toEqual([])
  })

  // Style lint over the screens (ux-overhaul, design-system "Token lint covers the
  // screens"): raw sizes, radii, shadows and legacy classes, and native titles.
  const appFiles = Object.entries(app).map(([path, src]) => [path.replace(/^\.\.\/\.\.\//, 'src/'), src] as const)

  // Stories are examples (the foundations show the legacy classes on purpose); the rules below skip them.
  const uiCode = Object.entries(ui).filter(([path]) => !/\.stories\.tsx$/.test(path))

  it('shared UI uses no raw sizes, radii, shadows or legacy classes', () => {
    const found = uiCode.flatMap(([path, src]) => rawStyles(path.replace(/^\.\.\//, 'src/ui/'), src)).map(format)
    expect(found).toEqual([])
  })

  it('the component classes in index.css use the type, radius and shadow tokens', () => {
    const found = componentLayers(css).flatMap(({ text, line }) =>
      rawStyles('src/index.css', text).map((f) => ({ ...f, line: f.line + line - 1 })),
    ).map(format)
    expect(found).toEqual([])
  })

  it('the legacy btn-*, .input and .kbd classes stay removed (ux-overhaul task 8.8)', () => {
    const legacy = [...css.matchAll(/(?<![\w-])\.(?:btn|btn-primary|btn-secondary|btn-ghost|btn-danger|input|kbd)(?![\w-])/g)].map((m) => m[0])
    expect(legacy).toEqual([])
    const inScreens = [...uiCode, ...appFiles].flatMap(([path, src]) => rawStyles(path, src)).map(format)
    expect(inScreens).toEqual([])
  })

  it('screens off the not-yet list use no raw sizes, radii, shadows or legacy classes', () => {
    const skip = new Set(STYLE_NOT_YET_MIGRATED)
    const found = appFiles.filter(([path]) => !skip.has(path)).flatMap(([path, src]) => rawStyles(path, src)).map(format)
    expect(found).toEqual([])
  })

  it('settings panels take their card or flat section from SettingsSection (surfaces-v2 card tiers)', () => {
    const found = appFiles.flatMap(([path, src]) => handMadeSurfaces(path, src)).map(format)
    expect(found).toEqual([])
    // The rule itself: a hand-made card in a panel fails with file and line; the allowed classes do not.
    const panel = 'import { SettingsSection } from "../ui"\n<div className="space-y-2">\n<div className="rounded-card border border-default bg-surface p-4 shadow-1" />'
    expect(handMadeSurfaces('Fixture.tsx', panel).map(format)).toEqual(['Fixture.tsx:3: rounded-card border border-default bg-surface p-4 shadow-1'])
    expect(handMadeSurfaces('Fixture.tsx', 'import { SettingsSection } from "../ui"\n<div className="ui-section-flat" /><div className="ui-column" />')).toEqual([])
    expect(handMadeSurfaces('Board.tsx', '<div className="rounded-card shadow-1" />')).toEqual([])
  })

  it('screens off the not-yet list use the Tooltip primitive, not the native title', () => {
    const skip = new Set(TITLE_NOT_YET_MIGRATED)
    const found = [
      ...uiCode.flatMap(([path, src]) => nativeTitles(path.replace(/^\.\.\//, 'src/ui/'), src)),
      ...appFiles.filter(([path]) => !skip.has(path)).flatMap(([path, src]) => nativeTitles(path, src)),
    ].map(format)
    expect(found).toEqual([])
  })

  it('the moment is never a hover, focus or menu transition (tokens-v2 "Moment used for a hover")', () => {
    const screens = [
      ...uiCode.filter(([path]) => !path.endsWith('.stories.tsx')).map(([path, src]) => [path.replace(/^\.\.\//, 'src/ui/'), src] as const),
      ...appFiles,
    ]
    expect(screens.flatMap(([path, src]) => momentOnHover(path, src)).map(format)).toEqual([])
    // The rule itself: names the file and line; the moment on an entrance is fine.
    expect(momentOnHover('Row.tsx', '<a />\n<div className="transition duration-(--duration-moment) hover:bg-hover" />').map(format))
      .toEqual(['Row.tsx:2: transition duration-(--duration-moment) hover:bg-hover'])
    expect(momentOnHover('src/ui/overlay/Menu.tsx', '<div className="transition-opacity duration-(--duration-moment)" />')).toHaveLength(1)
    expect(momentOnHover('Sheet.tsx', '<div className="animate-in duration-(--duration-moment)" />')).toEqual([])
  })

  it('no focus ring is cancelled by outline-none (ux-fixes-phone)', () => {
    const screens = [
      ...uiCode.map(([path, src]) => [path.replace(/^\.\.\//, 'src/ui/'), src] as const),
      ...appFiles,
    ]
    expect(screens.flatMap(([path, src]) => cancelledRings(path, src)).map(format)).toEqual([])
    // The rule itself: names the file and line; an explicit style keeps the ring.
    expect(cancelledRings('Cell.tsx', '<a />\n<div className="outline-none focus-visible:outline-2 focus-visible:outline-focus" />').map(format))
      .toEqual(['Cell.tsx:2: outline-none focus-visible:outline-2 focus-visible:outline-focus'])
    expect(cancelledRings('Cell.tsx', '<div className="outline-none focus-visible:outline-2 focus-visible:outline-solid" />')).toEqual([])
    expect(cancelledRings('Cell.tsx', '<div className="focus-visible:outline-2 focus-visible:outline-focus" />')).toEqual([])
  })

  it('the not-yet lists only shrink and name files that still need them', () => {
    expect(STYLE_NOT_YET_MIGRATED.length).toBeLessThanOrEqual(STYLE_NOT_YET_MIGRATED_MAX)
    expect(TITLE_NOT_YET_MIGRATED.length).toBeLessThanOrEqual(TITLE_NOT_YET_MIGRATED_MAX)
    const byPath = new Map(appFiles)
    for (const f of STYLE_NOT_YET_MIGRATED) {
      expect(byPath.has(f), f).toBe(true)
      expect(rawStyles(f, byPath.get(f)!).length, `${f} is clean: remove it from STYLE_NOT_YET_MIGRATED`).toBeGreaterThan(0)
    }
    for (const f of TITLE_NOT_YET_MIGRATED) {
      expect(byPath.has(f), f).toBe(true)
      expect(nativeTitles(f, byPath.get(f)!).length, `${f} is clean: remove it from TITLE_NOT_YET_MIGRATED`).toBeGreaterThan(0)
    }
  })

  it('detects raw sizes, radii, shadows, legacy classes and native titles', () => {
    expect(rawStyles('x.tsx', '<div className="text-xs rounded-md shadow-lg sm:rounded-t-xl text-[11px] rounded shadow" />').map((f) => f.text))
      .toEqual(['text-xs', 'text-[11px]', 'rounded-md', 'sm:rounded-t-xl', 'rounded', 'shadow-lg', 'shadow'])
    expect(rawStyles('x.tsx', '<div className="text-meta rounded-card shadow-1 rounded-full shadow-none text-h1 shadow-(--x)" />')).toEqual([])
    expect(rawStyles('x.tsx', '<button className="btn-primary">x</button><input className="input" /><span className="kbd">q</span>').map((f) => f.text)).toEqual(['btn-primary', 'input', 'kbd'])
    expect(rawStyles('x.tsx', '<Button className="ui-btn">x</Button> const input = 1; <input aria-label="Filter query input" className={`a ${b} kbd`} />').map((f) => f.text)).toEqual(['kbd'])
    expect(rawStyles('x.tsx', '<div className="text-xs" /> // style-lint-allow')).toEqual([])
    expect(nativeTitles('x.tsx', '<button type="button" onClick={() => go(1)} title="Open">x</button>').map((f) => f.text)).toEqual(['<button title='])
    // Button and IconButton spread `title` onto their <button>: a native title the tooltip rule forbids.
    expect(nativeTitles('x.tsx', '<Button variant="ghost" title="x">Ask</Button>').map((f) => f.text)).toEqual(['<Button title='])
    expect(nativeTitles('x.tsx', '<IconButton icon="x" label="Close" title="x" />').map((f) => f.text)).toEqual(['<IconButton title='])
    expect(nativeTitles('x.tsx', '<Tooltip label="x"><Button>Ask</Button></Tooltip>')).toEqual([])
    expect(nativeTitles('x.tsx', '<Dialog title="Labels" onClose={close}><p>title=</p></Dialog>')).toEqual([])
    expect(nativeTitles('x.tsx', '<span title="x" /> {/* tooltip-lint-allow */}')).toEqual([])
  })

  // tokens-v2 D6, D10
  it('token blocks in index.css hold OKLCH only', () => {
    expect(tokenBlockProblems(css)).toEqual([])
  })

  it('the token-block rule names a hex, an rgb() and a named colour with their line', () => {
    const bad = css.replace('--ot-muted: oklch(0.47 0.028 262);', '--ot-muted: #526075;')
      .replace('--ot-scrim: oklch(0.1288 0.0406 264.7 / 0.35);', '--ot-scrim: rgb(2 6 23 / 0.35);')
      .replace('--ot-a-on-accent: oklch(1 0 0); }', '--ot-a-on-accent: white; }')
    const found = tokenBlockProblems(bad)
    expect(found).toHaveLength(3)
    expect(found[0]).toMatch(/^src\/index\.css:\d+: --ot-muted: #526075$/)
    const line = Number(/:(\d+):/.exec(found[0])![1])
    expect(bad.split('\n')[line - 1]).toContain('--ot-muted: #526075;')
    expect(found.some((f) => f.includes('rgb(2 6 23 / 0.35)'))).toBe(true)
    expect(found.some((f) => f.includes(': white'))).toBe(true)
  })

  it('screens and shared UI quiet text with tones, not opacity or alpha', () => {
    const found = [
      ...uiCode.flatMap(([path, src]) => toneProblems(path.replace(/^\.\.\//, 'src/ui/'), src)),
      ...appFiles.flatMap(([path, src]) => toneProblems(path, src)),
    ]
    expect(found).toEqual([])
  })

  it('the tone rule catches opacity and alpha on text, and lets show/hide, disabled and marked ghosts pass', () => {
    expect(toneProblems('x.tsx', '<span className="text-meta opacity-60">a</span>\n<b className="text-default/70" />\n<i className="border-soft/50" />')).toEqual([
      'x.tsx:1: opacity-60', 'x.tsx:2: text-default/70', 'x.tsx:3: border-soft/50',
    ])
    expect(toneProblems('x.tsx', '<button className="disabled:opacity-50 opacity-0 group-hover:opacity-100 bg-faint/30 border-accent/40" />')).toEqual([])
    expect(toneProblems('x.tsx', "const ghost = 'opacity-40' // tone-lint-allow: a dragged ghost")).toEqual([])
  })
})
