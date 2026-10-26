// node --test scripts/bundle-budget.test.mjs  (make repo-check)
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { measure, staticImports } from './bundle-budget.mjs'

test('bundle-budget: static imports, not dynamic ones', () => {
  const code = 'import{a as b}from"./a-1.js";import"./b-2.js";export{c}from"../c-3.js";const l=()=>import("./lazy-4.js");const d=["assets/dep-5.js"];'
  assert.deepEqual(staticImports(code), ['./a-1.js', './b-2.js', '../c-3.js'])
})

test('bundle-budget: the entry and its static closure, each chunk counted once', () => {
  const dist = mkdtempSync(join(tmpdir(), 'bundle-budget-'))
  try {
    mkdirSync(join(dist, 'assets'))
    writeFileSync(join(dist, 'index.html'), '<script type="module" crossorigin src="/assets/main-1.js"></script>')
    writeFileSync(join(dist, 'assets/main-1.js'), 'import"./a-2.js";import"./b-3.js";const x=()=>import("./lazy-4.js")')
    writeFileSync(join(dist, 'assets/a-2.js'), 'import"./b-3.js";export const a=1')
    writeFileSync(join(dist, 'assets/b-3.js'), 'export const b=2')
    writeFileSync(join(dist, 'assets/lazy-4.js'), 'x'.repeat(100000))
    const m = measure(dist)
    assert.equal(m.entry, 'assets/main-1.js')
    assert.equal(m.initialChunks, 3)
    assert.ok(m.initialGzip > m.entryGzip && m.initialGzip < 1000)
  } finally {
    rmSync(dist, { recursive: true, force: true })
  }
})
