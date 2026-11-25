// Fixtures for the source checks of scripts/ui-check.mjs (run by `make ui-lint`).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { learnMoreProblems, physicalDirectionProblems, rawDueTimeProblems } from './ui-check.mjs'

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
    '<path stroke="rgb(16, 185, 129)" />',
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
    '<svg viewBox="0 0 160 120" fill="none" stroke="currentColor" strokeWidth="1.75">',
    '<path d="M34 74h22" fill="var(--color-sunken)" />',
    '<path d="M34 74h22" fill="var(--color-surface)" strokeWidth="1" />',
    '<path fill="var(--color-accent)" fillOpacity="0.2" stroke="var(--text-color-accent)" />',
    '// a comment naming #fff is fine',
  ]
  for (const line of ok) assert.deepEqual(illustrationProblems('Good.tsx', line), [], line)
})

test('an illustration keeps two stroke weights, token fills and one accent shape (illustrations-v2)', async () => {
  const { illustrationProblems } = await import('./ui-check.mjs')
  assert.match(illustrationProblems('W.tsx', '<path strokeWidth="3" />')[0], /stroke width 3/)
  assert.match(illustrationProblems('F.tsx', '<path fill="var(--color-canvas)" />')[0], /fill var\(--color-canvas\)/)
  const two = '<path fill="var(--color-accent)" />\n<circle fill="var(--color-accent)" />'
  assert.match(illustrationProblems('A.tsx', two).at(-1), /2 accent shapes/)
})

test('Learn more comes only from the LearnMore element', () => {
  assert.equal(learnMoreProblems('web/src/app/X.tsx', "<button onClick={go}>{t('Learn more')}</button>").length, 1)
  assert.equal(learnMoreProblems('web/src/app/X.tsx', '<a href="/help">Learn more</a>').length, 1)
  assert.deepEqual(learnMoreProblems('web/src/ui/LearnMore.tsx', "{t('Learn more')}"), [])
  assert.deepEqual(learnMoreProblems('web/src/app/X.tsx', "<LearnMore screen=\"demo\" />"), [])
  assert.deepEqual(learnMoreProblems('web/src/app/X.tsx', "t('Learn more: {topic}', { topic })"), [])
})

test('a raw radio input in a screen is refused, RadioGroup and allowed files are not', async () => {
  const { rawRadioProblems } = await import('./ui-check.mjs')
  assert.equal(rawRadioProblems('web/src/app/New.tsx', '<input type="radio" name="x" />').length, 1)
  assert.equal(rawRadioProblems('web/src/app/New.tsx', "  <input checked type='radio' />").length, 1)
  assert.deepEqual(rawRadioProblems('web/src/app/New.tsx', '<RadioGroup label="x" value="a" options={[]} onChange={f} />'), [])
  assert.deepEqual(rawRadioProblems('web/src/app/New.tsx', "t.matches('input[type=\"radio\"]')"), [])
  assert.deepEqual(rawRadioProblems('web/src/app/NewBoardDialog.tsx', '<input type="radio" />'), [])
  // settings-foundation 3.5: the settings files left the list; a raw radio there fails again.
  assert.equal(rawRadioProblems('web/src/app/QuickAddSettings.tsx', '<input type="radio" />').length, 1)
})

test('a raw "Priority {n}" message outside lib/priority.ts is refused (priority-names D3)', async () => {
  const { rawPriorityNameProblems } = await import('./ui-check.mjs')
  assert.equal(rawPriorityNameProblems('web/src/app/X.tsx', "<option>{t('Priority {p}', { p })}</option>").length, 1)
  assert.equal(rawPriorityNameProblems('web/src/lib/x.ts', 'const m = msg("Priority {n}")').length, 1)
  assert.deepEqual(rawPriorityNameProblems('web/src/lib/priority.ts', "return t('Priority {n}', { n })"), [])
  assert.deepEqual(rawPriorityNameProblems('web/src/app/X.tsx', "<option>{priorityName(p)}</option>"), [])
  assert.deepEqual(rawPriorityNameProblems('web/src/app/X.tsx', "t('Priority {from} → {to}', { from, to })"), [])
  assert.deepEqual(rawPriorityNameProblems('web/src/app/X.tsx', "// t('Priority {n}') was here"), [])
})

test('layout classes name the start and end of the line (arabic-rtl D3)', () => {
  const bad = physicalDirectionProblems('a.tsx', `<div className="ml-2 pr-4 sm:left-0 text-right border-l-2 rounded-r-control" />`)
  assert.equal(bad.length, 6)
  assert.match(bad[0], /`ml-2` is a physical direction/)
  assert.deepEqual(physicalDirectionProblems('a.tsx', `<div className="ms-2 pe-4 sm:inset-s-0 text-end border-s-2 rounded-e-control left-1/2 -translate-x-1/2 px-safe" />`), [])
  assert.deepEqual(physicalDirectionProblems('a.ts', `// physical: follows the pointer\nconst c = 'fixed left-0 top-0'`), [])
  assert.deepEqual(physicalDirectionProblems('a.ts', `const side = 'left'; const word = 'left-aligned'`), [])
})

test('rule 7 also covers floats, origins, gradients, safe padding, translates and inline styles', () => {
  const bad = physicalDirectionProblems('a.tsx', `<div className="float-left origin-top-left bg-linear-to-r object-right pl-safe translate-x-2" />`)
  assert.equal(bad.length, 6)
  assert.match(bad[5], /`translate-x-2` moves the same way right to left/)
  assert.deepEqual(physicalDirectionProblems('a.tsx', `<div className="translate-x-2 rtl:-translate-x-2 -translate-x-1/2" />`), [])
  assert.equal(physicalDirectionProblems('a.tsx', `<div style={{ paddingLeft: 8 }} />`).length, 1)
  assert.equal(physicalDirectionProblems('a.tsx', `<div style={{ textAlign: 'right' }} />`).length, 1)
  assert.deepEqual(physicalDirectionProblems('a.tsx', `<div style={{ /* physical: at the pointer */ left: x }} />`), [])
  assert.deepEqual(physicalDirectionProblems('a.tsx', `{/* physical: drawn from coordinates */}\n<div className="left-0" />`), [])
  assert.deepEqual(physicalDirectionProblems('web/src/app/review/charts.tsx', `// physical-file: a chart\nimport x from 'y'\nconst c = 'left-0'`), [])
  // physical-file only for the listed files, never in web/src/ui, and with a reason.
  assert.equal(physicalDirectionProblems('web/src/app/a.tsx', `// physical-file: a chart\nconst c = 'left-0'`).length, 2)
  assert.match(physicalDirectionProblems('web/src/ui/Chart.tsx', `// physical-file: a chart\n`)[0], /shared component/)
  assert.match(physicalDirectionProblems('web/src/app/review/charts.tsx', `// physical-file:\n`)[0], /needs a reason/)
  // physical: needs a reason.
  assert.equal(physicalDirectionProblems('a.tsx', `{/* physical: */}\n<div className="left-0" />`).length, 1)
  assert.equal(physicalDirectionProblems('a.tsx', `// physical:\nconst c = 'left-0'`).length, 1)
  // A translate's twin is an rtl: translate with the same variants, not any rtl: class.
  assert.equal(physicalDirectionProblems('a.tsx', `<div className="translate-x-4 rtl:ms-2" />`).length, 1)
  assert.equal(physicalDirectionProblems('a.tsx', `<div className="md:translate-x-4 rtl:-translate-x-4" />`).length, 1)
  assert.deepEqual(physicalDirectionProblems('a.tsx', `<div className="md:translate-x-4 md:rtl:-translate-x-4 translate-x-0 rtl:translate-x-0" />`), [])
})

test('a component without a stories file beside it is reported, in web/src/ui and web/src/phone alike (phone-ui-trial D7)', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { storyProblemsIn } = await import('./ui-check.mjs')
  const dir = mkdtempSync(join(tmpdir(), 'ui-check-'))
  try {
    mkdirSync(join(dir, 'components'))
    mkdirSync(join(dir, 'stories'))
    writeFileSync(join(dir, 'components/PhoneRow.tsx'), 'export function PhoneRow() { return null }\n')
    writeFileSync(join(dir, 'components/prefs.ts'), 'export const x = 1\n')
    // Story helpers are not components to cover.
    writeFileSync(join(dir, 'stories/frame.tsx'), 'export function PhoneFrame() { return null }\n')
    const before = storyProblemsIn(dir)
    assert.equal(before.length, 1)
    assert.match(before[0], /PhoneRow\.tsx: no stories file imports this component/)
    writeFileSync(join(dir, 'components/PhoneRow.stories.tsx'), "import { PhoneRow } from './PhoneRow'\nexport default { component: PhoneRow }\n")
    assert.deepEqual(storyProblemsIn(dir), [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
