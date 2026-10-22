import { describe, expect, it } from 'vitest'
import css from '../index.css?raw'
import { readFileSync } from 'node:fs'

// OpenSpec accessibility "Reading blocks" (accessibility-aaa D6): the rhythm of the
// blocks of text a person reads, in the stylesheet rather than in a browser.
describe('reading blocks', () => {
  const rule = (selector: string) => {
    const i = css.indexOf(selector)
    expect(i, selector).toBeGreaterThanOrEqual(0)
    return css.slice(i, css.indexOf('}', i))
  }

  it('Help prose: line height at least 1.5, paragraphs 2 em apart, at most 80 characters, never justified', () => {
    const help = rule('.help-prose {')
    expect(help).toContain('leading-relaxed')
    expect(help).toContain('max-inline-size: 80ch')
    expect(help).toContain('text-align: start')
    expect(rule('.help-prose p, .help-prose ul, .help-prose ol, .help-prose details {')).toContain('margin-bottom: 2em')
  })

  it('notes and comments: line height 1.5 and the measure; the 2 em paragraph gap is the high-contrast route (notes-rhythm)', () => {
    const notes = rule('.notes-editor {')
    expect(notes).toContain('line-height: 1.5')
    expect(notes).toContain('max-inline-size: 80ch')
    expect(rule('.user-text {')).toContain('line-height: 1.5')
    expect(css).toContain('html[data-contrast="high"] .notes-editor > * + *, html[data-contrast="high"] .user-text p + p { margin-top: 2em; }')
  })

  it('nothing is justified', () => {
    expect(css).not.toMatch(/text-align:\s*justify|text-justify/)
  })

  it('the docs site spaces paragraphs 2 em apart within a 70ch measure', () => {
    const docs = readFileSync(new URL('../../scripts/docs/assets/docs.css', import.meta.url), 'utf8')
    expect(docs).toContain('.prose { max-width: 70ch; }')
    expect(docs).toMatch(/\.prose p, \.prose ul, \.prose ol, \.prose blockquote, \.prose details \{ margin: 0 0 2em; \}/)
    expect(docs).toMatch(/body \{[^}]*font: 17px\/1\.7/)
  })
})
