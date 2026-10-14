import { describe, expect, it } from 'vitest'

// OpenSpec design-system "Semantic design tokens": shared UI code styles colour
// through tokens, never raw Tailwind palette classes or hex literals. Legacy
// screens in src/app are exempt until their redesign change migrates them.
const sources = import.meta.glob<string>('../**/*.tsx', { query: '?raw', import: 'default', eager: true })

const PALETTE = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const RAW_CLASS = new RegExp(`(?<![\\w-])(?:[\\w-]+:)*(?:bg|text|border|ring|fill|stroke|outline|divide|placeholder|decoration|shadow|accent|caret|from|via|to)-(?:${PALETTE})-\\d{2,3}\\b`, 'g')
const HEX = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?:[0-9a-fA-F]{2})?\b/g

export function rawColours(path: string, source: string): string[] {
  return source.split('\n').flatMap((line, i) =>
    [...line.matchAll(RAW_CLASS), ...line.matchAll(HEX)].map((m) => `${path}:${i + 1}: ${m[0]}`),
  )
}

describe('token lint', () => {
  it('src/ui uses tokens instead of raw colours', () => {
    const found = Object.entries(sources).flatMap(([path, src]) => rawColours(path.replace(/^\.\.\//, 'src/ui/'), src))
    expect(found).toEqual([])
  })

  it('detects raw classes and hex literals', () => {
    expect(rawColours('x.tsx', '<div className="p-2 dark:bg-slate-200" style={{ color: "#fff" }} />')).toEqual([
      'x.tsx:1: dark:bg-slate-200',
      'x.tsx:1: #fff',
    ])
    expect(rawColours('x.tsx', '<div className="bg-surface text-muted rounded-card" />')).toEqual([])
  })
})
