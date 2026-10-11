// Each failure the docs check reports, on a tiny fixture repository built in a
// temporary directory (OpenSpec change `user-documentation`, task 1.3).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildAll, writeAll } from './build.mjs'
import { runChecks } from './check.mjs'

// A 1×1 WebP (VP8L).
const WEBP = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64')

let root
const write = (path, content) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), content) }
const read = (path) => readFileSync(join(root, path), 'utf8')
const page = (fm, body) => `---\n${fm}\n---\n${body}`

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'docs-check-'))
  write('CHANGELOG.md', '# Changelog\n\n## [Unreleased]\n\n## [1.2.3] - 2026-01-01\n')
  write('README.md', '# Readme\n\n## Configuration\n')
  write('openspec/specs/boards/spec.md', '# boards\n')
  write('web/src/lib/shortcuts.ts', `export const SHORTCUT_SECTIONS = [{ id: 'everywhere', title: 'Everywhere' }]
export const SHORTCUTS = [{ keys: 'q', description: 'Quick add a task', section: 'everywhere' }]
export const QUICK_ADD_SYNTAX = [['p1', 'Priority']]
`)
  write('web/src/app/Board.tsx', 'export const B = () => <a data-help-screen="board-view">Help</a>\n')
  write('docs/README.md', page('layout: index\ntitle: Docs\nsummary: All of it.', '# Docs\n\nSee [boards](boards.md).\n'))
  write('docs/images/board-light.webp', WEBP)
  write('docs/boards.md', page('title: Boards\nsummary: Columns.\naudience: user\nspecs: [boards]\nscreens: [board-view#switch-to-a-board]\norder: 1',
    '# Boards\n\n## Switch to a board\n\n![A board](images/board-light.webp)\n\nSee [the readme](../README.md#configuration) and [keys](keyboard.md#all-shortcuts).\n'))
  write('docs/keyboard.md', page('title: Keys\nsummary: Shortcuts.\naudience: user\nspecs: []\norder: 2', '# Keys\n\n## All shortcuts\n\n<!-- shortcuts:start -->\n<!-- shortcuts:end -->\n'))
  const { files } = await buildAll(root)
  writeAll(root, files)
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('docs check', () => {
  it('passes on a complete, freshly built fixture', async () => {
    expect(await runChecks(root)).toEqual([])
    expect(read('website/docs/boards/index.html')).toContain('<h2 id="switch-to-a-board">')
    expect(read('docs/keyboard.md')).toContain('| <kbd>q</kbd> | Quick add a task |')
    const help = JSON.parse(read('web/src/generated/help.json'))
    expect(help.screens['board-view']).toEqual({ page: 'boards', anchor: 'switch-to-a-board' })
    expect(help.version).toBe('1.2.3')
  })

  it('names a page without front matter', async () => {
    write('docs/notes.md', '# Notes\n')
    expect(await runChecks(root)).toContainEqual(expect.stringMatching(/^docs\/notes\.md: missing front matter/))
  })

  it('reports a broken anchor with the page it is on', async () => {
    write('docs/boards.md', read('docs/boards.md').replace('keyboard.md#all-shortcuts', 'keyboard.md#saved-views'))
    expect(await runChecks(root)).toContainEqual('docs/boards.md: link "keyboard.md#saved-views" points to a heading that does not exist in docs/keyboard.md')
  })

  it('reports links to missing pages and repository files', async () => {
    write('docs/boards.md', read('docs/boards.md').replace('../README.md#configuration', '../MISSING.md'))
    expect(await runChecks(root)).toContainEqual(expect.stringMatching(/link "\.\.\/MISSING\.md" points to MISSING\.md, which does not exist/))
  })

  it('reports an image without alt text and a missing image', async () => {
    write('docs/boards.md', read('docs/boards.md').replace('![A board](images/board-light.webp)', '<picture><source srcset="images/board-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/board-light.webp" alt=""></picture>'))
    const problems = await runChecks(root)
    expect(problems).toContainEqual('docs/boards.md: image "/docs/images/board-light.webp" has no alt text')
    expect(problems).toContainEqual('docs/boards.md: image "/docs/images/board-dark.webp" does not exist')
  })

  it('reports a capability no page covers', async () => {
    write('openspec/specs/time-tracking/spec.md', '# time-tracking\n')
    expect(await runChecks(root)).toContainEqual('openspec/specs/time-tracking: no page under docs/ lists it in "specs"')
  })

  it('reports a help link in the app to a screen no page names, and screens the app does not use', async () => {
    write('web/src/app/Share.tsx', 'export const S = () => <a data-help-screen="share-dialog">Help</a>\n')
    write('docs/boards.md', read('docs/boards.md').replace('screens: [board-view#switch-to-a-board]', 'screens: [board-view#switch-to-a-board, board-menu]'))
    const problems = await runChecks(root)
    expect(problems).toContainEqual('web/src/app/Share.tsx: help screen "share-dialog" is not named by any page\'s "screens"')
    expect(problems).toContainEqual('docs/boards.md: screen "board-menu" is not used by any help link in the app')
  })

  it('reports a skipped heading level', async () => {
    write('docs/boards.md', read('docs/boards.md').replace('## Switch to a board', '### Switch to a board'))
    expect(await runChecks(root)).toContainEqual('docs/boards.md: heading "Switch to a board" skips a level (h1 to h3)')
  })

  it('reports a keyboard guide that differs from the shortcut data module', async () => {
    write('web/src/lib/shortcuts.ts', read('web/src/lib/shortcuts.ts').replace("'Quick add a task'", "'Add a task'"))
    expect(await runChecks(root)).toContainEqual(expect.stringMatching(/^docs\/keyboard\.md: the shortcut tables differ/))
  })

  it('reports stale generated files', async () => {
    write('docs/boards.md', read('docs/boards.md').replace('## Switch to a board', '## Switch to a board\n\nNew sentence.'))
    expect(await runChecks(root)).toContainEqual(expect.stringMatching(/^generated docs are out of date; run `make docs` \(website\/docs\/boards\/index\.html/))
    write('website/docs/old/index.html', 'stale')
    expect((await runChecks(root)).join('\n')).toContain('website/docs/old/index.html (no longer generated)')
  })
})
