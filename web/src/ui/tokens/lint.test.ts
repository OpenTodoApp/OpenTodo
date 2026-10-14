import { describe, expect, it } from 'vitest'
import css from '../../index.css?raw'

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
export const REDESIGN_ALLOW_LIST: readonly string[] = [
  // labels-and-menus
  'src/app/LabelsView.tsx',
  'src/app/ViewsView.tsx',
  'src/app/Sections.tsx',
  'src/app/ProjectHeader.tsx',
]
const REDESIGN_ALLOW_LIST_MAX = 4

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
})
