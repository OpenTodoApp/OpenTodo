// node --test scripts/contracts.test.mjs  (make repo-check)
// The index of Go/TypeScript contracts, docs/contracts.md, against the repository: every
// fixture it lists exists and is named by the files that read it, and every fixture-like file
// is listed (wave 5 of the 2026-10 audit, M6).
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const doc = readFileSync(join(ROOT, 'docs/contracts.md'), 'utf8')
const paths = (cell) => [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1])

/** The table rows: { name, fixture, readers: [file] }. */
function rows() {
  const out = []
  for (const line of doc.split('\n')) {
    const cells = line.split('|').slice(1, -1).map((c) => c.trim())
    if (cells.length !== 7 || cells[0] === 'Contract' || cells[0].startsWith('---')) continue
    out.push({ name: cells[0], fixture: paths(cells[3])[0], readers: [...paths(cells[4]), ...paths(cells[5])] })
  }
  return out
}

test('contracts: every fixture exists and every listed reader names it', () => {
  const table = rows()
  assert.ok(table.length >= 20, `only ${table.length} contracts read from docs/contracts.md`)
  for (const r of table) {
    assert.ok(r.fixture && existsSync(join(ROOT, r.fixture)), `${r.name}: the fixture ${r.fixture} is missing`)
    const go = r.readers.filter((f) => f.endsWith('.go'))
    const ts = r.readers.filter((f) => /\.tsx?$/.test(f))
    assert.ok(go.length && ts.length, `${r.name}: needs a Go and a TypeScript reader`)
    for (const f of r.readers) {
      assert.ok(existsSync(join(ROOT, f)), `${r.name}: ${f} does not exist`)
      assert.ok(readFileSync(join(ROOT, f), 'utf8').includes(basename(r.fixture)), `${r.name}: ${f} does not name ${basename(r.fixture)}`)
    }
  }
})

test('contracts: every fixture-like file is in the index', () => {
  const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n')
  const fixtures = files.filter((f) => /(\.vectors|_vectors|_fixture|\.fixtures?)\.json$/.test(f))
  assert.ok(fixtures.length >= 20)
  for (const f of fixtures) assert.ok(doc.includes(f), `${f} is not in docs/contracts.md: add its row (or name it under the fixtures that are not shared)`)
})
