// node --test scripts/release/accessibilityAudit.test.mjs (make repo-check): the release
// gate on the manual accessibility audit (accessibility-aa D4).
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { addMonths, auditProblems, checkAccessibilityAudit, SCREEN_READER_PASSES } from './accessibilityAudit.mjs'

const ENTRIES = [{ id: 'inbox', core: true }, { id: 'settings-server', core: false }]

function tree(audits) {
  const root = mkdtempSync(join(tmpdir(), 'a11y-audit-'))
  mkdirSync(join(root, 'scripts/ux-audit'), { recursive: true })
  writeFileSync(join(root, 'scripts/ux-audit/screens.json'), JSON.stringify(ENTRIES))
  mkdirSync(join(root, 'docs/accessibility'), { recursive: true })
  for (const [version, text] of Object.entries(audits)) writeFileSync(join(root, `docs/accessibility/audit-${version}.md`), text)
  return root
}
const row = (cells) => `| \`inbox\` | ${cells.join(' | ')} |\n`
const done = (date) => `Date: ${date}\n\n${row(['pass', 'pass', 'pass', 'pass', 'n/a no Android shell build here', 'pass'])}`

test('addMonths', () => {
  assert.equal(addMonths('2026-11-03', 12), '2027-11-03')
  assert.equal(addMonths('2026-01-31', 1), '2026-03-03')
})

test('a release within 12 months of a complete audit may go', () => {
  const root = tree({ '1.0.0': done('2026-11-03') })
  try {
    assert.deepEqual(auditProblems(root, '1.0.0', '2026-12-01'), [])
    assert.deepEqual(auditProblems(root, '1.4.0', '2027-11-03'), [])
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('13 months after the latest audit, make release-prepare says an audit is due', () => {
  const root = tree({ '1.0.0': done('2026-11-03'), '0.9.0': done('2025-01-01') })
  try {
    assert.throws(() => checkAccessibilityAudit(root, '1.5.0', '2027-12-04'), /a manual accessibility audit is due: docs\/accessibility\/audit-1\.0\.0\.md is from 2026-11-03/)
    // The newest record counts, not an older one.
    assert.deepEqual(auditProblems(root, '1.1.0', '2027-01-10'), [])
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('from 1.0.0 every core screen’s passes are done; a 0.x release may carry pending ones', () => {
  const root = tree({ '1.0.0': `Date: 2026-11-03\n\n${row(['pass', 'pending', 'pending', 'pending', 'pending', 'pass'])}` })
  try {
    assert.deepEqual(auditProblems(root, '0.21.0', '2026-11-10'), [])
    const p = auditProblems(root, '1.0.0', '2026-11-10')
    assert.equal(p.length, 4)
    assert.match(p[0], /inbox, NVDA \+ Firefox is still pending/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('1.0.0 without any audit record is refused; a missing core row too', () => {
  const none = tree({})
  const partial = tree({ '1.0.0': 'Date: 2026-11-03\n\n| `today` | pass | pass | pass | pass | pass | pass |\n' })
  try {
    assert.match(auditProblems(none, '1.0.0', '2026-11-10')[0], /no manual accessibility audit/)
    assert.deepEqual(auditProblems(none, '0.21.0', '2026-11-10'), [])
    assert.match(auditProblems(partial, '1.0.0', '2026-11-10')[0], /no row for the core screen inbox/)
  } finally {
    rmSync(none, { recursive: true, force: true })
    rmSync(partial, { recursive: true, force: true })
  }
})

test('any release may carry pending screen-reader passes, as one warning; nothing else (screen-reader-passes-optional)', () => {
  const root = tree({ '1.0.0': `Date: 2026-11-03\n\n${row(['pass', 'pending', 'pending', 'pending', 'pending', 'pass'])}` })
  const keyboard = tree({ '1.0.0': `Date: 2026-11-03\n\n${row(['pending', 'pending', 'pass', 'pass', 'pass', 'pass'])}` })
  const unlinked = tree({ '1.0.0': `Date: 2026-11-03\n\n${row(['pass', 'fail', 'pending', 'pending', 'pending', 'pass'])}` })
  try {
    assert.deepEqual(SCREEN_READER_PASSES, ['NVDA + Firefox', 'VoiceOver + Safari (macOS)', 'VoiceOver (iOS shell)', 'TalkBack (Android shell)'])
    assert.deepEqual(checkAccessibilityAudit(root, '1.0.0', '2026-11-10'),
      ['accessibility audit: 4 screen-reader passes pending on 1 core screens in docs/accessibility/audit-1.0.0.md (NVDA + Firefox, VoiceOver + Safari (macOS), VoiceOver (iOS shell), TalkBack (Android shell)), recorded when someone runs them (#9)'])
    // The keyboard pass is done and must stay done: pending refuses the release, naming only it.
    assert.throws(() => checkAccessibilityAudit(keyboard, '1.0.0', '2026-11-10'), /^Error: accessibility audit:\n {2}docs\/accessibility\/audit-1\.0\.0\.md: inbox, Keyboard only is still pending$/)
    // A fail without its issue refuses, on a screen-reader pass too.
    assert.throws(() => checkAccessibilityAudit(unlinked, '1.0.0', '2026-11-10'), /inbox, NVDA \+ Firefox is "fail"/)
    // An audit that is due refuses as well.
    assert.throws(() => checkAccessibilityAudit(root, '1.0.0', '2027-12-04'), /a manual accessibility audit is due/)
    assert.deepEqual(checkAccessibilityAudit(root, '0.21.0', '2026-11-10'), [])
  } finally {
    for (const d of [root, keyboard, unlinked]) rmSync(d, { recursive: true, force: true })
  }
})
