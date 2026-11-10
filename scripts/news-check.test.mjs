// Tests for scripts/news-build.mjs (OpenSpec change whats-new, tasks 1.1). Run by `make news-check`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildNews, changelogVersions, compareVersions, outputs, parseNews, sentences } from './news-build.mjs'

const file = (version, body = 'It is here. Two sentences.', date = '2026-11-10') => ({
  name: `${version}.md`,
  text: `---\nversion: ${version}\ndate: ${date}\n---\n${body}\n`,
})

test('versions compare numerically', () => {
  assert.ok(compareVersions('0.10.0', '0.9.0') > 0)
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0)
})

test('sentences split on terminal punctuation followed by a space', () => {
  assert.deepEqual(sentences('One. Two! Three? Four v0.19.0 is fine.'), ['One.', 'Two!', 'Three?', 'Four v0.19.0 is fine.'])
})

test('a news file parses into version, date and a one-line body', () => {
  const r = parseNews('0.20.0.md', '---\nversion: 0.20.0\ndate: 2026-11-10\n---\nFirst line.\nSecond line.\n')
  assert.deepEqual(r.entry, { version: '0.20.0', date: '2026-11-10', body: 'First line. Second line.' })
})

test('a file named for another version, a bad date and a missing body are refused', () => {
  assert.match(parseNews('0.2.0.md', '---\nversion: 0.20.0\ndate: 2026-11-10\n---\nX.\n').problems[0], /must be 0\.20\.0\.md/)
  assert.match(parseNews('0.20.0.md', '---\nversion: 0.20.0\ndate: 10/11/2026\n---\nX.\n').problems[0], /YYYY-MM-DD/)
  assert.match(parseNews('0.20.0.md', '---\nversion: 0.20.0\ndate: 2026-11-10\n---\n\n').problems[0], /body is empty/)
})

test('a body over four sentences is refused', () => {
  const r = parseNews('0.20.0.md', '---\nversion: 0.20.0\ndate: 2026-11-10\n---\nOne. Two. Three. Four. Five.\n')
  assert.match(r.problems[0], /5 sentences; at most 4/)
})

test('a file without front matter is refused', () => {
  assert.match(parseNews('0.20.0.md', 'No front matter.').problems[0], /missing front matter/)
})

test('an empty news folder is valid and publishes nothing', () => {
  const { entries, problems } = buildNews({ files: [], changelog: '## [0.19.0] - 2026-10-31' })
  assert.deepEqual(problems, [])
  assert.deepEqual(entries, [])
  assert.equal(outputs(entries)['web/src/generated/newsIndex.json'], '{"latest":null,"versions":[]}\n')
})

test('entries come newest first, and the latest version is the newest', () => {
  const { entries } = buildNews({ files: [file('0.9.0'), file('0.10.0'), file('0.9.1')] })
  assert.deepEqual(entries.map((e) => e.version), ['0.10.0', '0.9.1', '0.9.0'])
  const index = JSON.parse(outputs(entries)['web/src/generated/newsIndex.json'])
  assert.equal(index.latest, '0.10.0')
  assert.deepEqual(index.versions, ['0.10.0', '0.9.1', '0.9.0'])
})

test('two files for one version are refused', () => {
  const { problems } = buildNews({ files: [file('0.20.0'), { name: '0.20.0.md', text: file('0.20.0').text }] })
  assert.ok(problems.some((p) => /two news entries for version 0\.20\.0/.test(p)))
})

test('a changelog section newer than the first news file needs its entry', () => {
  const changelog = '## [Unreleased]\n\n## [0.21.0] - 2026-11-20\n\n## [0.20.0] - 2026-11-10\n\n## [0.19.0] - 2026-10-31\n'
  const { problems } = buildNews({ files: [file('0.20.0')], changelog })
  assert.deepEqual(problems, ['CHANGELOG.md has a section [0.21.0] with no news/0.21.0.md (the news series starts at 0.20.0)'])
})

test('older changelog sections are not backfilled', () => {
  const changelog = '## [0.19.0] - 2026-10-31\n\n## [0.20.0] - 2026-11-10\n'
  assert.deepEqual(buildNews({ files: [file('0.20.0')], changelog }).problems, [])
})

test('changelog versions are read from released headings only', () => {
  assert.deepEqual(changelogVersions('## [Unreleased]\n## [0.2.0] - x\n## [0.1.0] - y\n'), ['0.2.0', '0.1.0'])
})
