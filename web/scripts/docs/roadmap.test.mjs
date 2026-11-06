// The generated roadmap page (OpenSpec change docs-1-0, design D6) on a small
// fixture repository: an archived change, one in progress, one planned and one
// without a folder.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildAll, writeAll } from './build.mjs'
import { runChecks } from './check.mjs'
import { changeStatus, parseReleases, parseRoadmap, roadmapMarkdown, withRoadmap } from './roadmap.mjs'
import { SCREENSHOTS, SHOTS_DIR } from '../../../scripts/site-bundle.mjs'

const WEBP = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64')

const ROADMAP = `# Roadmap

## The road to 1.0

### [0.21 "Horizons"](https://example.com/milestone/5)

Longer horizons.

| Change | What | Issues |
| --- | --- | --- |
| [\`time-sectors\`](openspec/changes/archive/2026-11-02-time-sectors/) | **Shipped.** This week, without a [fake](x.md) due date | [#579](https://x) |
| [\`objectives\`](openspec/changes/archive/2026-11-02-objectives/) | **Shipped.** Objectives | |
| [\`plan-tweak\`](openspec/changes/plan-tweak/) | **In progress.** Tweak the plan | |

### 1.0 "Trust"

| Change | What | Issues |
| --- | --- | --- |
| [\`docs-1-0\`](openspec/changes/docs-1-0/) | Docs | |
| \`telegram-channel\` | Telegram | |

## Shipped

| Change | What |
| --- | --- |
| \`old-thing\` | Not a milestone row |
`

const CHANGELOG = `# Changelog

## [Unreleased]

## [0.21.0] - 2026-11-02

- Time sectors (OpenSpec \`time-sectors\`).

## [0.20.0] - 2026-11-02

- Something else.

## [0.19.0] - 2026-10-31
`

let root
const write = (path, content) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), content) }

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'docs-roadmap-'))
  write('ROADMAP.md', ROADMAP)
  write('CHANGELOG.md', CHANGELOG)
  write('README.md', '# Readme\n')
  write('openspec/changes/archive/2026-11-02-time-sectors/tasks.md', '- [x] 1.1 done\n')
  write('openspec/changes/archive/2026-11-02-objectives/tasks.md', '- [x] 1.1 done\n')
  write('openspec/changes/plan-tweak/tasks.md', '## 1\n\n- [x] 1.1 a\n- [X] 1.2 b\n- [ ] 1.3 c\n')
  write('openspec/changes/docs-1-0/tasks.md', '- [ ] 1.1 a\n- [ ] 1.2 b\n')
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('roadmap page', () => {
  it('reads the milestone tables of the road to 1.0 only', () => {
    const m = parseRoadmap(ROADMAP)
    expect(m.map((x) => x.title)).toEqual(['0.21 "Horizons"', '1.0 "Trust"'])
    expect(m[0].changes[0]).toEqual({ name: 'time-sectors', what: 'This week, without a fake due date' })
    expect(m.flatMap((x) => x.changes.map((c) => c.name))).not.toContain('old-thing')
  })

  it('gives each change its status from the repository', () => {
    const releases = parseReleases(CHANGELOG)
    expect(releases.map((r) => r.version)).toEqual(['0.19.0', '0.20.0', '0.21.0'])
    expect(changeStatus(root, 'time-sectors', releases)).toBe('Shipped in 0.21')
    // Not named: the last release on the first release date on or after the archive date.
    expect(changeStatus(root, 'objectives', releases)).toBe('Shipped in 0.21')
    expect(changeStatus(root, 'plan-tweak', releases)).toBe('In progress (2 of 3)')
    expect(changeStatus(root, 'docs-1-0', releases)).toBe('Planned')
    expect(changeStatus(root, 'telegram-channel', releases)).toBe('Planned')
    write('openspec/changes/archive/2026-12-01-late/tasks.md', '- [x] a\n')
    expect(changeStatus(root, 'late', releases)).toBe('Shipped')
  })

  it('writes one table per milestone, with the status as text', () => {
    const md = roadmapMarkdown(root)
    expect(md).toContain('## 0.21 "Horizons"\n\n| Change | What | Status |')
    expect(md).toContain('| `plan-tweak` | Tweak the plan | In progress (2 of 3) |')
    expect(md).toContain('| `telegram-channel` | Telegram | Planned |')
    expect(withRoadmap('a\n<!-- roadmap:start x -->\nold\n<!-- roadmap:end -->\nb', 'NEW')).toBe('a\nNEW\nb')
    expect(withRoadmap('no markers', 'NEW')).toBeNull()
  })

  it('fails the docs check when a task is checked without rebuilding', async () => {
    write('docs/README.md', '---\nlayout: index\ntitle: Docs\nsummary: All.\n---\n# Docs\n')
    write('docs/roadmap.md', '---\ntitle: Roadmap\nsummary: Plans.\naudience: user\nsection: About\nspecs: [documentation]\norder: 1\n---\n# Roadmap\n\n<!-- roadmap:start -->\n<!-- roadmap:end -->\n')
    write('openspec/specs/documentation/spec.md', '# documentation\n')
    write('web/src/lib/shortcuts.ts', 'export const SHORTCUT_SECTIONS = []\nexport const SHORTCUTS = []\nexport const QUICK_ADD_SYNTAX = []\n')
    for (const n of SCREENSHOTS) write(`${SHOTS_DIR}/${n}.webp`, WEBP)
    writeAll(root, (await buildAll(root)).files)
    expect((await runChecks(root)).filter((p) => p.includes('out of date'))).toEqual([])
    write('openspec/changes/docs-1-0/tasks.md', '- [x] 1.1 a\n- [ ] 1.2 b\n')
    expect((await runChecks(root)).find((p) => p.includes('out of date'))).toContain('docs/roadmap.md')
  })
})
