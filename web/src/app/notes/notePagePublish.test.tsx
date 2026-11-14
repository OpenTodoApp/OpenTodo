// @vitest-environment happy-dom
// Publishing a note page from the note's menu (OpenSpec note-public-links,
// "Publishing from a note"): "Publish and copy", "Keyboard only" and "Offline".
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDatabase } from '../../lib/db'
import { createNote } from '../../lib/noteOps'
import { resetDeviceId } from '../../lib/ops'
import { setCurrentUserId } from '../../lib/sharing'
import { setKnownTaskPages } from '../../lib/taskPageStore'
import { click, key, render, waitFor } from '../../ui/test-utils'
import { NotePanel } from './NoteEditor'

const ME = 'u-me'
let run = 0
let published = false
const requests: { method: string; path: string; body?: unknown }[] = []
const STATUS = { id: 'p1', noteId: '', label: 'babysitter-how-to', createdBy: ME, publishedAt: 1, expiresAt: null, lastOpenedAt: null, encrypted: false, snapshotAt: null }

beforeEach(() => {
  useDatabase(`note-page-publish-${run++}`)
  resetDeviceId()
  setCurrentUserId(ME)
  setKnownTaskPages([])
  published = false
  requests.length = 0
  vi.stubGlobal('fetch', (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://test.invalid').pathname
    const method = init?.method ?? 'GET'
    requests.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
    const noteId = /\/api\/v1\/notes\/([^/]+)\/page$/.exec(path)?.[1]
    if (noteId && method === 'GET') return published ? json(200, { ...STATUS, noteId }) : json(404, { error: { code: 'not_found', message: 'no page' } })
    if (noteId && method === 'POST') {
      published = true
      return json(201, { id: 'p1', noteId, label: 'babysitter-how-to', encrypted: false, publishedAt: 1, expiresAt: null, link: 'https://todo.example.com/n/abcdefghijklmnopqrstuv/babysitter-how-to' })
    }
    if (path === '/api/v1/me') return json(200, { user: { id: ME, name: 'Raffaele' } })
    return json(200, {})
  }) as typeof fetch)
})
afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function openMenu(container: HTMLElement) {
  await waitFor(() => !!container.querySelector('[data-note-menu]'), 'the note menu')
  const trigger = container.querySelector<HTMLButtonElement>('[data-note-menu]')!
  trigger.focus()
  await click(trigger)
  await waitFor(() => !!document.querySelector('[data-publish-note-page]'), 'Publish note page…')
  return trigger
}

describe('publishing from a note', () => {
  it('Publish and copy: the link once, the one-time notice, then the Published marker', async () => {
    const id = await createNote({ title: 'Babysitter how-to', description: 'Bedtime at 8' })
    const r = await render(<NotePanel id={id} />)
    await openMenu(r.container)
    const item = document.querySelector<HTMLButtonElement>('[data-publish-note-page]')!
    expect(item.textContent).toContain('Publish note page…')
    await click(item)
    await waitFor(() => !!document.querySelector('[data-page-publish]'), 'the publish dialog')
    expect(document.querySelector<HTMLInputElement>('[data-page-label]')!.value).toBe('babysitter-how-to')
    expect(document.querySelector('[data-page-rights]')).toBeNull()
    await click(document.querySelector('[data-page-publish]')!)
    await waitFor(() => !!document.querySelector('[data-page-link]'), 'the link')
    expect(document.querySelector<HTMLInputElement>('[data-page-link]')!.value).toContain('/n/abcdefghijklmnopqrstuv/babysitter-how-to')
    expect(document.body.textContent).toContain('it will not be shown again')
    expect(document.body.textContent).toContain('Anyone with the link can read the note')
    expect(document.querySelector('[data-page-copy]')).not.toBeNull()
    expect(requests.find((q) => q.method === 'POST')!).toMatchObject({ path: `/api/v1/notes/${id}/page`, body: { label: 'babysitter-how-to' } })
    await click(document.querySelector('[data-page-close]')!)
    await waitFor(() => !!r.container.querySelector('[data-page-marker]'), 'the Published marker')
    expect(r.container.querySelector('[data-page-marker]')!.textContent).toContain('Published')
    // The marker opens the status with Copy a new link and Revoke.
    await click(r.container.querySelector('[data-page-marker]')!)
    await waitFor(() => !!document.querySelector('[data-page-status]'), 'the status')
    expect(document.querySelector('[data-page-publish]')!.textContent).toBe('Copy a new link')
    await click(document.querySelector('[data-page-revoke]')!)
    await waitFor(() => !r.container.querySelector('[data-page-marker]'), 'the marker gone after Revoke')
    expect(requests.some((q) => q.method === 'DELETE' && q.path === `/api/v1/notes/${id}/page`)).toBe(true)
    await r.unmount()
  })

  it('Keyboard only: menu, publish, copy and close with Tab, Enter and Escape; focus returns to the menu button', async () => {
    const id = await createNote({ title: 'Babysitter how-to' })
    const r = await render(<NotePanel id={id} />)
    const trigger = await openMenu(r.container)
    // Arrow keys reach the item; Enter chooses it.
    for (let i = 0; i < 10 && !document.activeElement?.hasAttribute('data-publish-note-page'); i++) await key(document.activeElement!, 'ArrowDown')
    expect(document.activeElement?.hasAttribute('data-publish-note-page')).toBe(true)
    await key(document.activeElement!, 'Enter')
    await click(document.activeElement!) // Enter on a native button activates it
    await waitFor(() => !!document.querySelector('[data-page-publish]'), 'the publish dialog')
    const publish = document.querySelector<HTMLButtonElement>('[data-page-publish]')!
    publish.focus()
    await key(publish, 'Enter')
    await click(publish)
    await waitFor(() => !!document.querySelector('[data-page-copy]'), 'the copy button')
    const copy = document.querySelector<HTMLButtonElement>('[data-page-copy]')!
    copy.focus()
    await click(copy)
    await key(document.activeElement ?? document, 'Escape')
    await waitFor(() => !document.querySelector('[data-testid="note-page-dialog"]'), 'the dialog closed')
    await waitFor(() => document.activeElement === trigger, 'focus back on the menu button')
    await r.unmount()
  })

  it('Offline: the item is disabled with "Note pages need a connection" and no marker shows', async () => {
    const id = await createNote({ title: 'Offline note' })
    setKnownTaskPages([{ ...STATUS, noteId: id, kind: 'note', taskId: '', rights: 'view', includeMap: false, replies: 0, ticks: 0, pendingReplies: 0 }])
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const r = await render(<NotePanel id={id} />)
    await openMenu(r.container)
    const item = document.querySelector<HTMLButtonElement>('[data-publish-note-page]')!
    expect(item.disabled).toBe(true)
    expect(item.textContent).toContain('Note pages need a connection')
    expect(r.container.querySelector('[data-page-marker]')).toBeNull()
    online.mockRestore()
    await r.unmount()
  })
})
