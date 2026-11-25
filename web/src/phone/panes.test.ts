// A phone screen is a pane (OpenSpec change phone-ui-trial, design D9): it fills what
// holds it, never the window, so two can sit side by side on a tablet later. This
// refuses the units and classes that size a thing by the window, and anything pinned
// to the window instead of the pane.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = new URL('.', import.meta.url).pathname
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n)
  return statSync(p).isDirectory() ? walk(p) : [p]
})

/** What sizes or pins by the window: viewport units, `w-screen`/`h-screen`, `fixed`. */
export function windowBound(source: string): string[] {
  const found: string[] = []
  const code = source.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
  for (const m of code.matchAll(/\b\d+(?:\.\d+)?(?:d|s|l)?v[wh]\b|\b[wh]-(?:d|s|l)?screen\b/g)) found.push(m[0])
  // `fixed` as a position: the class beside its offsets, or the style.
  for (const m of code.matchAll(/(?<=["'`\s])fixed(?=\s+(?:inset|top|bottom|left|right|start|end|z)-)|position:\s*['"]?fixed/g)) found.push(m[0].includes('position') ? 'position: fixed' : 'fixed')
  return found
}

describe('phone screens are panes', () => {
  it('recognises what binds a screen to the window', () => {
    expect(windowBound('className="w-screen"')).toEqual(['w-screen'])
    expect(windowBound("style={{ width: '100vw' }}")).toEqual(['100vw'])
    expect(windowBound('className="max-h-[80dvh]"')).toEqual(['80dvh'])
    expect(windowBound('className="fixed inset-x-0 bottom-0"')).toEqual(['fixed'])
    expect(windowBound('className="sticky top-0 h-full min-h-full" // 100vw in a comment')).toEqual([])
    expect(windowBound("style={{ position: 'fixed' }}")).toEqual(['position: fixed'])
    expect(windowBound('const fixed = (x: Fact) => readOnly; <FactRow fixed />')).toEqual([])
  })

  it('no file of the phone UI sizes or pins by the window', () => {
    const files = walk(root).filter((f) => /\.tsx?$/.test(f) && !/\.(test|stories)\.tsx?$/.test(f) && !f.includes('/stories/'))
    expect(files.length).toBeGreaterThan(8)
    const problems = files.flatMap((f) => windowBound(readFileSync(f, 'utf8')).map((hit) => `${f.slice(root.length)}: ${hit}`))
    expect(problems).toEqual([])
  })
})
