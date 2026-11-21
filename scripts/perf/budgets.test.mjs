// docs/performance.md shows the limits of scripts/perf/budgets.json; this keeps the
// two equal (OpenSpec change performance-10k, "Published performance budgets"), and
// checks the verdict shared by the benchmark's reports. `make repo-check`.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { evaluate, loadBudgets, median } from './budgets.mjs'

const budgets = loadBudgets()
const page = readFileSync(new URL('../../docs/performance.md', import.meta.url), 'utf8')

// The column of each setting in the page's tables.
const COLUMNS = { desktop: 'Desktop', phone: 'Phone profile', 'device-android': 'Android', 'device-ios': 'iPhone', server: 'Server', pi4: 'Raspberry Pi 4' }

/** Every row of every table whose first cell starts with a `metric-id`: id -> {column: cell}. */
export function tableRows(markdown) {
  const rows = new Map()
  let header = null
  for (const line of markdown.split('\n')) {
    if (!line.startsWith('|')) { header = null; continue }
    const cells = line.split('|').slice(1, -1).map((c) => c.trim())
    if (cells.every((c) => /^-+$/.test(c))) continue
    if (!header) { header = cells; continue }
    const id = /^`([a-z0-9-]+)`/.exec(cells[0])?.[1]
    if (id) rows.set(id, Object.fromEntries(header.map((h, i) => [h, cells[i]])))
  }
  return rows
}

/** The differences between the budgets and the page, one line per metric and setting. */
export function differences(b, markdown) {
  const rows = tableRows(markdown)
  const out = []
  for (const m of b.metrics) {
    const row = rows.get(m.id)
    if (!row) { out.push(`${m.id}: not in docs/performance.md`); continue }
    if (row.Unit !== m.unit) out.push(`${m.id}: unit ${row.Unit} on the page, ${m.unit} in budgets.json`)
    for (const [setting, column] of Object.entries(COLUMNS)) {
      if (!(column in row)) continue
      const shown = row[column] === '—' ? undefined : Number(row[column].replace(/,/g, ''))
      if (shown !== m.limits[setting]) out.push(`${m.id}, ${setting}: ${row[column]} on the page, ${m.limits[setting] ?? '—'} in budgets.json`)
    }
  }
  for (const id of rows.keys()) if (!b.metrics.some((m) => m.id === id)) out.push(`${id}: on the page, not in budgets.json`)
  return out
}

test('docs/performance.md shows every budget of budgets.json', () => {
  assert.deepEqual(differences(budgets, page), [])
})

test('a raised budget without the page fails naming the metric', () => {
  const raised = structuredClone(budgets)
  raised.metrics.find((m) => m.id === 'search-keystroke').limits.desktop = 120
  assert.deepEqual(differences(raised, page), ['search-keystroke, desktop: 100 on the page, 120 in budgets.json'])
})

test('every metric has a unit, a name and limits in known settings', () => {
  const settings = new Set(Object.keys(budgets.settings))
  for (const m of budgets.metrics) {
    assert.ok(m.name && ['ms', 's', 'MB'].includes(m.unit), m.id)
    for (const s of Object.keys(m.limits)) assert.ok(settings.has(s), `${m.id}: ${s}`)
  }
  for (const s of budgets.gated) assert.ok(settings.has(s), s)
})

test('the verdict is the median of the runs against the limit', () => {
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(median([4, 1, 2, 3]), 2.5)
  const r = evaluate(budgets, 'desktop', { 'first-sync': [40, 41, 45, 20, 50] })
  const sync = r.metrics.find((m) => m.id === 'first-sync')
  assert.equal(sync.ok, false)
  assert.equal(sync.failure, 'first sync, desktop, 41 s, budget 30 s')
  assert.match(r.metrics.find((m) => m.id === 'cold-start').failure, /not measured/)
})
