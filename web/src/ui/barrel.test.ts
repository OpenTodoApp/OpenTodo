// Screens import shared UI from the barrel only (OpenSpec change ux-overhaul,
// design D4): one import path, so a primitive can move or split without touching
// the screens, and nothing under src/ui is reached around the barrel.
import { describe, expect, it } from 'vitest'

const app = import.meta.glob<string>(['../app/**/*.ts', '../app/**/*.tsx', '!../app/**/*.test.ts', '!../app/**/*.test.tsx', '!../app/**/*.testkit.tsx', '!../app/**/*.stories.tsx'], { query: '?raw', import: 'default', eager: true })

/** `from '../ui/<file>'` at any depth, excluding the barrel itself (`'../ui'` or `'../ui/index'`). */
export function deepUiImports(path: string, source: string): string[] {
  return source.split('\n').flatMap((line, i) => {
    const m = /from\s+['"]((?:\.\.\/)+)ui\/([^'"]+)['"]/.exec(line)
    return m && m[2] !== 'index' ? [`${path}:${i + 1}: ${m[0]}`] : []
  })
}

describe('UI barrel', () => {
  it('screens reach shared UI through src/ui/index.ts only', () => {
    const found = Object.entries(app).flatMap(([p, src]) => deepUiImports(p.replace(/^\.\.\//, 'src/'), src))
    expect(found).toEqual([])
  })

  it('detects a deep import', () => {
    expect(deepUiImports('x.tsx', "import { Icon } from '../../ui/Icon'")).toEqual(["x.tsx:1: from '../../ui/Icon'"])
    expect(deepUiImports('x.tsx', "import { Icon } from '../ui'")).toEqual([])
    expect(deepUiImports('x.tsx', "import type { HueName } from '../ui'")).toEqual([])
  })
})
