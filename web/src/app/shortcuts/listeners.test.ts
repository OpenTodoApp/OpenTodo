// One `keydown` listener on the window (OpenSpec change ux-overhaul, keyboard-
// shortcuts "One shortcut registry with scopes"): no file under web/src/app adds
// its own, except the dispatcher. The overlay stack's modal Escape (which closes
// the topmost dialog and is not a shortcut) is the one exemption.
import { describe, expect, it } from 'vitest'

const sources = import.meta.glob('../**/*.{ts,tsx}', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>
const ALLOWED = new Set(['./dispatch.ts', '../overlay/stack.ts'])

describe('keydown listeners', () => {
  it('only the dispatcher listens to keydown on the window', () => {
    const offenders: string[] = []
    for (const [file, src] of Object.entries(sources)) {
      if (/\.(test|stories)\.tsx?$/.test(file) || ALLOWED.has(file)) continue
      const lines = src.split('\n')
      lines.forEach((line, i) => {
        if (/\b(window|target|document)\.addEventListener\(\s*['"]keydown['"]/.test(line) && !/^\s*\/\//.test(line)) offenders.push(`${file}:${i + 1}`)
      })
    }
    expect(offenders).toEqual([])
  })
})
