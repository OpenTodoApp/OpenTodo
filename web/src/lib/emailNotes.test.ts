import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseMarkdown, renderMarkdown, type RNode, type Run } from './richtext'

// A newsletter as Email to task writes it (OpenSpec change email-html-notes):
// the server's Markdown (internal/email/testdata/newsletter.md, the golden file
// of TestParseNewsletterAsMarkdown) must read as headings, lists and links in
// the notes, with no Markdown syntax left in the text.
const md = readFileSync(new URL('../../../internal/email/testdata/newsletter.md', import.meta.url), 'utf8')

function runs(nodes: RNode[]): Run[] {
  return nodes.flatMap((n) => [...(n.runs ?? []), ...runs(n.content ?? [])])
}

describe('email notes', () => {
  const nodes = parseMarkdown(md)

  it('keeps the newsletter structure', () => {
    expect(nodes.filter((n) => n.type === 'heading').map((n) => [n.attrs.level, n.runs!.map((r) => r.text).join('')])).toEqual([
      [1, 'This week in Claude Code'],
      [2, 'What’s new'],
    ])
    const list = nodes.find((n) => n.type === 'bullet_list')!
    expect(list.content).toHaveLength(2)
    expect(list.content![1].content!.some((c) => c.type === 'ordered_list' && c.content!.length === 2)).toBe(true)
  })

  it('turns links into link marks and leaves no syntax in the text', () => {
    const all = runs(nodes)
    const links = all.filter((r) => r.marks.link).map((r) => [r.text, (r.marks.link as { href: string }).href])
    expect(links).toContainEqual(['Read the post', 'https://example.com/post?%28id%29=1&x=2'])
    expect(links).toContainEqual(['nested sessions', expect.stringMatching(/^https:\/\/links\.email\.example\.com\//)])
    expect(all.some((r) => r.text === 'a lot' && r.marks.strong)).toBe(true)
    const text = all.map((r) => r.text).join('')
    expect(text).not.toMatch(/\]\(|\*\*|https?:\/\//)
    expect(text).toContain('5*3 = 15_units')
    expect(text).toContain('1. Not a list')
  })

  it('reads the same after the notes write it back', () => {
    expect(parseMarkdown(renderMarkdown(nodes))).toEqual(nodes)
  })
})
