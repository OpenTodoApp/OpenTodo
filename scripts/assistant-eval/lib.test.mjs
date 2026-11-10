// node --test scripts/assistant-eval/*.test.mjs: the eval's checks on
// recorded events, offline (OpenSpec change assistant-eval, tasks 1.2 and 1.3).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildReport, checkTurn, MAP_CLAIM, parseEvents, passes, summarize, validateScenario } from './lib.mjs'
import { loadScenarios, replay } from './run.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = (name) => JSON.parse(readFileSync(join(here, 'fixtures', name), 'utf8'))
const ev = (name, data) => ({ name, data })

test('every scenario file is valid, and there are about a dozen', () => {
  const all = loadScenarios()
  assert.ok(all.length >= 12, `${all.length} scenarios`)
  assert.ok(all.some((s) => s.fake), 'some scenarios run on the fake provider')
})

test('validation names what is wrong', () => {
  const p = validateScenario({ name: 'Bad Name', title: 'x', seed: { tasks: [{ key: 'a', title: 'A' }, { key: 'a', title: 'B', due: 'today' }] },
    turns: [{ say: 'hi', expect: { blocks: [{ kind: 'chart', ids: ['zz'] }], no_tools: ['schedule_tasks'], links: ['a'], whatever: 1, no_text: ['('] } }] }, 'bad.json')
  for (const want of ['name:', 'key "a" used twice', 'due: whole days', 'kind: one of', 'unknown seed key "zz"', 'not a display tool', 'whatever: unknown', 'bad pattern']) {
    assert.ok(p.some((x) => x.includes(want)), `missing "${want}" in ${p.join(' | ')}`)
  }
  assert.deepEqual(validateScenario({ name: 'ok', title: 'Ok', turns: [{ say: 'hi', expect: {} }] }), [])
})

test('the stream body parses into events', () => {
  const body = 'event: status\ndata: {"text":"Looking at Today…"}\n\nevent: text\ndata: {"text":"Hi"}\n\nevent: block\ndata: {"kind":"tasks","ids":["a"]}\n\nevent: done\ndata: {"stop_reason":"end_turn"}\n\n'
  const s = summarize(parseEvents(body))
  assert.equal(s.text, 'Hi')
  assert.deepEqual(s.blocks, [{ kind: 'tasks', ids: ['a'] }])
  assert.equal(s.stop, 'end_turn')
})

test('blocks match by kind and id set', () => {
  const sum = summarize([ev('block', { kind: 'tasks', ids: ['t2', 't1'] }), ev('block', { kind: 'calendar', date: '2026-11-10', span: 'day' })])
  const ids = { a: 't1', b: 't2', c: 't3' }
  assert.deepEqual(checkTurn({ blocks: [{ kind: 'tasks', ids: ['a', 'b'] }, { kind: 'calendar', date: 1 }] }, sum, ids, '2026-11-09'), [])
  const [f] = checkTurn({ blocks: [{ kind: 'tasks', ids: ['a', 'c'] }] }, sum, ids, '2026-11-09')
  assert.match(f, /expected a tasks block with ids \[a, c\]; got tasks \[b, a\]/)
  assert.match(checkTurn({ blocks: [{ kind: 'map' }] }, sum, ids)[0], /got only tasks, calendar/)
  assert.match(checkTurn({ no_tools: ['show_calendar'] }, sum, ids)[0], /show_calendar must not be called/)
})

test('time blocks match by grouping and last day (assistant-time-blocks)', () => {
  const sum = { blocks: [{ kind: 'time', from: '2026-11-09', to: '2026-11-15', group_by: 'project' }, { kind: 'deadlines', from: '2026-11-09', to: '2026-11-13' }], changes: [], text: '' }
  assert.deepEqual(checkTurn({ blocks: [{ kind: 'time', group_by: 'project' }, { kind: 'deadlines', to: 4 }] }, sum, {}, '2026-11-09'), [])
  assert.match(checkTurn({ blocks: [{ kind: 'time', group_by: 'day' }] }, sum, {}, '2026-11-09')[0], /by day/)
  assert.match(checkTurn({ blocks: [{ kind: 'deadlines', to: 2 }] }, sum, {}, '2026-11-09')[0], /until 2026-11-11/)
  assert.deepEqual(validateScenario({ name: 'x', title: 'X', turns: [{ say: 'hi', expect: { blocks: [{ kind: 'free_time', date: 1 }] } }] }), [])
})

test('project blocks match by column and subject (assistant-project-blocks)', () => {
  const ids = { web: 'p1', doing: 's1', todo: 's2' }
  const sum = { blocks: [{ kind: 'board', id: 'p1', section_id: 's1' }, { kind: 'activity', of: 'project', id: 'p1' }], changes: [], text: '' }
  assert.deepEqual(checkTurn({ blocks: [{ kind: 'board', ids: ['web'], section: 'doing' }, { kind: 'activity', ids: ['web'], of: 'project' }] }, sum, ids), [])
  assert.match(checkTurn({ blocks: [{ kind: 'board', section: 'todo' }] }, sum, ids)[0], /column s2/)
  assert.match(checkTurn({ blocks: [{ kind: 'activity', of: 'task' }] }, sum, ids)[0], /of a task/)
  const seed = { projects: [{ key: 'web', name: 'Web' }], sections: [{ key: 'doing', name: 'Doing', project: 'web' }], tasks: [{ key: 'a', title: 'A', section: 'doing' }] }
  assert.deepEqual(validateScenario({ name: 'x', title: 'X', view: 'project', seed, turns: [{ say: 'hi', expect: { blocks: [{ kind: 'board', section: 'doing' }] } }] }), [])
  assert.match(validateScenario({ name: 'x', title: 'X', seed, turns: [{ say: 'hi', expect: { blocks: [{ kind: 'board', section: 'a' }] } }] })[0], /not one of sections/)
})

test('change sets, links, forbidden text and ids', () => {
  const sum = summarize([ev('text', { text: 'Moved [Pay](?task=t1). Salary stays.' }), ev('changeset', { items: [{ entity: 'task', entityId: 't1', patch: { due: {} } }] })])
  const ids = { pay: 't1', secret: 't9' }
  assert.deepEqual(checkTurn({ changeset: true, changes: [{ entity: 'task', ids: ['pay'], fields: ['due'] }], links: ['pay'], never_ids: ['secret'] }, sum, ids), [])
  assert.match(checkTurn({ changeset: false }, sum, ids)[0], /expected no change set, and 1 change/)
  assert.match(checkTurn({ no_text: ['salary'] }, sum, ids)[0], /must not match \/salary\/, and says "Salary"/)
  assert.match(checkTurn({ never_ids: ['pay'] }, sum, ids)[0], /pay must never appear/)
  assert.match(checkTurn({ links: ['secret'] }, sum, ids)[0], /link the task secret/)
})

test('a map claim fails only without a map block', () => {
  for (const t of ["I've drawn the map below.", 'Your errands are on the map above.', 'See the map below for the route.', "Here's a map with all three stops.", 'I have plotted them on the map.']) assert.ok(MAP_CLAIM.test(t), t)
  for (const t of ['I cannot show a map without places.', 'None of these tasks has a location, so there is no map.', 'Add an address and I can show them on a map.']) assert.ok(!MAP_CLAIM.test(t), t)
  const claim = [ev('text', { text: "I've drawn the map below." })]
  assert.match(checkTurn({ no_map_claim: true }, summarize(claim))[0], /claims a map without showing one/)
  assert.deepEqual(checkTurn({ no_map_claim: true }, summarize([ev('block', { kind: 'map', task_ids: ['a'] }), ...claim])), [])
})

test('a scenario passes on a majority of its runs', () => {
  assert.equal(passes([{ pass: true }, { pass: false }, { pass: true }]), true)
  assert.equal(passes([{ pass: true }, { pass: false }, { pass: false }]), false)
  assert.equal(passes([{ pass: true }]), true)
})

test('recorded passing runs pass, by majority', () => {
  const results = replay(fixture('passing.json'), loadScenarios())
  const { json, md } = buildReport(results, { provider: 'anthropic', model: 'm', runs: 3 })
  assert.equal(json.failed, 0, md)
  const overdue = json.scenarios.find((s) => s.name === 'overdue-show-tasks')
  assert.equal(overdue.passed_runs, 2)
  assert.equal(overdue.tokens, 3 * 20300)
  assert.match(md, /\*\*3 of 3 scenarios pass\*\*/)
})

test('a failing fixture exits non-zero and names the failed expectation', () => {
  const out = mkdtempSync(join(tmpdir(), 'eval-report-'))
  const r = spawnSync(process.execPath, [join(here, 'run.mjs'), '--replay', join(here, 'fixtures/failing.json')], { env: { ...process.env, OUT_DIR: out }, encoding: 'utf8' })
  assert.equal(r.status, 1, r.stdout + r.stderr)
  assert.match(r.stdout, /FAIL {2}overdue-show-tasks/)
  assert.match(r.stdout, /expected a tasks block with ids \[pay, call\]; no block was shown/)
  assert.match(r.stdout, /expected no change set, and 1 change\(s\) were proposed/)
  assert.match(r.stdout, /show_map must not be called, and it was/)
  const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'))
  assert.equal(report.failed, 2)
  assert.match(readFileSync(join(out, 'report.md'), 'utf8'), /- Failed: the answer claims a map without showing one/)
})
