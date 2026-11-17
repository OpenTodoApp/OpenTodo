// The knip wrapper (scripts/knip.mjs): what fails outright and the unused-export ratchet.
import { describe, expect, it } from 'vitest'
import { findings, problems } from './knip.mjs'

const report = {
  files: ['src/app/Dead.tsx'],
  issues: [
    { file: 'package.json', owners: [], dependencies: [{ name: 'left-pad' }], exports: [] },
    { file: 'src/a.ts', exports: [{ name: 'one', line: 1 }, { name: 'two', line: 2 }], duplicates: [[{ name: 'A' }, { name: 'default' }]], classMembers: { K: [{ name: 'm' }] } },
  ],
}

describe('knip wrapper', () => {
  it('lists every finding', () => {
    expect(findings(report)).toEqual([
      'files: src/app/Dead.tsx',
      'dependencies: package.json: left-pad',
      'exports: src/a.ts: one',
      'exports: src/a.ts: two',
      'duplicates: src/a.ts: A = default',
      'classMembers: src/a.ts: m',
    ])
  })

  it('fails on anything but unused exports, and on exports off the ratchet', () => {
    const lines = findings(report)
    expect(problems(lines, 2)).toEqual(lines.filter((l) => !l.startsWith('exports: ')))
    expect(problems(['exports: a: x'], 1)).toEqual([])
    expect(problems(['exports: a: x', 'exports: a: y'], 1).at(-1)).toMatch(/^unused exports: 2, more than 1/)
    expect(problems([], 1)).toEqual(['unused exports: 0, fewer than 1; lower MAX_UNUSED_EXPORTS in web/scripts/knip.mjs to 0'])
  })
})
