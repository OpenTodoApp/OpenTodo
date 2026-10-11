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
