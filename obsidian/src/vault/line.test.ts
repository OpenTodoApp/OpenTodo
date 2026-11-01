import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { lineFields, parseTaskLine, printLine, taskLineParts } from './line'

const repo = new URL('../../../', import.meta.url).pathname
const vectors = JSON.parse(readFileSync(join(repo, 'internal/vault/testdata/lines.vectors.json'), 'utf8')) as {
  vectors: { name: string; line: string; task: boolean; parse?: Record<string, unknown>; fields?: Record<string, string>; problems?: string[]; printed?: string }[]
}

// The same file internal/vault/linevectors_test.go runs against the Go grammar.
describe('task-line vectors', () => {
  it('has the cases', () => expect(vectors.vectors.length).toBeGreaterThanOrEqual(30))
  for (const v of vectors.vectors) {
    it(v.name, () => {
      const l = parseTaskLine(v.line)
      expect(l !== null).toBe(v.task)
      if (!l) return
      const { has, ...parsed } = l
      void has
      expect(parsed).toEqual(v.parse)
      const { fields, problems } = lineFields(l)
      expect(fields).toEqual(v.fields)
      expect(problems).toEqual(v.problems ?? [])
      expect(printLine(l)).toBe(v.printed)
    })
  }
})

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.md') ? [p] : []
  })
}

// Every task line of the fixture vault reads as the task expected.json records.
describe('fixture vault', () => {
  const root = join(repo, 'internal/vault/testdata/vault')
  const expected = JSON.parse(readFileSync(join(root, 'expected.json'), 'utf8')) as { task: Record<string, Record<string, unknown>>; label: Record<string, { name: string }> }
  const lines = walk(root).flatMap((f) => readFileSync(f, 'utf8').split('\n').filter((s) => taskLineParts(s)))

  it('has task lines', () => expect(lines.length).toBeGreaterThan(5))
  for (const raw of lines) {
    const l = parseTaskLine(raw)!
    it(`${l.id}: ${l.title}`, () => {
      const want = expected.task[l.id]
      expect(want, `task ${l.id} in expected.json`).toBeDefined()
      const { fields, problems } = lineFields(l)
      expect(problems).toEqual([])
      if (typeof want.title === 'string') expect(l.title).toBe(want.title)
      expect(Number(fields.priority)).toBe(want.priority ?? 4)
      const due = want.due as { date: string; time?: string; tz?: string } | null | undefined
      expect(fields.due).toBe(due ? `${due.date}|${due.time ?? ''}|${due.tz ?? ''}` : '')
      if (want.estimate_minutes) expect(Number(fields.estimate)).toBe(want.estimate_minutes)
      if (want.deadline) expect(fields.deadline).toBe(want.deadline)
      expect(l.done).toBe(want.completed_at !== null && want.completed_at !== undefined)
      const names = ((want.labels as string[] | undefined) ?? []).map((id) => expected.label[id].name.toLowerCase().replace(/\s+/g, '-'))
      expect(l.tags.map((t) => t.toLowerCase())).toEqual(names)
    })
  }
})
