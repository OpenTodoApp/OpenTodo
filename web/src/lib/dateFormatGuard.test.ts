// Guard (OpenSpec date-time-preferences, design D3): every user-facing date and
// time goes through lib/dates.ts so it follows the user's preferences. A direct
// toLocaleDateString / toLocaleString / toLocaleTimeString call anywhere else in
// web/src fails this test. The project has no ESLint, so a grep does the job.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..')
const CALL = /\.toLocale(Date|Time)?String\(/g

/** Files where direct calls are the point. */
const ALLOWED_FILES = new Set([
  'lib/dates.ts', // the formatting module itself
])

/**
 * Calls that format something other than a date for display. `n.toLocaleString('en')`
 * groups the digits of a count (tokens, bytes) with a fixed English separator; it
 * is not a date and has nothing to follow.
 */
const ALLOWED_CALLS = [/\.toLocaleString\('en'\)/g]

/** Direct calls in `source` that the guard reports. */
export function offendingCalls(source: string): number {
  let text = source
  for (const re of ALLOWED_CALLS) text = text.replace(re, '')
  return (text.match(CALL) ?? []).length
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    if (!/\.(ts|tsx)$/.test(name) || /\.(test|stories)\.(ts|tsx)$/.test(name)) return []
    return [path]
  })
}

describe('date formatting guard', () => {
  it('catches a planted call and lets the allowed ones through', () => {
    expect(offendingCalls('const s = new Date(ms).toLocaleString()')).toBe(1)
    expect(offendingCalls("d.toLocaleDateString(undefined, { weekday: 'long' }); d.toLocaleTimeString()")).toBe(2)
    expect(offendingCalls("`${n.toLocaleString('en')} tokens`")).toBe(0)
    expect(offendingCalls("n.toLocaleString('de')")).toBe(1)
  })

  it('finds no direct toLocale*String call outside lib/dates.ts', () => {
    const found: string[] = []
    for (const file of sourceFiles(SRC)) {
      const rel = relative(SRC, file).split('\\').join('/')
      if (ALLOWED_FILES.has(rel)) continue
      if (offendingCalls(readFileSync(file, 'utf8')) > 0) found.push(rel)
    }
    expect(found, 'use formatDate / formatTime / formatInstant from lib/dates.ts (or useDateTimeFormat) instead').toEqual([])
  })
})
