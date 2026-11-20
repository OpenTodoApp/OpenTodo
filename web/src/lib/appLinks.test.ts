// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import vectors from '../../../internal/origin/testdata/app_links.vectors.json'
import {
  allowsAppLink, appLinkScheme, appLinkSchemesValue, openAppLink, pendingAppLink, readAppLinkSchemes, schemeEntryProblem,
  setAppLinkSchemes, trustScheme, validSchemeEntry,
} from './appLinks'

afterEach(() => {
  setAppLinkSchemes([])
  pendingAppLink.set(null)
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('app link vectors (shared with Go and the shells)', () => {
  it('links', () => {
    for (const c of vectors.links) expect(appLinkScheme(c.url), c.url).toBe(c.scheme)
  })
  it('entries', () => {
    for (const c of vectors.entries) expect(validSchemeEntry(c.entry), c.entry).toBe(c.ok)
  })
  it('allows', () => {
    for (const c of vectors.allows) expect(allowsAppLink(c.list, c.url), `${c.list} ${c.url}`).toBe(c.ok)
  })
})

describe('the list', () => {
  it('reads valid entries only, and nothing while locked or undecryptable', () => {
    const row = { app_link_schemes: JSON.stringify(['zotero', 'javascript', 'Bad', 'obsidian:open', 'zotero']) }
    expect(readAppLinkSchemes(row)).toEqual(['zotero', 'obsidian:open'])
    expect(readAppLinkSchemes(row, true)).toEqual([])
    expect(readAppLinkSchemes({ ...row, _e2ee: { raw: { app_link_schemes: 'enc' } } })).toEqual([])
    expect(readAppLinkSchemes({ app_link_schemes: 'not json' })).toEqual([])
    expect(appLinkSchemesValue([])).toBe('')
  })
  it('refuses denied, malformed, duplicate entries and a full list', () => {
    expect(schemeEntryProblem('javascript', [])).toBe('denied')
    expect(schemeEntryProblem('https', [])).toBe('denied')
    expect(schemeEntryProblem('a b', [])).toBe('invalid')
    expect(schemeEntryProblem('Zotero://', ['zotero'])).toBe('duplicate')
    expect(schemeEntryProblem('mid', Array.from({ length: 20 }, (_, i) => `s${i}`))).toBe('full')
    expect(schemeEntryProblem('zotero', [])).toBeNull()
  })
})

describe('opening', () => {
  it('nothing opens without the viewer allowing the scheme', () => {
    expect(openAppLink('zotero://select/items/ABC')).toBe(false)
    expect(pendingAppLink.get()).toBeNull()
  })
  it('asks the first time on a device, then opens at once', () => {
    setAppLinkSchemes(['zotero'])
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    expect(openAppLink('zotero://select/items/ABC')).toBe(true)
    expect(pendingAppLink.get()).toEqual({ url: 'zotero://select/items/ABC', scheme: 'zotero' })
    expect(click).not.toHaveBeenCalled()
    pendingAppLink.set(null)
    trustScheme('zotero')
    expect(openAppLink('zotero://select/items/ABC')).toBe(true)
    expect(pendingAppLink.get()).toBeNull()
    expect(click).toHaveBeenCalledTimes(1)
  })
  it('a denied scheme never opens, even when listed by a stored value', () => {
    setAppLinkSchemes(['javascript'])
    expect(openAppLink('javascript:alert(1)')).toBe(false)
  })
})
