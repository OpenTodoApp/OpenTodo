// @vitest-environment happy-dom
// Settings → About's Version row (OpenSpec change version-hint-motion, settings-navigation
// "About section"): the number itself opens the published changelog at this release, and
// the settings search finds the row.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { version as buildVersion } from '../../package.json'
import type { User } from '../lib/types'
import { render, waitFor } from '../ui/test-utils'
import { AboutSection, CHANGELOG_URL, changelogUrl } from './AboutSection'
import { searchSettings } from './settingsIndex'

const member: User = { id: 'u1', email: 'sam@example.com', name: 'Sam', role: 'member', createdAt: 1 }

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  localStorage.clear()
})
afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('changelogUrl', () => {
  it('anchors a release to its own section of the page', () => {
    expect(changelogUrl('1.0.0')).toBe(`${CHANGELOG_URL}#v1-0-0`)
    expect(changelogUrl('0.23.11')).toBe(`${CHANGELOG_URL}#v0-23-11`)
  })

  it('opens the newest release for a version the page has no anchor for', () => {
    expect(changelogUrl('1.0.0-rc.1')).toBe(CHANGELOG_URL)
    expect(changelogUrl('dev+abc1234')).toBe(CHANGELOG_URL)
  })
})

describe('the Version row', () => {
  it('shows this build’s version while the server’s is unknown, and links to the changelog', async () => {
    const r = await render(<AboutSection user={member} />)
    const row = document.querySelector<HTMLAnchorElement>('[data-about-version]')!
    expect(row.textContent).toBe(buildVersion)
    expect(row.tagName).toBe('A')
    expect(row.getAttribute('href')).toBe(changelogUrl(buildVersion))
    expect(row.getAttribute('target')).toBe('_blank')
    expect(row.getAttribute('rel')).toContain('noopener')
    await r.unmount()
  })

  it('links the server’s version once it is known', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ version: '1.0.0' }), { status: 200 })))
    const r = await render(<AboutSection user={member} />)
    await waitFor(() => document.querySelector('[data-about-version]')?.textContent === '1.0.0', 'the server version')
    expect(document.querySelector('[data-about-version]')!.getAttribute('href')).toBe(`${CHANGELOG_URL}#v1-0-0`)
    await r.unmount()
  })

  it('is found by the settings search under "version" and "changelog"', () => {
    for (const q of ['version', 'changelog']) {
      const entries = searchSettings(q, member).flatMap((hit) => hit.entries)
      expect(entries.some((e) => e.anchor === 'about-version' && e.label === 'Version')).toBe(true)
    }
  })
})
