// Fixtures for the source checks of scripts/ui-check.mjs (run by `make ui-lint`).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rawDueTimeProblems } from './ui-check.mjs'

test('a raw due time joined into text is reported (ux-feedback-2 D3)', () => {
  const bad = [
    "{task.due && <span>{formatDate(task.due.date, 'long')}{task.due.time ? ` ${task.due.time}` : ''}</span>}",
    '<span>{task.due.time}</span>',
    "const s = 'at ' + task.due?.time",
  ]
  for (const line of bad) assert.equal(rawDueTimeProblems('x.tsx', line).length, 1, line)
})

test('reading a due time for logic or formatting it is fine', () => {
  const ok = [
    "{task.due && <span>{formatDueLong(task.due, zone)}</span>}",
    'const at = local.time ? formatTime(local.time, p) : null',
    'if (task.due.time) setOpen(true)',
    "const due = x.due ? `${formatShort(x.due.date)}${x.due.time ? ` ${formatTime(x.due.time)}` : ''}` : null",
    '// `${due.time}` in a comment is fine',
  ]
  for (const line of ok) assert.deepEqual(rawDueTimeProblems('x.tsx', line), [], line)
})
