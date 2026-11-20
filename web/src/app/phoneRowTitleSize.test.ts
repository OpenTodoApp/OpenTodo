// The phone task-row title size follows the theme's list size (type.list; docs/themes.md,
// "scales with the browser's font size"). On a phone the title was a hard-coded size, so a
// theme that set the list size changed the sidebar but not task rows (Discord report).
// Every [data-row-title] font-size must come from --ot-text-list, so the theme reaches it.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8')

describe('row title size', () => {
  it('reads the list token everywhere it sets a size, never a fixed one', () => {
    const decls = [...css.matchAll(/\[data-row-title\][^{}]*\{[^}]*?font-size:[^;}]+;/g)].map((m) => m[0])
    expect(decls.length, 'at least one [data-row-title] font-size rule').toBeGreaterThan(0)
    for (const d of decls) {
      const size = d.match(/font-size:\s*([^;]+);/)![1]
      expect(size, `[data-row-title] font-size "${size}" must use --ot-text-list`).toContain('--ot-text-list')
    }
  })
})
