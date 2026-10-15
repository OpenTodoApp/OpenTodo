// @vitest-environment happy-dom
// The sidebar scrolls as one (OpenSpec change ux-overhaul, app-shell "Sidebar
// structure"): the name and primary destinations are pinned at the top, Help and
// the account at the bottom, and views, projects and labels share one scroller.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import { createLabel } from '../lib/labels'
import { createProject, resetDeviceId } from '../lib/ops'
import type { User } from '../lib/types'
import { flush, render } from '../ui/test-utils'
import { Sidebar } from './Sidebar'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
})
afterEach(() => { document.body.innerHTML = '' })

async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

describe('one scroller', () => {
  it('only the middle part scrolls; labels live in it, the account row and the primary navigation outside it', async () => {
    for (let i = 0; i < 40; i++) await createProject({ name: `Project ${i}` })
    await createLabel({ name: 'errand' })
    const r = await render(<aside data-sidebar><Sidebar route={{ view: 'inbox' }} user={user} /></aside>)
    await waitFor(() => r.container.textContent!.includes('Project 39') && r.container.textContent!.includes('errand'))
    const side = r.container.querySelector('[data-sidebar]')!
    const scrollers = [...side.querySelectorAll('*')].filter((el) => /\boverflow-y-auto\b/.test(el.className))
    expect(scrollers).toHaveLength(1)
    const scroller = scrollers[0]
    expect(scroller.getAttribute('data-sidebar-scroll')).not.toBeNull()
    // Labels are not nested in the Projects list and share the one scroller.
    const labels = side.querySelector('nav[aria-label="Labels"]')!
    expect(labels).toBeTruthy()
    expect(scroller.contains(labels)).toBe(true)
    expect(side.querySelector('nav[aria-label="Projects"]')!.contains(labels)).toBe(false)
    // Pinned ends: Inbox and the account row are outside the scroller.
    const inbox = [...side.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith('Inbox'))!
    const account = [...side.querySelectorAll('button')].find((b) => b.textContent?.includes('Ada'))!
    const help = [...side.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Help')!
    expect(scroller.contains(inbox)).toBe(false)
    expect(scroller.contains(account)).toBe(false)
    expect(scroller.contains(help)).toBe(false)
    expect(side.querySelector('[data-sidebar-footer]')!.contains(account)).toBe(true)
    await r.unmount()
  })
})
