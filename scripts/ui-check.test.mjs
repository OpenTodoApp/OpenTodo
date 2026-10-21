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

test('Style gate: an illustration with a hex colour, a raster image or text is reported (inbox-means-unplaced D9)', async () => {
  const { illustrationProblems, ILLUSTRATION_MAX_BYTES } = await import('./ui-check.mjs')
  const bad = [
    '<path d="M0 0h10" stroke="#10b981" />',
    '<path fill="rgb(16, 185, 129)" />',
    '<image href="tray.png" />',
    '<text x="4" y="10">Done</text>',
    '<linearGradient id="g" />',
  ]
  for (const line of bad) assert.equal(illustrationProblems('web/src/ui/illustrations/Bad.tsx', line).length, 1, line)
  assert.match(illustrationProblems('Big.tsx', 'x'.repeat(ILLUSTRATION_MAX_BYTES + 1))[0], /over 4096 bytes/)
})

test('an illustration on tokens passes the gate', async () => {
  const { illustrationProblems } = await import('./ui-check.mjs')
  const ok = [
    '<svg viewBox="0 0 160 120" fill="none" stroke="currentColor" strokeWidth="1.5">',
    '<path d="M34 74h22" fill="var(--color-sunken)" />',
    '<path fill="var(--color-accent)" fillOpacity="0.15" />',
    '// a comment naming #fff is fine',
  ]
  for (const line of ok) assert.deepEqual(illustrationProblems('Good.tsx', line), [], line)
})
