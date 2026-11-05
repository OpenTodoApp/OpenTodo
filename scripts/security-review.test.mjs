// Security review records and the disclosure policy (OpenSpec change external-security-review,
// tasks 2.1 and 2.3): the review scope names a threat model section for every item, every review
// file under docs/security/reviews/ is well formed and names regression tests that exist, and
// SECURITY.md keeps its response times, fix targets and supported versions.
// Run: node --test scripts/security-review.test.mjs   (make repo-check)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  blockingReason, headingIds, parseReview, parseScope, reviewFileProblems, reviewProblems, scopeProblems, testPaths,
} from './release/securityReview.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(path.join(root, p), 'utf8')

test('the review scope, the threat model and every review file in the repository are consistent', () => {
  assert.deepEqual(reviewProblems(root), [])
})

test('the review scope covers every scope item of the security-review spec', () => {
  const ids = parseScope(read('docs/security/review-scope.md')).map((s) => s.id)
  for (const id of ['authentication-and-sessions', 'token-scopes', 'route-policy-wrapper', 'sync-scopes-and-membership',
    'end-to-end-encryption', 'caldav', 'mcp-and-the-agent-write-gate', 'assistant-tool-loop', 'outbound-request-policy',
    'importer-parsers', 'attachments', 'public-links-and-task-pages', 'host-mode-isolation', 'demo-mode',
    'web-client', 'android-and-ios-bridges', 'container-image']) {
    assert.ok(ids.includes(id), `docs/security/review-scope.md has no scope item ${id}`)
  }
})

test('the threat model has a section for every attacker profile of the spec', () => {
  const ids = headingIds(read('docs/security/threat-model.md'))
  for (const id of ['anonymous-internet-user', 'signed-in-member-of-a-shared-project', 'viewer-of-a-shared-project',
    'task-page-and-public-link-guest', 'api-token-holders', 'stolen-or-unlocked-device', 'malicious-server-for-an-encrypted-account',
    'malicious-import-file', 'malicious-calendar-mail-or-issue-server', 'malicious-ai-agent-or-prompt-injection',
    'compromised-ai-provider', 'another-tenant-in-host-mode', 'demo-visitor', 'accepted-risks']) {
    assert.ok(ids.has(id), `docs/security/threat-model.md has no section #${id}`)
  }
})

// --- fixtures for the checker itself

const MODEL = '# Threat model\n\n## Components\n\n### Host mode isolation\n\ntext\n\n### Outbound request policy\n'
const SCOPE = [
  '# Scope', '', '## Scope', '',
  '| Item | Area | Threat model | Code |', '|---|---|---|---|',
  '| `host-mode-isolation` | Host mode | [Host mode isolation](threat-model.md#host-mode-isolation) | `internal/host` |',
  '| `outbound-request-policy` | SSRF | [Outbound](threat-model.md#outbound-request-policy) | `internal/outbound` |',
  '',
].join('\n')

function review({ scope = '`host-mode-isolation`, `outbound-request-policy`', rows = [], commit = 'a'.repeat(40), delivered = '2027-03-01' } = {}) {
  return [
    '---', 'title: Review', '---', '# Review', '', '## Record', '',
    '| Field | Value |', '|---|---|',
    '| Reviewer | Example Security |', `| Commit | \`${commit}\` |`, `| Delivered | ${delivered} |`, '| Published | Not yet |', `| Scope | ${scope} |`,
    '', '## Findings', '',
    '| ID | Title | Severity | Status | Fix | Regression test | Advisory |', '|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.join(' | ')} |`), '',
  ].join('\n')
}

const exists = (p) => p === 'internal/outbound/outbound_test.go'

test('a well-formed review file passes', () => {
  const r = parseReview(review({ rows: [
    ['OTD-01', 'SSRF bypass', 'High', 'Fixed (retested)', '#901', '`TestOutboundRefusesIPv6Mapped` in `internal/outbound/outbound_test.go`', 'GHSA-xxxx-xxxx-xxxx'],
    ['OTD-02', 'Verbose error', 'Low', 'Open', '#902', '', ''],
  ] }))
  assert.deepEqual(r.errors, [])
  assert.deepEqual(reviewFileProblems('r.md', r, ['host-mode-isolation', 'outbound-request-policy'], exists), [])
  assert.deepEqual(scopeProblems(SCOPE, MODEL), [])
})

test('a scope item without a threat model section fails, naming it', () => {
  const broken = SCOPE.replace('threat-model.md#host-mode-isolation', 'threat-model.md#host-mode')
  const out = scopeProblems(broken, MODEL)
  assert.equal(out.length, 1)
  assert.match(out[0], /host-mode-isolation .*#host-mode, which does not exist/)
})

test('a fixed finding whose regression test file is missing fails, naming the finding and the path', () => {
  const r = parseReview(review({ rows: [
    ['OTD-03', 'CalDAV', 'Medium', 'Fixed', '#903', '`TestX` in `internal/caldav/missing_test.go`', ''],
  ] }))
  const out = reviewFileProblems('r.md', r, ['host-mode-isolation', 'outbound-request-policy'], exists)
  assert.deepEqual(out, ['r.md: OTD-03 names regression test internal/caldav/missing_test.go, which does not exist'])
})

test('a malformed review file fails: columns, severity, status, commit, missing scope items', () => {
  const r = parseReview(review({ commit: 'abc', scope: '`host-mode-isolation`', rows: [['OTD-04', 'x', 'Severe', 'Done', '', '', '']] }))
  const out = reviewFileProblems('r.md', r, ['host-mode-isolation', 'outbound-request-policy'], exists)
  assert.ok(out.some((p) => /Commit must be a full 40-character/.test(p)), out.join('\n'))
  assert.ok(out.some((p) => /OTD-04: severity must be/.test(p)))
  assert.ok(out.some((p) => /OTD-04: status must be/.test(p)))
  assert.ok(out.some((p) => /Scope does not list outbound-request-policy/.test(p)))
  const cols = parseReview(review().replace('| Advisory |', '| GHSA |'))
  assert.ok(cols.errors.some((e) => /the columns must be/.test(e)))
})

test('regression test paths are read from backticks', () => {
  assert.deepEqual(testPaths('`TestA` in `internal/a/a_test.go`, `web/src/lib/b.test.ts`'), ['internal/a/a_test.go', 'web/src/lib/b.test.ts'])
})

test('the fix rule per severity', () => {
  const f = (Severity, Status, Fix = '') => ({ ID: 'OTD-9', Severity, Status, Fix })
  assert.equal(blockingReason(f('High', 'Fixed (retested)'), '1.0.0'), '')
  assert.match(blockingReason(f('High', 'Fixed'), '1.0.0'), /must be Fixed \(retested\)/)
  assert.match(blockingReason(f('Critical', 'Open'), '1.0.0'), /Critical/)
  assert.equal(blockingReason(f('Medium', 'Fixed'), '1.0.0'), '')
  assert.equal(blockingReason(f('Medium', 'Accepted', 'Needs a schema change; target 1.1.0'), '1.0.0'), '')
  assert.match(blockingReason(f('Medium', 'Accepted', 'target 1.1.0'), '1.0.0'), /without a reason/)
  assert.match(blockingReason(f('Medium', 'Accepted', 'Needs a schema change; target 1.1.0'), '1.2.0'), /past its target/)
  assert.match(blockingReason(f('Medium', 'Open'), '1.0.0'), /Medium/)
  assert.equal(blockingReason(f('Low', 'Open', '#12'), '1.0.0'), '')
  assert.equal(blockingReason(f('Info', "Won't fix", 'Intended: the owner configures it'), '1.0.0'), '')
  assert.match(blockingReason(f('Low', 'Open'), '1.0.0'), /issue link/)
})

// --- SECURITY.md (task 2.3, design D6): the promises cannot silently disappear.

test('SECURITY.md keeps its disclosure policy: channels, response times, fix targets, disclosure, safe harbour, versions', () => {
  const s = read('SECURITY.md')
  const ids = headingIds(s)
  for (const h of ['reporting-a-vulnerability', 'what-to-expect', 'safe-harbour', 'supported-versions', 'security-reviews']) {
    assert.ok(ids.has(h), `SECURITY.md has no "${h}" section`)
  }
  const section = (id) => {
    const lines = s.split('\n')
    const i = lines.findIndex((l) => /^## /.test(l) && headingIds(l).has(id))
    const j = lines.findIndex((l, k) => k > i && /^## /.test(l))
    return lines.slice(i, j < 0 ? undefined : j).join('\n')
  }
  const expect = section('what-to-expect')
  for (const [what, re] of [
    ['acknowledgement within 3 business days', /Acknowledgement within 3 business days/i],
    ['an assessment within 10 business days', /assessment within 10 business days/i],
    ['the Critical fix target of 7 days', /7 days\*\* for Critical/],
    ['the High fix target of 30 days', /30 days\*\* for High/],
    ['the Medium fix target of 90 days', /90 days\*\* for Medium/],
    ['the Low fix target of the next minor release', /next minor release\*\* for Low/],
    ['coordinated disclosure within 90 days', /disclosure within 90 days/i],
    ['GitHub security advisories with CVE ids', /security advisory[\s\S]*CVE id/],
    ['credit to reporters', /Credit/],
  ]) assert.match(expect, re, `SECURITY.md "What to expect" lost ${what}`)
  assert.match(s, /github\.com\/OpenTodoApp\/OpenTodo\/security\/advisories\/new/, 'SECURITY.md lost the private reporting link')
  assert.match(section('safe-harbour'), /instances you do not own/, 'the safe harbour must exclude instances the researcher does not own')
  const versions = section('supported-versions')
  assert.match(versions, /latest 1\.x minor[^|]*\| All fixes/)
  assert.match(versions, /previous 1\.x minor[^|]*\| Critical and High fixes for 3 months after the next minor ships/)
  assert.match(versions, /last 0\.x release[^|]*\| Critical fixes for 3 months after 1\.0\.0/)
  assert.match(section('security-reviews'), /docs\/security\//)
})
