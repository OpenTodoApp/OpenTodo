import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Markdown } from '../app/Markdown'
import { LINK_REL, parseInline, parseMarkdown, safeHref } from './markdown'

const html = (source: string) => renderToStaticMarkup(createElement(Markdown, { source }))

describe('markdown', () => {
  it('script tag is text', () => {
    const out = html('<script>alert(1)</script> and <img src=x onerror=alert(2)>')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    // HTML inside code and quotes stays text too.
    expect(html('`<b>x</b>`\n\n> <iframe src="https://evil.example">')).not.toMatch(/<(b|iframe)[ >]/)
  })

  it('link opens new tab with noopener', () => {
    const out = html('See [the docs](https://example.com/docs?a=1&b=2) or https://example.org/x.')
    expect(out).toContain('<a href="https://example.com/docs?a=1&amp;b=2" target="_blank" rel="nofollow ugc noopener noreferrer"')
    expect(out).toContain('>the docs</a>')
    // A bare URL becomes a link without its trailing punctuation.
    expect(out).toContain('<a href="https://example.org/x" target="_blank" rel="nofollow ugc noopener noreferrer"')
    // Visitor links carry no search value (demo-sandboxes D5): every link, every instance.
    expect(LINK_REL).toBe('nofollow ugc noopener noreferrer')
    expect(out.match(/<a /g)?.length).toBe(out.match(/rel="nofollow ugc noopener noreferrer"/g)?.length)
  })

  it('refuses dangerous link targets', () => {
    for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<b>', 'vbscript:x', '/relative', '//evil.example']) {
      expect(safeHref(bad)).toBeNull()
      const out = html(`[click](${bad})`)
      expect(out).not.toContain('<a')
      expect(out).toContain('click')
    }
    expect(safeHref('mailto:a@example.com')).toBe('mailto:a@example.com')
  })

  it('renders the supported subset', () => {
    const out = html([
      'Hello **bold** and *em* and _em too_ and `code` in snake_case_name.',
      'second line',
      '',
      '- one',
      '- two with **strong**',
      '',
      '1. first',
      '2. second',
      '',
      '> quoted *text*',
      '',
      '```',
      'const a = 1 < 2',
      '```',
    ].join('\n'))
    expect(out).toContain('<strong>bold</strong>')
    expect(out).toContain('<em>em</em>')
    expect(out).toContain('<em>em too</em>')
    expect(out).toContain('snake_case_name')
    expect(out).toContain('<code class="rounded')
    expect(out).toContain('<br/>second line')
    expect(out).toMatch(/<ul[^>]*><li><p>one<\/p><\/li><li><p>two with <strong>strong<\/strong><\/p><\/li><\/ul>/)
    expect(out).toMatch(/<ol start="1"[^>]*><li><p>first<\/p><\/li>/)
    expect(out).toMatch(/<blockquote[^>]*><p>quoted <em>text<\/em><\/p><\/blockquote>/)
    expect(out).toContain('const a = 1 &lt; 2')
  })

  it('keeps unmatched delimiters and escapes literal', () => {
    expect(parseInline('2 * 3 = 6 and a ** b')).toEqual([{ t: 'text', v: '2 * 3 = 6 and a ** b' }])
    expect(parseInline('\\*not em\\*')).toEqual([{ t: 'text', v: '*not em*' }])
    expect(parseMarkdown('')).toEqual([])
  })

  it('stays bounded on hostile nesting', () => {
    const deep = '> '.repeat(500) + '['.repeat(2000) + '*'.repeat(2000)
    expect(() => html(deep)).not.toThrow()
  })
})

describe('headings and check items', () => {
  it('are read in every body (notes and comments, editor-everywhere)', () => {
    const src = '## Packing\n\n- [x] Passport\n- [ ] Charger'
    expect(parseMarkdown(src)).toEqual([
      { t: 'h', level: 2, c: [{ t: 'text', v: 'Packing' }] },
      { t: 'list', ordered: false, start: 1, checks: [true, false], items: [[{ t: 'p', c: [{ t: 'text', v: 'Passport' }] }], [{ t: 'p', c: [{ t: 'text', v: 'Charger' }] }]] },
    ])
  })
})

describe('editor-everywhere additions', () => {
  it('Table: header and rows, scrolling in its own box', () => {
    const out = html('| Item | Cost |\n| --- | ---: |\n| Paint | 40 |\n| a \\| b | 5 |')
    expect(out).toContain('<div class="max-w-full overflow-x-auto" data-scroll-x="true">')
    expect(out).toMatch(/<thead><tr><th[^>]*>Item<\/th><th style="text-align:right"[^>]*>Cost<\/th><\/tr><\/thead>/)
    expect(out).toMatch(/<td[^>]*>Paint<\/td>/)
    expect(out).toMatch(/<td[^>]*>a \| b<\/td>/)
  })

  it('Image from the web stays a link', () => {
    const out = html('![photo](https://example.org/a.png)')
    expect(out).not.toContain('<img')
    expect(out).toContain(`<a href="https://example.org/a.png" target="_blank" rel="${LINK_REL}" class="text-accent underline">photo</a>`)
  })

  it('an attachment image without its task, or on the public page, is a placeholder that loads nothing', () => {
    expect(html('![wall](attachment:att-1)')).not.toContain('<img')
    expect(parseMarkdown('![The \\[wall\\]](attachment:att-1)')).toEqual([{ t: 'img', id: 'att-1', alt: 'The [wall]' }])
  })

  it('Issue chip: a recognised issue address reads as its id', () => {
    const out = html('see https://github.com/pixari/opentodo/issues/198 now')
    expect(out).toContain('class="issue-chip"')
    expect(out).toContain('pixari/opentodo#198</a>')
    expect(html('see https://example.org/issues/1')).not.toContain('issue-chip')
  })

  it('strike, task links and mentions', () => {
    expect(parseInline('~~gone~~')).toEqual([{ t: 'strike', c: [{ t: 'text', v: 'gone' }] }])
    expect(parseInline('[Book hotel](?task=t-1)')).toEqual([{ t: 'task', id: 't-1', c: [{ t: 'text', v: 'Book hotel' }] }])
    expect(parseInline('hi @Bob and @eve', 0, { mention: (x) => x === 'Bob' })).toEqual([
      { t: 'text', v: 'hi ' }, { t: 'mention', v: 'Bob' }, { t: 'text', v: ' and @eve' },
    ])
    expect(renderToStaticMarkup(createElement(Markdown, { source: 'hi @Bob', mentions: new Map([['Bob', 'Bob Smith']]) }))).toContain('<span class="mention-chip" data-mention-token="Bob" data-tip="Bob Smith">@Bob</span>')
  })
})
