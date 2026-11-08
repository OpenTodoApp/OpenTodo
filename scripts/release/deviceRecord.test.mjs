// node --test scripts/release/deviceRecord.test.mjs (make deploy-check)
// The reference-device record check of make release-prepare (OpenSpec change performance-10k, task 4.3):
// optional until real devices are measured (#990), checked when it exists.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { checkDeviceRecord, needsRecord, recordProblems } from './deviceRecord.mjs'
import { loadBudgets } from '../perf/budgets.mjs'

const budgets = loadBudgets()
const record = (rows) => `# Reference devices, 1.1.0

| Device | OS | App version | Date |
| --- | --- | --- | --- |
| Pixel 6a | Android 15 | 1.1.0 | 2027-01-10 |

| Metric | Android | iPhone | Raspberry Pi 4 |
| --- | --- | --- | --- |
${rows.join('\n')}
`

test('only minor releases from 1.0 on have their record checked', () => {
  assert.equal(needsRecord('1.0.0', '0.30.2'), true)
  assert.equal(needsRecord('1.1.0', '1.0.3'), true)
  assert.equal(needsRecord('1.1.1', '1.1.0'), false)
  assert.equal(needsRecord('0.22.0', '0.21.0'), false)
})

test('values within budget pass; over budget needs an issue', () => {
  assert.deepEqual(recordProblems(record(['| `cold-start` (ms) | 2,410 | 1,980 | — |', '| `server-start` (ms) | — | — | 1,240 |']), budgets), [])
  assert.deepEqual(recordProblems(record(['| `first-sync` (s) | 97 | 64 | — |']), budgets),
    ['first-sync, Android: 97 s is over the budget of 90 s and links no issue'])
  assert.deepEqual(recordProblems(record(['| `first-sync` (s) | 97 (over budget: #123) | 64 | — |']), budgets), [])
  assert.deepEqual(recordProblems(record(['| `first-sync` (s) | 97, https://github.com/OpenTodoApp/OpenTodo/issues/9 | 64 | — |']), budgets), [])
})

test('an empty or unknown table is refused', () => {
  assert.deepEqual(recordProblems('# nothing yet\n', budgets), ['no measured value (see scripts/perf/device.md for the table)'])
  assert.match(recordProblems(record(['| `warp-speed` (ms) | 1 | 1 | 1 |']), budgets)[0], /warp-speed: not a metric/)
})

test('make release-prepare passes without a record and checks one that exists', () => {
  const root = mkdtempSync(join(tmpdir(), 'device-record-'))
  try {
    mkdirSync(join(root, 'scripts/perf'), { recursive: true })
    cpSync(new URL('../perf/budgets.json', import.meta.url), join(root, 'scripts/perf/budgets.json'))
    // Real devices are measured after 1.0 (#990): no record is no refusal.
    checkDeviceRecord(root, '1.1.0', '1.0.4')
    mkdirSync(join(root, 'docs/performance'), { recursive: true })
    writeFileSync(join(root, 'docs/performance/results-1.1.0.md'), record(['| `first-sync` (s) | 97 | 64 | — |']))
    assert.throws(() => checkDeviceRecord(root, '1.1.0', '1.0.4'), /docs\/performance\/results-1\.1\.0\.md:\n.*links no issue/)
    writeFileSync(join(root, 'docs/performance/results-1.1.0.md'), record(['| `first-sync` (s) | 88 | 64 | — |']))
    checkDeviceRecord(root, '1.1.0', '1.0.4')
    checkDeviceRecord(root, '1.0.5', '1.0.4')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
