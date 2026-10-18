// @vitest-environment happy-dom
// The owner's welcome note (OpenSpec change welcome-note): once, for the owner of
// a fresh account, never for members, the demo or an account already in use;
// closing it is a synced preference op.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { setDemo } from '../lib/demo'
import { createTask, resetDeviceId } from '../lib/ops'
import { setWelcomeSeen, USER_PREFS_ID } from '../lib/userPrefs'
import type { User } from '../lib/types'
import { click, flush, mockFetch, render } from '../ui/test-utils'
import { AboutSection, DOCS_URL, WEBSITE_URL } from './AboutSection'
import { COFFEE_URL, ISSUES_URL, REPO_URL, WelcomeDialog } from './WelcomeDialog'

const owner: User = { id: 'u1', email: 'ada@example.com', name: 'Ada', role: 'owner', createdAt: Date.now() - 60_000 }
const member: User = { ...owner, id: 'u2', role: 'member' }

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  setDemo(null)
})
afterEach(() => { setDemo(null); document.body.innerHTML = '' })

async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
const dialog = () => document.querySelector('[data-testid="welcome"]')

describe('welcome note', () => {
  it('thanks the owner of a fresh account with the issue, star and coffee links, all opening a new tab', async () => {
    const r = await render(<WelcomeDialog user={owner} />)
    await waitFor(() => dialog() !== null)
    expect(dialog()!.textContent).toContain('Thanks for installing OpenTodo')
    const hrefs = [...dialog()!.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual([ISSUES_URL, REPO_URL, COFFEE_URL])
    for (const a of dialog()!.querySelectorAll('a')) {
      expect(a.getAttribute('target')).toBe('_blank')
      expect(a.getAttribute('rel')).toContain('noopener')
    }
    await r.unmount()
  })

  it('closes for good: the choice is a synced preference', async () => {
    const r = await render(<WelcomeDialog user={owner} />)
    await waitFor(() => dialog() !== null)
    await click(document.querySelector<HTMLElement>('[data-welcome-close]')!)
    await waitFor(() => dialog() === null)
    expect((await db.userPrefs.get(USER_PREFS_ID))?.welcome).toBe('seen')
    expect(await db.outbox.filter((o) => o.entity === 'user_prefs' && o.field === 'welcome').count()).toBe(1)
    await r.unmount()
    const again = await render(<WelcomeDialog user={owner} />)
    await flush(100)
    expect(dialog()).toBeNull()
    await again.unmount()
  })

  it('stays away when another device already closed it', async () => {
    await setWelcomeSeen()
    const r = await render(<WelcomeDialog user={owner} />)
    await flush(100)
    expect(dialog()).toBeNull()
    await r.unmount()
  })

  it('is never shown to members', async () => {
    const m = await render(<WelcomeDialog user={member} />)
    await flush(100)
    expect(dialog()).toBeNull()
    await m.unmount()
  })

  it('is never shown on the demo', async () => {
    setDemo({ resetsAt: 0 } as unknown as Parameters<typeof setDemo>[0])
    const d = await render(<WelcomeDialog user={owner} />)
    await flush(100)
    expect(dialog()).toBeNull()
    await d.unmount()
  })

  it('is not shown to an owner account older than a week', async () => {
    const r = await render(<WelcomeDialog user={{ ...owner, createdAt: Date.now() - 8 * 24 * 60 * 60 * 1000 }} />)
    await flush(100)
    expect(dialog()).toBeNull()
    await r.unmount()
  })

  it('is not shown on an account already in use', async () => {
    await createTask({ title: 'Existing work' })
    const used = await render(<WelcomeDialog user={owner} />)
    await flush(100)
    expect(dialog()).toBeNull()
    await used.unmount()
  })
})

describe('Settings → About', () => {
  beforeEach(() => mockFetch((method, path) => (method === 'GET' && path === '/api/v1/auth/status' ? { version: 'v0.7.2', authenticated: true } : undefined)))
  afterEach(() => vi.unstubAllGlobals())
  const links = () => Object.fromEntries([...document.querySelectorAll<HTMLAnchorElement>('[data-about-link]')].map((a) => [a.dataset.aboutLink, a.getAttribute('href')]))

  it('lists Help, the docs, the website, issues, the source and the coffee button for everyone; no welcome row for a member', async () => {
    const r = await render(<AboutSection user={member} />)
    await flush(30)
    expect(links()).toEqual({ docs: DOCS_URL, website: WEBSITE_URL, issues: ISSUES_URL, source: REPO_URL })
    for (const a of document.querySelectorAll('[data-about-link]')) expect(a.getAttribute('target')).toBe('_blank')
    expect(document.querySelector('[data-welcome-coffee]')!.getAttribute('href')).toBe(COFFEE_URL)
    expect(document.querySelector('[data-about-help]')).not.toBeNull()
    expect(document.querySelector('[data-about-welcome]')).toBeNull()
    await waitFor(() => document.body.textContent!.includes('OpenTodo v0.7.2'))
    await r.unmount()
  })

  it('lets the owner show the welcome note again, without changing the stored choice', async () => {
    await setWelcomeSeen()
    const r = await render(<AboutSection user={owner} />)
    await flush(30)
    await click(document.querySelector<HTMLElement>('[data-about-welcome]')!)
    await waitFor(() => dialog() !== null)
    await click(document.querySelector<HTMLElement>('[data-welcome-close]')!)
    await waitFor(() => dialog() === null)
    expect((await db.userPrefs.get(USER_PREFS_ID))?.welcome).toBe('seen')
    await r.unmount()
  })
})
