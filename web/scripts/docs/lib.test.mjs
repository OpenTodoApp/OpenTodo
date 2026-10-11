import { describe, expect, it } from 'vitest'
import { createSlugger, parseFrontMatter, renderPage, resolveLink, sanitizeHtml, validateFrontMatter } from './lib.mjs'
import { keysHtml, shortcutsMarkdown, splitContext, START, END } from './shortcuts.mjs'
import { QUICK_ADD_SYNTAX, SHORTCUTS, SHORTCUT_SECTIONS } from '../../src/lib/shortcuts.ts'
import { normalize, prepare, search, snippet, stem } from './search-core.mjs'

const ctx = { rel: 'guide.md', repoRoot: '/nonexistent', audienceOf: (rel) => (rel.startsWith('self-hosting/') || rel === 'api.md' ? 'admin' : 'user') }

describe('front matter', () => {
  it('parses strings, numbers and inline lists', () => {
    const { data, body, errors } = parseFrontMatter('---\ntitle: Sharing projects\nsummary: "Invite people: roles"\naudience: user\nspecs: [project-sharing, comments]\nscreens: [share-dialog#share-a-project]\norder: 40\n---\n# Sharing\n')
    expect(errors).toEqual([])
    expect(data).toEqual({ title: 'Sharing projects', summary: 'Invite people: roles', audience: 'user', specs: ['project-sharing', 'comments'], screens: ['share-dialog#share-a-project'], order: 40 })
    expect(body).toBe('# Sharing\n')
    expect(validateFrontMatter(data)).toEqual([])
  })
  it('reports a missing block, unknown keys and invalid values', () => {
    expect(parseFrontMatter('# Title\n').errors[0]).toMatch(/missing front matter/)
    expect(parseFrontMatter('---\ncolour: red\n---\n').errors[0]).toMatch(/unknown key "colour"/)
    expect(validateFrontMatter({ title: 'T', summary: 'S', audience: 'everyone', specs: [], order: 1 })).toEqual([expect.stringMatching(/audience must be one of/)])
    expect(validateFrontMatter({ title: 'T', summary: 'S', audience: 'user', order: 1 })).toEqual([expect.stringMatching(/specs is required/)])
  })
})

describe('heading ids', () => {
  it('match GitHub, deduplicated', () => {
    const slug = createSlugger()
    expect(slug('Plain `docker run`')).toBe('plain-docker-run')
    expect(slug('Calendar apps (CalDAV) through the proxy')).toBe('calendar-apps-caldav-through-the-proxy')
    expect(slug('Grammar')).toBe('grammar')
    expect(slug('Grammar')).toBe('grammar-1')
    expect(slug('Où ça?')).toBe('où-ça')
  })
})

describe('link rewriting', () => {
  it('resolves pages, anchors, repository files and images', () => {
    expect(resolveLink('filters.md#saved-views', 'guide.md')).toMatchObject({ kind: 'page', slug: 'filters', anchor: 'saved-views' })
    expect(resolveLink('../sync.md#purge', 'self-hosting/demo.md')).toMatchObject({ kind: 'page', slug: 'sync', anchor: 'purge' })
    expect(resolveLink('../README.md#configuration', 'guide.md')).toMatchObject({ kind: 'repo', path: 'README.md', anchor: 'configuration' })
    expect(resolveLink('README.md', 'guide.md')).toMatchObject({ kind: 'page', slug: '' })
    expect(resolveLink('#top', 'guide.md')).toEqual({ kind: 'anchor', anchor: 'top' })
    expect(resolveLink('images/today-light.webp', 'guide.md')).toEqual({ kind: 'image', path: 'docs/images/today-light.webp' })
    expect(resolveLink('https://example.com', 'guide.md')).toEqual({ kind: 'external', href: 'https://example.com' })
  })
  it('writes site URLs, GitHub URLs and keeps user links inside the app', () => {
    const md = '[Filters](filters.md#saved-views), [Docker](self-hosting/docker.md), [Readme](../README.md#configuration), [ext](../extension/), [web](https://example.com)'
    const site = renderPage(md, ctx, 'site').html
    expect(site).toContain('<a href="/docs/filters/#saved-views">Filters</a>')
    expect(site).toContain('<a href="/docs/self-hosting/docker/">Docker</a>')
    expect(site).toContain('<a href="https://github.com/pixari/opentodo/blob/main/README.md#configuration" rel="noopener">Readme</a>')
    expect(site).toContain('href="https://github.com/pixari/opentodo/tree/main/extension"')
    expect(site).toContain('<a href="https://example.com" rel="noopener">web</a>')
    const app = renderPage(md, ctx, 'app').html
    expect(app).toContain('<a href="/docs/filters/#saved-views" data-doc="filters">Filters</a>')
    expect(app).toContain('<a href="https://opentodo.pixari.dev/docs/self-hosting/docker/" target="_blank" rel="noopener">Docker</a>')
  })
  it('adds heading ids, lazy images and table wrappers', () => {
    const { html, headings, images } = renderPage('# Title\n\n## Add a task\n\n![The Today view](images/today-light.webp)\n\n| a | b |\n| - | - |\n| 1 | 2 |\n', ctx)
    expect(headings.map((h) => h.id)).toEqual(['title', 'add-a-task'])
    expect(html).toContain('<h2 id="add-a-task">Add a task<a class="anchor" href="#add-a-task"')
    expect(html).toContain('<img src="/docs/images/today-light.webp" alt="The Today view" loading="lazy" decoding="async">')
    expect(images).toEqual([{ src: '/docs/images/today-light.webp', alt: 'The Today view' }])
    expect(html).toContain('<div class="table-wrap" tabindex="0"><table>')
  })
})

describe('inline HTML allow-list', () => {
  it('keeps picture, source, img, kbd and details with allowed attributes only', () => {
    const { html, images } = sanitizeHtml('<picture><source srcset="images/a-dark.webp" media="(prefers-color-scheme: dark)" onerror="x()"><img src="images/a-light.webp" alt="Today" class="big" style="x"></picture> <kbd>q</kbd> <details open><summary>More</summary></details>', (u) => '/docs/' + u)
    expect(html).toBe('<picture><source srcset="/docs/images/a-dark.webp" media="(prefers-color-scheme: dark)"><img src="/docs/images/a-light.webp" alt="Today"></picture> <kbd>q</kbd> <details open><summary>More</summary></details>')
    expect(images).toEqual([{ src: '/docs/images/a-light.webp', alt: 'Today' }])
  })
  it('shows other tags as text and drops comments', () => {
    expect(sanitizeHtml('<script>alert(1)</script><!-- note --><b onclick="x">bold</b>').html).toBe('&lt;script&gt;alert(1)&lt;/script&gt;&lt;b onclick=&quot;x&quot;&gt;bold&lt;/b&gt;')
    expect(sanitizeHtml('<data>/backups').html).toBe('&lt;data&gt;/backups')
  })
  it('refuses script URLs in src', () => {
    expect(sanitizeHtml('<img src="javascript:alert(1)" alt="x">').html).toBe('<img alt="x">')
  })
  it('applies to raw HTML inside Markdown', () => {
    const { html } = renderPage('Press <kbd>q</kbd> or <span onclick="x">this</span>.\n\n<iframe src="https://evil"></iframe>\n', ctx)
    expect(html).toContain('<kbd>q</kbd>')
    expect(html).toContain('&lt;span onclick=&quot;x&quot;&gt;this&lt;/span&gt;')
    expect(html).not.toContain('<iframe')
  })
})

describe('keyboard guide', () => {
  it('lists every shortcut of the data module once, under its section', () => {
    const md = shortcutsMarkdown({ rows: SHORTCUTS, quickAdd: QUICK_ADD_SYNTAX, sections: SHORTCUT_SECTIONS })
    expect(md.startsWith(START) && md.endsWith(END)).toBe(true)
    const tableRows = md.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Keys') && !l.startsWith('| Type') && !l.startsWith('| ---'))
    expect(tableRows).toHaveLength(SHORTCUTS.length + QUICK_ADD_SYNTAX.length)
    for (const s of SHORTCUTS) expect(SHORTCUT_SECTIONS.map((x) => x.id)).toContain(s.section)
  })
  it('renders keys as <kbd> and splits off contexts', () => {
    expect(keysHtml('g then d / w')).toBe('<kbd>g</kbd> then <kbd>d</kbd> / <kbd>w</kbd>')
    expect(keysHtml('Drag (touch: press and hold)')).toBe('<kbd>Drag</kbd> (touch: press and hold)')
    expect(splitContext('Shift+← (board)')).toEqual({ keys: 'Shift+←', context: '' })
    expect(splitContext('Delete (in the Trash)')).toEqual({ keys: 'Delete', context: 'in the Trash' })
  })
})

describe('search', () => {
  const index = {
    pages: [{ t: 'Recurring tasks and reminders', u: '/docs/recurring-and-reminders/' }, { t: 'Quick add syntax', u: '/docs/quick-add/' }, { t: 'Sections and boards', u: '/docs/sections-and-boards/' }],
    s: [
      [0, '', '', 'Make a task repeat every week.'],
      [0, 'Make a task repeat', 'make-a-task-repeat', 'Open the task and type a rule such as every weekday in Repeat.'],
      [1, 'Recurrence', 'recurrence', 'Type every monday in quick add to create a recurring task.'],
      [2, 'Switch to a board', 'switch-to-a-board', 'Press v to show the project as a board with one column per section.'],
    ],
  }
  const entries = prepare(index)
  it('normalises and stems', () => {
    expect(normalize('Récurrence, ÉTÉ!')).toBe('recurrence ete')
    expect(stem('recurring')).toBe(stem('recurrence'))
    expect(stem('boards')).toBe('board')
  })
  it('finds the recurring guide and quick add for "recurring"', () => {
    const r = search(entries, 'recurring')
    expect(r.map((x) => x.url)).toEqual(expect.arrayContaining(['/docs/recurring-and-reminders/', '/docs/quick-add/#recurrence']))
    expect(r[0].page).toBe('Recurring tasks and reminders')
  })
  it('requires every word and ranks headings above text', () => {
    expect(search(entries, 'board column')[0].url).toBe('/docs/sections-and-boards/#switch-to-a-board')
    expect(search(entries, 'board zebra')).toEqual([])
    expect(search(entries, '   ')).toEqual([])
  })
  it('builds an escaped snippet with marks', () => {
    expect(snippet('Use <b>every</b> monday', ['monday'])).toBe('Use &lt;b&gt;every&lt;/b&gt; <mark>monday</mark>')
  })
})
