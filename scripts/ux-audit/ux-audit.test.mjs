// Tests of the screen inventory and the audit report (OpenSpec change
// ux-audit-three-widths, tasks 1.2, 3.3, 3.4). No browser: run by `make ui-lint`.
// The page measurements have their own browser tests in measure.test.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { inventory, inventoryProblems, layoutNames, routerViews } from './inventory.mjs'
import { rank, score } from './report.mjs'
import { coverage } from './stories.mjs'
import { EventEmitter } from 'node:events'
import { createTrace, markScreen, tracePage, traceOf } from './pageTrace.mjs'

test('the inventory agrees with the router, the layout check and itself', () => {
  assert.deepEqual(inventoryProblems(), [])
  assert.ok(inventory().length >= 60, `at least 60 entries (has ${inventory().length})`)
})

test('a router view without an entry is named', () => {
  const entries = inventory().filter((e) => e.route !== 'trash')
  assert.ok(inventoryProblems(entries).includes('router view "trash" has no inventory entry'))
})

test('a renamed layout-check screen is named with the entry', () => {
  const entries = inventory().map((e) => (e.id === 'today' ? { ...e, layoutCheck: 'today-old' } : e))
  assert.ok(inventoryProblems(entries).includes('today: layout-check screen "today-old" does not exist'))
})

test('an entry outside the layout check passes with a reason, fails without one', () => {
  const base = inventory()
  assert.deepEqual(inventoryProblems(base.filter((e) => e.id === 'someday'), ['someday']), [])
  const bare = base.map((e) => (e.id === 'someday' ? { ...e, layoutCheckReason: undefined } : e))
  assert.ok(inventoryProblems(bare).includes('someday: not in the layout check and gives no reason'))
})

test('core is true exactly for daily and weekly entries', () => {
  const wrong = inventory().map((e) => (e.id === 'help' ? { ...e, core: true } : e))
  assert.ok(inventoryProblems(wrong).includes('help: core must be true exactly for daily and weekly entries'))
})

test('every overlay names how it opens', () => {
  const wrong = inventory().map((e) => (e.id === 'add-menu' ? { ...e, open: undefined } : e))
  assert.ok(inventoryProblems(wrong).some((p) => p.startsWith('add-menu: an overlay must name how it opens')))
})

test('every before-and-after shot of scripts/screens.mjs names an inventory entry', () => {
  const src = readFileSync(new URL('../screens.mjs', import.meta.url), 'utf8')
  const entries = [...src.matchAll(/\{ name: '[a-z-]+', entry: '([a-z-]+)'/g)].map((m) => m[1])
  assert.ok(entries.length >= 10)
  const ids = new Set(inventory().map((e) => e.id))
  assert.deepEqual(entries.filter((e) => !ids.has(e)), [])
})

test('the readers find the lists they check against', () => {
  assert.ok(routerViews().includes('inbox') && routerViews().includes('workspace-invite'))
  const { screens, overlays } = layoutNames()
  assert.ok(screens.has('settings-people') && screens.has('inbox'))
  assert.ok(overlays.has('task-detail') && overlays.has('duplicate-project') && overlays.has('parent-picker'))
})

test('story coverage: a core entry with a misspelt story fails, a rare one is only listed', () => {
  const titles = new Set(['Screens/Task list'])
  const entries = [
    { id: 'inbox', core: true, story: 'Screens/Task list' },
    { id: 'today', core: true, story: 'Screens/Task lists' },
    { id: 'reset', core: false },
  ]
  const r = coverage(entries, titles)
  assert.deepEqual(r.missing.map((m) => m.id), ['today'])
  assert.deepEqual(r.uncoveredRare.map((m) => m.id), ['reset'])
})

test('the rubric scores severity times frequency and ranks by score, then by captures', () => {
  assert.equal(score('M6', 'daily'), 12)
  assert.equal(score('M10', 'weekly'), 6)
  assert.equal(score('M11', 'rare'), 2)
  const ranked = rank([
    { rule: 'M11', id: 'help', count: 9 },
    { rule: 'M6', id: 'inbox', count: 1 },
    { rule: 'M7', id: 'today', count: 2 },
    { rule: 'M7', id: 'upcoming', count: 5 },
  ], { help: 'rare', inbox: 'daily', today: 'daily', upcoming: 'daily' })
  assert.deepEqual(ranked.map((r) => r.id), ['inbox', 'upcoming', 'today', 'help'])
})

test("a screen that did not open carries the page's last events, oldest dropped", () => {
  let t = 1000
  const trace = createTrace(3, () => t)
  t = 1005; trace.push('navigated', 'http://x/inbox')
  t = 1010; trace.push('console.error', 'Failed to fetch\n  dynamically imported module')
  t = 1020; trace.push('navigated', 'http://x/inbox')
  t = 1030; trace.push('request failed', 'http://x/views net::ERR_ABORTED')
  assert.deepEqual(trace.lines(), [
    '+10ms console.error Failed to fetch dynamically imported module',
    '+20ms navigated http://x/inbox',
    '+30ms request failed http://x/views net::ERR_ABORTED',
  ])
})

test('a trace starts at the screen that failed, not at the page before it', () => {
  let t = 0
  const trace = createTrace(4, () => t)
  t = 1; trace.push('console.error', 'from the inbox')
  t = 2; trace.mark('today')
  t = 3; trace.push('navigated', 'http://x/today')
  assert.deepEqual(trace.lines(), ['+2ms screen today', '+3ms navigated http://x/today'])
  // The mark itself falls out of the ring: what is left is still this screen's.
  for (t = 4; t < 8; t++) trace.push('console.warning', `w${t}`)
  assert.deepEqual(trace.lines(), ['+4ms console.warning w4', '+5ms console.warning w5', '+6ms console.warning w6', '+7ms console.warning w7'])
})

test('a traced page records main-frame navigations, failed documents, errors and warnings only', () => {
  const page = new EventEmitter()
  const main = { url: () => 'http://x/inbox' }
  page.mainFrame = () => main
  assert.deepEqual(traceOf(page), [])
  tracePage(page)
  page.emit('console', { type: () => 'log', text: () => 'before the screen' })
  page.emit('pageerror', new Error('from the screen before'))
  markScreen(page, 'inbox')
  page.emit('framenavigated', { url: () => 'http://x/iframe' })
  page.emit('framenavigated', main)
  page.emit('requestfailed', { isNavigationRequest: () => false, url: () => 'http://x/a.png', failure: () => ({ errorText: 'net::ERR_ABORTED' }) })
  page.emit('requestfailed', { isNavigationRequest: () => true, url: () => 'http://x/inbox', failure: () => ({ errorText: 'net::ERR_ABORTED' }) })
  page.emit('console', { type: () => 'info', text: () => 'hello' })
  page.emit('console', { type: () => 'warning', text: () => 'slow' })
  page.emit('pageerror', new Error('boom'))
  assert.deepEqual(traceOf(page).map((l) => l.replace(/^\+\d+ms /, '')), [
    'screen inbox',
    'navigated http://x/inbox',
    'request failed http://x/inbox net::ERR_ABORTED',
    'console.warning slow',
    'page error boom',
  ])
})
