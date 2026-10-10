import { describe, expect, it } from 'vitest'
import {
  TEXT_MAX, TITLE_MAX, TRUNCATED_NOTE, bookmarklet, isEmptyShare, lastUrlIn, parseShare, proposedDescription, proposedTitle, safeUrl, shareUrl,
} from './share'

const q = (o: Record<string, string>) => new URLSearchParams(o).toString()

describe('safeUrl', () => {
  it('keeps http and https only', () => {
    expect(safeUrl('https://example.org/post')).toBe('https://example.org/post')
    expect(safeUrl('http://example.org')).toBe('http://example.org/')
    expect(safeUrl('javascript:alert(1)')).toBeNull()
    expect(safeUrl('JavaScript:alert(1)')).toBeNull()
    expect(safeUrl('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(safeUrl('file:///etc/passwd')).toBeNull()
    expect(safeUrl('not a url')).toBeNull()
    expect(safeUrl('')).toBeNull()
  })
})

describe('parseShare', () => {
  it('reads title, text and url', () => {
    const p = parseShare(q({ title: 'Interesting article', text: 'the quoted paragraph', url: 'https://example.org/post' }))
    expect(p).toEqual({ title: 'Interesting article', text: 'the quoted paragraph', url: 'https://example.org/post' })
    expect(proposedTitle(p)).toBe('Interesting article')
    expect(proposedDescription(p)).toBe('the quoted paragraph\n\nhttps://example.org/post')
  })

  it('drops a javascript: url and keeps the rest of the payload', () => {
    const p = parseShare(q({ title: 'Hi', text: 'body', url: 'javascript:alert(1)' }))
    expect(p.url).toBeNull()
    expect(p.title).toBe('Hi')
    expect(p.text).toBe('body')
    expect(proposedDescription(p)).toBe('body')
    expect(proposedDescription(p)).not.toContain('javascript')
  })

  it('does not replace a dropped url with one found in the text', () => {
    const p = parseShare(q({ text: 'see https://example.org', url: 'javascript:alert(1)' }))
    expect(p.url).toBeNull()
    expect(p.text).toBe('see https://example.org')
  })

  it('extracts the last http(s) url from text when url is empty', () => {
    const p = parseShare(q({ title: 'Page', text: 'Look at http://a.example/x and https://b.example/y?z=1.' }))
    expect(p.url).toBe('https://b.example/y?z=1')
    expect(p.text).toBe('Look at http://a.example/x and .')
    expect(lastUrlIn('nothing here')).toBeNull()
    expect(lastUrlIn('javascript:alert(1)')).toBeNull()
  })

  it('handles a text that is only a url (Android style)', () => {
    const p = parseShare(q({ text: 'https://example.org/post' }))
    expect(p).toEqual({ title: '', text: '', url: 'https://example.org/post' })
    expect(proposedTitle(p)).toBe('example.org')
    expect(proposedDescription(p)).toBe('https://example.org/post')
  })

  it('truncates the title to 500 characters on one line', () => {
    const p = parseShare(q({ title: `a\nb ${'x'.repeat(1000)}` }))
    expect(p.title.length).toBe(TITLE_MAX)
    expect(p.title.startsWith('a b x')).toBe(true)
  })

  it('truncates 40 KB of text to 16 KB followed by a note', () => {
    const p = parseShare(q({ text: 'y'.repeat(40 * 1024) }))
    expect(p.text).toBe(`${'y'.repeat(TEXT_MAX)}\n${TRUNCATED_NOTE}`)
  })

  it('does not split a surrogate pair when truncating', () => {
    const p = parseShare(q({ title: `${'x'.repeat(TITLE_MAX - 1)}😀` }))
    expect(p.title).toBe('x'.repeat(TITLE_MAX - 1))
  })

  it('treats markup as plain text', () => {
    const p = parseShare(q({ title: '<img src=x onerror=alert(1)>' }))
    expect(p.title).toBe('<img src=x onerror=alert(1)>')
  })

  it('recognises an empty payload', () => {
    expect(isEmptyShare(parseShare(''))).toBe(true)
    expect(isEmptyShare(parseShare(q({ url: 'javascript:void 0' })))).toBe(true)
    expect(proposedTitle(parseShare(q({ text: 'first line\nsecond' })))).toBe('first line')
  })
})

describe('shareUrl and bookmarklet', () => {
  it('builds the /share URL that parseShare reads back', () => {
    const u = shareUrl('https://todo.example/', { url: 'https://example.org/a?b=c&d', title: 'T & more', text: 'sel' })
    expect(u.startsWith('https://todo.example/share?')).toBe(true)
    const p = parseShare(new URL(u).search)
    expect(p).toEqual({ title: 'T & more', text: 'sel', url: 'https://example.org/a?b=c&d' })
    expect(shareUrl('https://todo.example', {})).toBe('https://todo.example/share')
  })

  it('opens a named popup on the given origin and carries no credential', () => {
    const b = bookmarklet('https://todo.example')
    expect(b.startsWith('javascript:')).toBe(true)
    expect(b).toContain('"https://todo.example/share"')
    expect(b).toContain("'opentodo-capture'")
    expect(b).toContain('location.href')
    expect(b).toContain('document.title')
    expect(b).toContain('getSelection')
    expect(b).not.toMatch(/token|bearer|cookie|authorization/i)
  })

  it('produces code that opens the right URL when run in a page', () => {
    const opened: string[] = []
    const win = { getSelection: () => 'picked text', open: (u: string) => (opened.push(u), {}) }
    const run = new Function('window', 'getSelection', 'location', 'document', 'alert', bookmarklet('https://todo.example').slice('javascript:'.length))
    run(win, win.getSelection, { href: 'https://news.example/item?id=1' }, { title: 'A story' }, () => {})
    expect(opened).toHaveLength(1)
    expect(parseShare(new URL(opened[0]).search)).toEqual({ title: 'A story', text: 'picked text', url: 'https://news.example/item?id=1' })
  })
})
