import { afterEach, describe, expect, it, vi } from 'vitest'
import vectors from '../../../internal/origin/testdata/origin_vectors.json'
import type { OpenTodoShell } from './shell'
import { cutOriginTitle, obsidianLink, obsidianURL, openOrigin, originFromUrl, originIcon, originLabel, originLink, originMatches, originOf, obsidianPlace } from './taskOrigin'
import type { Origin } from './types'

describe('originFromUrl (shared vectors with internal/origin)', () => {
  it('has the same cases as the Go test', () => {
    // internal/origin/vectors_test.go pins the same count.
    expect(vectors.cases).toHaveLength(21)
  })
  for (const c of vectors.cases) {
    it(c.name, () => {
      expect(originFromUrl(c.url, (c as { title?: string }).title)).toEqual(c.want)
    })
  }
})

describe('web mail origins (shared label vectors with internal/origin)', () => {
  for (const c of vectors.labels) {
    if (c.label === null) continue
    it(c.name, () => {
      expect(originLabel(c.origin as Origin)).toBe(c.label)
    })
  }
  it('an email origin without a link still reads as nothing (callers show "Email")', () => {
    expect(originLabel({ kind: 'email', provider: 'gmail', id: '1' })).toBe('')
  })
})

describe('origin readers', () => {
  const issue: Origin = { kind: 'issue', provider: 'github', id: 'o/r#7', url: 'https://github.com/o/r/issues/7' }
  const page: Origin = { kind: 'url', url: 'https://www.example.org/post', title: 'Interesting article' }
  const mail: Origin = { kind: 'email', id: '<a1@mail.example>' }
  const imported: Origin = { kind: 'import', provider: 'ticktick', id: '6f1a' }

  it('labels with the id, else the host, never a Message-ID', () => {
    expect(originLabel(issue)).toBe('o/r#7')
    expect(originLabel(page)).toBe('example.org')
    expect(originLabel(mail)).toBe('')
  })
  it('picks an icon by kind', () => {
    expect([issue, page, mail, imported].map(originIcon)).toEqual(['link', 'link', 'at-sign', 'download'])
  })
  it('matches the provider, else the kind, ignoring case', () => {
    expect(originMatches(issue, 'GitHub')).toBe(true)
    expect(originMatches(issue, 'issue')).toBe(false)
    expect(originMatches(page, 'url')).toBe(true)
    expect(originMatches(mail, 'email')).toBe(true)
    expect(originMatches(null, 'url')).toBe(false)
  })
  it('reads only object origins', () => {
    expect(originOf({ origin: issue })).toBe(issue)
    expect(originOf({ origin: null })).toBeNull()
    expect(originOf({ origin: undefined })).toBeNull()
    expect(originOf({ origin: '[Cannot decrypt]' })).toBeNull()
  })
  it('cuts a long title to 500 characters', () => {
    expect(Array.from(cutOriginTitle('é'.repeat(600)))).toHaveLength(500)
  })
})

// obsidian-origin: the "obsidian" vectors shared with internal/origin (design D2, D5).
describe('Obsidian note origins (shared vectors with internal/origin)', () => {
  type Vector = { name: string; origin: Origin; valid: boolean; link: boolean | null; label?: string | null; tooltip?: string | null }
  const cases = (vectors as unknown as { obsidian: Vector[] }).obsidian
  it('has the cases', () => expect(cases.length).toBeGreaterThanOrEqual(30))
  for (const c of cases) {
    it(c.name, () => {
      const o = c.origin
      if (c.link !== null) expect(!!obsidianLink(o.url ?? '')).toBe(c.link)
      if (o.kind === 'obsidian' && o.id && o.url && !o.provider) expect(!!obsidianURL(o.url, o.id)).toBe(c.valid)
      // Only a valid origin is a link on the device, whatever the kind says.
      if (!c.valid && !(o.kind === 'obsidian' && o.provider)) expect(originLink(o)).toBeNull()
      if (!c.valid) return
      expect(originLink(o)).toEqual({ href: o.url, obsidian: true })
      expect(originLabel(o)).toBe(c.label)
      const place = obsidianPlace(o)
      expect(place && `Open in Obsidian: ${place.vault} › ${place.path}`).toBe(c.tooltip)
      expect(originIcon(o)).toBe('notebook-pen')
    })
  }
})

describe('opening an Obsidian origin', () => {
  const note: Origin = { kind: 'obsidian', id: 'Daily/2026-10-29.md', url: 'obsidian://open?vault=Notes&file=Daily%2F2026-10-29' }
  const g = globalThis as unknown as { window?: Record<string, unknown>; document?: unknown }
  const saved = { window: g.window, document: g.document }
  afterEach(() => { g.window = saved.window; g.document = saved.document })

  function browser() {
    const clicked: string[] = []
    const opened = vi.fn()
    g.window = { open: opened }
    g.document = { createElement: () => { const a = { href: '', rel: '', click: () => clicked.push(a.href) }; return a } }
    return { clicked, opened }
  }

  it('activates a link in a browser, never a new tab', () => {
    const b = browser()
    openOrigin(note)
    expect(b.clicked).toEqual([note.url])
    expect(b.opened).not.toHaveBeenCalled()
  })

  it('opens nothing for a url origin or a decrypted value with another Obsidian action', () => {
    const b = browser()
    openOrigin({ kind: 'url', url: 'obsidian://open?vault=Notes&file=a' })
    openOrigin({ kind: 'obsidian', id: 'a.md', url: 'obsidian://new?vault=Notes&name=a' })
    expect(b.clicked).toEqual([])
    expect(b.opened).not.toHaveBeenCalled()
  })

  it('hands it to a shell that lists obsidian-links, and only then', () => {
    const openExternal = vi.fn()
    const s: OpenTodoShell = { bridge: 1, platform: 'android', app: '0.20.0', capabilities: ['links'], openExternal }
    g.window = { opentodoShell: s }
    expect(originLink(note)).toBeNull()
    openOrigin(note)
    expect(openExternal).not.toHaveBeenCalled()
    g.window = { opentodoShell: { ...s, capabilities: ['links', 'obsidian-links'] } }
    openOrigin(note)
    expect(openExternal).toHaveBeenCalledTimes(1)
    expect(openExternal).toHaveBeenCalledWith(note.url)
  })
})
