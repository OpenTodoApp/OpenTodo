// The fixture vault (internal/vault/testdata/vault), as TestFixtureVault in Go:
// every file parses to the recorded entities and prints back byte for byte.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { noteText, parseDoc, printDoc, walk } from './doc'
import * as S from './store'
import { View } from './view'

const root = join(new URL('../../../', import.meta.url).pathname, 'internal/vault/testdata/vault')

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.md') ? [p] : []
  })
}

describe('fixture vault', () => {
  const expected = JSON.parse(readFileSync(join(root, 'expected.json'), 'utf8')) as Record<string, Record<string, Record<string, unknown>>>
  const s: S.Store = {}
  for (const [entity, byID] of Object.entries(expected)) {
    for (const [id, fields] of Object.entries(byID)) for (const [field, value] of Object.entries(fields)) S.apply(s, { id: '', entity, entityId: id, field, value, ts: 1, device: 'fixture' })
  }
  const v = new View(s, null, 'UTC', new Set())
  const layout = v.layout()
  const byPath = new Map([...layout].map(([pid, p]) => [p, pid]))
  const labels = v.labelSlugs()
  const sections = (pid: string) => {
    const names = new Set(v.sectionsOf(pid).map((x) => v.text('section', x, 'name').toLowerCase()))
    return (n: string) => names.has(n.toLowerCase())
  }
  const paths = files(root).map((p) => relative(root, p))

  it('has one file per project', () => expect(paths.sort()).toEqual([...layout.values()].sort()))
  for (const p of paths) {
    it(`${p} parses to the entities and prints back byte for byte`, () => {
      const text = readFileSync(join(root, p), 'utf8')
      const pid = byPath.get(p)!
      const doc = parseDoc(text, sections(pid))
      expect(doc.id).toBe(pid)
      const extra: Record<string, string> = {}
      walk(doc, (_b, parent, n) => {
        extra[n.line.id] = n.line.trailing
        const r = S.get(s, 'task', n.line.id)
        expect(S.str(r, 'parent_id')).toBe(parent ? parent.line.id : '')
        expect(noteText(n)).toBe(S.str(r, 'description'))
        const want = v.line(n.line.id, labels, n.line.trailing)
        expect({ ...n.line, indent: '', has: {}, created: '' }).toEqual({ ...want, has: {} })
      })
      const out = printDoc(v.render({ project: pid, tmpl: doc, printed: () => true, extra, labels, skip: new Set() }))
      expect(out).toBe(text)
      const again = printDoc(v.render({ project: pid, tmpl: parseDoc(out, sections(pid)), printed: () => true, extra, labels, skip: new Set() }))
      expect(again).toBe(out)
    })
  }
})
