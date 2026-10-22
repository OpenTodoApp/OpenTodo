// The brand rasters are current (OpenSpec change sidebar-v2, design D3): every
// output matches the stamp written by scripts/brand-icons.mjs, and the stamp was
// written from today's brand.svg. Runs without a browser.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { OUTPUTS, ROOT, SOURCE, STAMP, colourSvg, sha256 } from './brand-icons.mjs'

const read = (p) => readFileSync(join(ROOT, p))
const stamp = JSON.parse(read(STAMP))
const regenerate = 'run `node scripts/brand-icons.mjs` and commit the files'

test('the stamp was written from the current brand.svg', () => {
  assert.equal(stamp.source, sha256(read(SOURCE)), `${SOURCE} changed: ${regenerate}`)
})

test('every output exists and matches the stamp', () => {
  assert.deepEqual(Object.keys(stamp.outputs).sort(), OUTPUTS.map((o) => o.path).sort())
  for (const { path } of OUTPUTS) {
    assert.ok(existsSync(join(ROOT, path)), `${path} is missing: ${regenerate}`)
    assert.equal(sha256(read(path)), stamp.outputs[path], `${path} differs from its render: ${regenerate}`)
  }
})

test('the favicon is the colour symbol itself', () => {
  assert.equal(read('web/public/favicon.svg').toString(), colourSvg(read(SOURCE).toString()))
})

test('the maskable icon fills its square', () => {
  const svg = colourSvg(read(SOURCE).toString(), { full: true })
  assert.doesNotMatch(svg, / rx="/)
  assert.match(colourSvg(read(SOURCE).toString()), / rx="14"/)
})

test('PNG outputs have the declared pixel size', () => {
  for (const { path, size } of OUTPUTS.filter((o) => !o.svg)) {
    const png = read(path)
    assert.equal(png.toString('latin1', 1, 4), 'PNG', path)
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [size, size], path)
  }
})
