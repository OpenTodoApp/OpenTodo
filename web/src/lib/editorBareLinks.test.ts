// Bare addresses read as links in the editor and stay bare in the note (bare-links).
import { describe, expect, it } from 'vitest'
import { Fragment, Slice } from 'prosemirror-model'
import { DecorationSet } from 'prosemirror-view'
import { bareUrls } from './markdown'
import { withoutSelfLinks } from './editorBareLinks'
import { createState, markdownSlice, pmToModel, schema } from './richtextEditor'
import { renderMarkdown } from './richtext'

describe('bareUrls', () => {
  it('finds the http(s) addresses of a text, without trailing punctuation', () => {
    expect(bareUrls('see https://example.com/a, and (http://x.org) or nothing')).toEqual([
      { from: 4, to: 25, href: 'https://example.com/a' },
      { from: 32, to: 44, href: 'http://x.org' },
    ])
    expect(bareUrls('nohttps://x.y')).toEqual([])
    expect(bareUrls('plain text')).toEqual([])
  })
})

describe('pasting an address', () => {
  it('keeps a pasted bare address as text, so the note stores it raw', () => {
    const slice = markdownSlice('https://example.com')
    const text = slice.content.firstChild!
    expect(text.text).toBe('https://example.com')
    expect(text.marks).toEqual([])
  })

  it('drops the link of a pasted link whose text is its own address, and keeps others', () => {
    const link = (href: string) => schema.marks.link.create({ href })
    const para = schema.nodes.paragraph.create(null, [
      schema.text('https://example.com', [link('https://example.com/')]),
      schema.text(' and '),
      schema.text('the docs', [link('https://example.com/docs')]),
    ])
    const out = withoutSelfLinks(new Slice(Fragment.from(para), 1, 1)).content.firstChild!
    const linked: string[] = []
    out.forEach((n) => { if (n.marks.length) linked.push(`${n.text} -> ${n.marks[0].attrs.href}`) })
    expect(linked).toEqual(['the docs -> https://example.com/docs'])
    expect(out.textContent).toBe('https://example.com and the docs')
  })
})

describe('the editor', () => {
  const state = (text: string, code = false) => {
    const block = code ? schema.nodes.code_block.create(null, schema.text(text)) : schema.nodes.paragraph.create(null, schema.text(text))
    const s = createState([], { askLink: () => null, onEscape: () => {}, size: () => 0 })
    return s.apply(s.tr.replaceWith(0, s.doc.content.size, block))
  }
  const links = (s: ReturnType<typeof state>) => {
    const set = s.plugins.map((p) => p.props.decorations?.call(p, s)).find((d): d is DecorationSet => d instanceof DecorationSet)
    return (set?.find() ?? []).map((d) => s.doc.textBetween(d.from, d.to))
  }

  it('shows a bare address as a link while the note keeps the address as text', () => {
    const s = state('call https://example.com/x today')
    expect(links(s)).toEqual(['https://example.com/x'])
    expect(renderMarkdown(pmToModel(s.doc))).toBe('call https://example.com/x today')
  })

  it('leaves addresses in code alone', () => {
    expect(links(state('https://example.com', true))).toEqual([])
  })
})
