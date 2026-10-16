import { describe, expect, it } from 'vitest'
import css from '../../index.css?raw'
import { STYLE_NOT_YET_MIGRATED, STYLE_NOT_YET_MIGRATED_MAX, TITLE_NOT_YET_MIGRATED, TITLE_NOT_YET_MIGRATED_MAX } from './notYetMigrated'
import { format, nativeTitles, rawStyles } from './styleLint'

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

/** A line marked `token-lint-allow` keeps a fixed colour on purpose (for example a QR code). */
export function rawColours(path: string, source: string): string[] {
  return source.split('\n').flatMap((line, i) => line.includes('token-lint-allow') ? [] :
    [...line.matchAll(RAW_CLASS), ...(/\bcolor=/.test(line) ? [] : line.matchAll(HEX))].map((m) => `${path}:${i + 1}: ${m[0]}`),
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

describe('token lint', () => {
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

  it('screens off the not-yet list use the Tooltip primitive, not the native title', () => {
    const skip = new Set(TITLE_NOT_YET_MIGRATED)
    const found = [
      ...uiCode.flatMap(([path, src]) => nativeTitles(path.replace(/^\.\.\//, 'src/ui/'), src)),
      ...appFiles.filter(([path]) => !skip.has(path)).flatMap(([path, src]) => nativeTitles(path, src)),
    ].map(format)
    expect(found).toEqual([])
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
    expect(nativeTitles('x.tsx', '<Dialog title="Labels" onClose={close}><p>title=</p></Dialog>')).toEqual([])
    expect(nativeTitles('x.tsx', '<span title="x" /> {/* tooltip-lint-allow */}')).toEqual([])
  })
})
