// Guard (OpenSpec change day-boundary, design D8): "which day is it" has one
// answer, the logical today, asked through `logicalToday()` in pure code or
// `useToday()` in a component, and "the day of an instant" through `logicalDay()`.
// `todayISO()` without an argument (or `todayISO(new Date())`, or `todayISO`
// passed as a function) is the calendar date of now and ignores the user's day
// start; outside lib/dates.ts and the allow-list it fails this test, so the next
// screen cannot bring the midnight day back. `todayISO(instant)` stays allowed: it
// formats a given moment's calendar date.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..')

/** Files that want the calendar date of now on purpose. */
const ALLOWED_FILES = new Map([
  ['lib/dates.ts', 'the module that defines todayISO and logicalToday'],
  ['app/RemindersField.tsx', 'a reminder is an instant: "tomorrow 09:00" is the next calendar day'],
])

/** Comments are prose, not calls. */
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const PATTERNS = [
  /\btodayISO\(\s*\)/g, // the calendar date of now
  /\btodayISO\(\s*new Date\(\s*\)\s*\)/g, // the same, spelled out
  /\btodayISO\b(?!\s*\()/g, // passed as a function, e.g. useState(todayISO)
]

/** Calls in `source` that read today's calendar date instead of the logical today. */
export function offendingCalls(source: string): number {
  const text = stripComments(source).replace(/^\s*import[\s\S]*?from\s+['"][^'"]+['"]/gm, '')
  return PATTERNS.reduce((n, re) => n + (text.match(re) ?? []).length, 0)
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    if (!/\.(ts|tsx)$/.test(name) || /\.(test|stories)\.(ts|tsx)$/.test(name) || /\.testkit\.(ts|tsx)$/.test(name)) return []
    return [path]
  })
}

describe('logical today guard', () => {
  it('catches a planted call and lets the allowed forms through', () => {
    expect(offendingCalls('const today = todayISO()')).toBe(1)
    expect(offendingCalls('const [d] = useState(todayISO)')).toBe(1)
    expect(offendingCalls('due: { date: todayISO(new Date()) }')).toBe(1)
    expect(offendingCalls('const day = todayISO(new Date(ms))')).toBe(0)
    expect(offendingCalls('const day = todayISO(d)')).toBe(0)
    expect(offendingCalls("import { formatDate, todayISO } from '../lib/dates'\nconst x = todayISO(at)")).toBe(0)
    expect(offendingCalls('// todayISO() is the calendar date\nconst t = logicalToday()')).toBe(0)
    expect(offendingCalls('/** uses `todayISO()` */ const t = useToday()')).toBe(0)
  })

  it('finds no calendar "today" outside lib/dates.ts and the allow-list', () => {
    for (const file of ALLOWED_FILES.keys()) expect(existsSync(join(SRC, file)), `allow-listed ${file} exists`).toBe(true)
    const found: string[] = []
    for (const file of sourceFiles(SRC)) {
      const rel = relative(SRC, file).split('\\').join('/')
      if (ALLOWED_FILES.has(rel)) continue
      if (offendingCalls(readFileSync(file, 'utf8')) > 0) found.push(rel)
    }
    expect(found, 'use logicalToday() (or useToday() in a component) for "today", logicalDay(ms) for the day of an instant').toEqual([])
  })
})
