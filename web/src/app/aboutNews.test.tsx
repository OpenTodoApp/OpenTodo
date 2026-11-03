// @vitest-environment happy-dom
// Settings → About → What's new (OpenSpec whats-new, tasks 2.1–2.2): the card's states, the
// language note, the dot, and what recording the read version does on this device.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyLanguagePreference } from '../lib/i18n'
import { newsNotices, newsSeen } from '../lib/whatsNew'
import { render } from '../ui/test-utils'
import WhatsNew, { type NewsEntry } from './WhatsNew'

// Two entries are shipped by the test, not by the build (which is empty here).
vi.mock('../generated/newsIndex.json', () => ({ default: { latest: '0.20.0', versions: ['0.20.0', '0.19.1'] } }))

const entries: NewsEntry[] = [
  { version: '0.20.0', date: '2026-11-10', body: 'Tasks sort by time. Routines read notes.' },
  { version: '0.19.1', date: '2026-11-01', body: 'A small fix.' },
]

beforeEach(() => { localStorage.clear() })
afterEach(async () => {
  localStorage.clear()
  await applyLanguagePreference('en', ['en-US'])
  vi.restoreAllMocks()
})

describe('What\'s new card', () => {
  it('shows the empty line and no dot when nothing is published', async () => {
    // A version the build has no entry for (the index lists the test's entries, not this).
    const r = await render(<WhatsNew serverVersion="0.30.0" entries={[]} />)
    expect(r.container.querySelector('[data-whats-new-empty]')?.textContent).toBe('Nothing new in this version yet.')
    expect(r.container.querySelector('[data-news-dot]')).toBeNull()
    await r.unmount()
  })

  it('shows the newest entry in full, the earlier ones behind a closed disclosure', async () => {
    const r = await render(<WhatsNew serverVersion={null} entries={entries} />)
    const newest = r.container.querySelector('[data-whats-new-newest]')
    expect(newest?.getAttribute('data-whats-new-newest')).toBe('0.20.0')
    expect(newest?.textContent).toContain('Tasks sort by time. Routines read notes.')
    const earlier = r.container.querySelector('[data-whats-new-earlier]') as HTMLDetailsElement
    expect(earlier.open).toBe(false)
    expect(earlier.textContent).toContain('0.19.1')
    await r.unmount()
  })

  it('links each version to its GitHub release in a new tab', async () => {
    const r = await render(<WhatsNew serverVersion={null} entries={entries} />)
    const link = r.container.querySelector('[data-whats-new-release="0.20.0"]') as HTMLAnchorElement
    expect(link.href).toBe('https://github.com/OpenTodoApp/OpenTodo/releases/tag/v0.20.0')
    expect(link.target).toBe('_blank')
    await r.unmount()
  })

  it('loads nothing when it renders', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const r = await render(<WhatsNew serverVersion="0.20.0" entries={entries} />)
    expect(fetchSpy).not.toHaveBeenCalled()
    await r.unmount()
  })

  it('says the notes are in English in French, and nothing in English', async () => {
    const en = await render(<WhatsNew serverVersion={null} entries={entries} />)
    expect(en.container.querySelector('[data-whats-new-english-note]')).toBeNull()
    await en.unmount()
    await applyLanguagePreference('fr', ['en-US'])
    const fr = await render(<WhatsNew serverVersion={null} entries={entries} />)
    expect(fr.container.querySelector('[data-whats-new-english-note]')?.textContent).toBe('Ces notes sont en anglais.')
    // The entry body stays the English text.
    expect(fr.container.querySelector('[data-whats-new-newest]')?.textContent).toContain('Tasks sort by time.')
    await fr.unmount()
  })
})

describe('the new-version dot', () => {
  it('shows for an unread version with notices on, and records it when the card leaves the screen', async () => {
    const r = await render(<WhatsNew serverVersion="0.20.0" entries={entries} />)
    expect(r.container.querySelector('[data-news-dot]')?.getAttribute('aria-label')).toBe('New notes')
    expect(newsSeen.get()).toBeNull()
    await r.unmount()
    expect(newsSeen.get()).toBe('0.20.0')
  })

  it('does not show once the version is recorded', async () => {
    newsSeen.set('0.20.0')
    const r = await render(<WhatsNew serverVersion="0.20.0" entries={entries} />)
    expect(r.container.querySelector('[data-news-dot]')).toBeNull()
    await r.unmount()
  })

  it('is hidden while notices are off, and the card still records the version', async () => {
    newsNotices.set(false)
    const r = await render(<WhatsNew serverVersion="0.20.0" entries={entries} />)
    expect(r.container.querySelector('[data-news-dot]')).toBeNull()
    expect(r.container.querySelector('[data-whats-new-newest]')).not.toBeNull()
    await r.unmount()
    expect(newsSeen.get()).toBe('0.20.0')
  })

  it('is hidden when the server version is unknown, and records the newest entry on leaving', async () => {
    const r = await render(<WhatsNew serverVersion={null} entries={entries} />)
    expect(r.container.querySelector('[data-news-dot]')).toBeNull()
    await r.unmount()
    expect(newsSeen.get()).toBe('0.20.0')
  })

  it('is hidden for a version without an entry', async () => {
    const r = await render(<WhatsNew serverVersion="0.21.0" entries={entries} />)
    expect(r.container.querySelector('[data-news-dot]')).toBeNull()
    await r.unmount()
  })

  it('a second device starts unread', async () => {
    newsSeen.set('0.20.0')
    localStorage.clear()
    const r = await render(<WhatsNew serverVersion="0.20.0" entries={entries} />)
    expect(r.container.querySelector('[data-news-dot]')).not.toBeNull()
    await r.unmount()
  })
})
