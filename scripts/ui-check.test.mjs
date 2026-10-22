// Fixtures for the source checks of scripts/ui-check.mjs (run by `make ui-lint`).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { justifyProblems, learnMoreProblems, rawDueTimeProblems } from './ui-check.mjs'

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

test('Learn more comes only from the LearnMore element', () => {
  assert.equal(learnMoreProblems('web/src/app/X.tsx', "<button onClick={go}>{t('Learn more')}</button>").length, 1)
  assert.equal(learnMoreProblems('web/src/app/X.tsx', '<a href="/help">Learn more</a>').length, 1)
  assert.deepEqual(learnMoreProblems('web/src/ui/LearnMore.tsx', "{t('Learn more')}"), [])
  assert.deepEqual(learnMoreProblems('web/src/app/X.tsx', "<LearnMore screen=\"demo\" />"), [])
  assert.deepEqual(learnMoreProblems('web/src/app/X.tsx', "t('Learn more: {topic}', { topic })"), [])
})

// ---- exemption lists of the browser passes (accessibility-aaa 4.2, 5.1) ----
import { readFileSync as readExemptFile } from 'node:fs'
import { applyExempt, exemptProblems } from './ui-check/exempt.mjs'

test('the exemption lists are well formed: a dated reason, unique entries', () => {
  for (const name of ['focus-exempt', 'target-exempt', 'focus-obscured-exempt']) {
    const list = JSON.parse(readExemptFile(new URL(`./ux-audit/${name}.json`, import.meta.url), 'utf8'))
    assert.deepEqual(exemptProblems(list, name), [], name)
  }
  assert.deepEqual(exemptProblems({ reason: 'no date', elements: ['<a>', '<a>', ''] }, 'x'), [
    'x: reason must say when the first run was (a date)',
    'x: "<a>" is listed twice',
    'x: an entry is empty',
  ])
})

test('a failure is exempt when its element starts with a listed entry, and stands otherwise', () => {
  const list = { reason: '2026-10-22', elements: ['<span.relative.inline-flex>'] }
  const { exempt, kept } = applyExempt(list, [
    { element: '<span.relative.inline-flex> "3"', value: '22 px up misses' },
    { element: '<button.ui-btn> "Add"', value: '22 px left misses' },
  ])
  assert.equal(exempt.length, 1)
  assert.deepEqual(kept.map((f) => f.element), ['<button.ui-btn> "Add"'])
})

// ---- the register resolved to colours (accessibility-aaa 8.4) ----
import { registeredColours } from './ui-check/register.mjs'

test('a registered pair is recognised by its rendered colours, an unregistered one is not', async () => {
  const reg = await registeredColours(new URL('../web/src/index.css', import.meta.url).pathname, new URL('../web/src/ui/a11y/exceptions.json', import.meta.url).pathname)
  assert.ok(reg.rendered.light.length > 20, 'resolves the register in light')
  // The emerald primary button: white on the accent (accent-label).
  const label = reg.rendered.light.find((r) => r.id === 'accent-label')
  const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
  assert.ok(reg.covers('light', hex(label.fg), hex(label.bg)), 'white on emerald is registered')
  // The faint tone on any background (faint-tone, a wildcard pair).
  const faint = reg.rendered.light.find((r) => r.id === 'faint-tone')
  assert.ok(reg.covers('light', hex(faint.fg), '#123456'), 'faint on anything is registered')
  // The default text on the canvas is not a register entry, nor is a colour from nowhere.
  assert.equal(reg.covers('light', '#191f2b', '#ffffff'), false)
  assert.equal(reg.covers('dark', '#ff00ff', '#000000'), false)
  assert.equal(reg.covers('light', 'nonsense', '#ffffff'), false)
})

test('justified text in a screen or the stylesheet is reported with its line (accessibility-aaa 6.1)', () => {
  assert.equal(justifyProblems('x.tsx', '<p className="text-body text-justify">').length, 1)
  assert.equal(justifyProblems('index.css', '.notes-editor { text-align: justify; }').length, 1)
  assert.deepEqual(justifyProblems('x.tsx', '<p className="text-body text-left">'), [])
  assert.deepEqual(justifyProblems('x.tsx', '// text-justify is never used'), [])
})
