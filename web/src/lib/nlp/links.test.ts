import { describe, expect, it } from 'vitest'
import { linkHost, matchLink } from './links'
import { parse } from './parse'

// Links in quick add (OpenSpec change quick-add-links); the shared cases are in quickadd.vectors.json.
const ctx = { today: '2026-10-09', now: '10:00', languages: ['en'], projects: [], links: true }

describe('links in quick add', () => {
  it('previews a link as a chip of its own', () => {
    const r = parse('Read https://www.example.com/post tomorrow', ctx)
    const chip = r.chips.find((c) => c.kind === 'link')!
    expect(chip.value).toBe('https://www.example.com/post')
    expect(chip.spans[0]).toEqual({ start: 5, end: 33, text: 'https://www.example.com/post' })
    expect(r.links).toEqual(['https://www.example.com/post'])
  })

  it('keeps a dismissed link in the title, and the next one counts', () => {
    const line = 'Read https://a.example/1 https://a.example/2'
    const dismissed = [{ start: 5, end: 24, text: 'https://a.example/1' }]
    const r = parse(line, { ...ctx, dismissed })
    expect(r.title).toBe('Read https://a.example/1')
    expect(r.links).toEqual(['https://a.example/2'])
  })

  it('reads no link without the switch', () => {
    const r = parse('Read https://example.com/post', { ...ctx, links: false })
    expect(r.chips).toEqual([])
    expect(r.title).toBe('Read https://example.com/post')
  })

  it('names the host without www, a port or a user', () => {
    expect(linkHost('https://www.Example.com/a')).toBe('example.com')
    expect(linkHost('http://me@host.example:8080/x?y#z')).toBe('host.example')
    expect(linkHost('https://[::1]:80/')).toBe('[::1]')
    expect(linkHost('https://İstanbul.EXAMPLE/')).toBe('İstanbul.example')
  })

  it('leaves sentence punctuation and unbalanced brackets outside the URL', () => {
    expect(matchLink('https://example.com/a(b).')).toBe('https://example.com/a(b)')
    expect(matchLink('https://example.com/x]),')).toBe('https://example.com/x')
    expect(matchLink('https://?q')).toBeNull()
    expect(matchLink('ftp://example.com')).toBeNull()
    for (const empty of ['http://@', 'http://user@', 'http://:8080']) expect(matchLink(empty)).toBeNull()
  })
})
