// @vitest-environment happy-dom
// Publishing a task page from the task panel (OpenSpec task-pages, "Publishing from
// the task panel"), and guests' replies in the conversation.
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { createTask, mutate } from '../../lib/ops'
import { click } from '../../ui/test-utils'
import { ME, open, settle, setupTaskDetailTests, waitFor } from './taskDetail.testkit'

setupTaskDetailTests()

let published = false
const requests: { method: string; path: string; body?: unknown }[] = []

function stubServer() {
  published = false
  requests.length = 0
  vi.stubGlobal('fetch', (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://test.invalid').pathname
    const method = init?.method ?? 'GET'
    requests.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
    if (path.endsWith('/page') && method === 'GET') {
      return published
        ? json(200, { id: 'p1', taskId: 't', rights: 'tick', label: 'paint', includeMap: true, createdBy: ME, publishedAt: 1, expiresAt: null, lastOpenedAt: null, replies: 2, ticks: 0, encrypted: false, snapshotAt: null, pendingReplies: 0 })
        : json(404, { error: { code: 'not_found', message: 'no page' } })
    }
    if (path.endsWith('/page') && method === 'POST') {
      published = true
      return json(201, { id: 'p1', taskId: 't', rights: 'tick', label: 'paint-the-fence', includeMap: true, encrypted: false, publishedAt: 1, expiresAt: null, link: 'https://todo.example.com/t/abcdefghijklmnopqrstuv/paint-the-fence' })
    }
    if (path === '/api/v1/me') return json(200, { user: { id: ME, name: 'Raffaele' } })
    return json(200, {})
  }) as typeof fetch)
}

afterEach(() => vi.unstubAllGlobals())

async function menuItem(r: { container: HTMLElement }, selector: string) {
  await click(r.container.querySelector('button[aria-label="Task actions"]')!)
  await settle()
  return document.querySelector<HTMLButtonElement>(selector)
}

describe('publishing from the panel', () => {
  it('publish, copy the link once, see the marker and the composer notice', async () => {
    stubServer()
    const id = await createTask({ title: 'Paint the fence' })
    const r = await open(id)
    await click((await menuItem(r, '[data-publish-page]'))!)
    await waitFor(() => !!document.querySelector('[data-page-publish]'), 'the publish dialog')
    expect(document.querySelector<HTMLInputElement>('[data-page-label]')!.value).toBe('paint-the-fence')
    await click(document.querySelector('[data-page-rights="tick"]')!)
    await click(document.querySelector('[data-page-publish]')!)
    await waitFor(() => !!document.querySelector('[data-page-link]'), 'the link')
    expect(document.querySelector<HTMLInputElement>('[data-page-link]')!.value).toContain('/t/abcdefghijklmnopqrstuv/paint-the-fence')
    expect(document.body.textContent).toContain('it will not be shown again')
    expect(requests.find((q) => q.method === 'POST' && q.path.endsWith('/page'))!.body).toMatchObject({ rights: 'tick', label: 'paint-the-fence' })
    await click(document.querySelector('[data-overlay-close]')!)
    await waitFor(() => !!r.container.querySelector('[data-page-marker]'), 'the Published marker')
    // The composer says new comments are visible on the page.
    const resting = r.container.querySelector<HTMLButtonElement>('[data-composer-resting]')
    if (resting) await click(resting)
    await waitFor(() => !!document.querySelector('[data-page-composer-notice]'), 'the composer notice')
    await r.unmount()
  })

  it('offline: the item is disabled and says why; no marker', async () => {
    stubServer()
    published = true
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const id = await createTask({ title: 'Offline task' })
    const r = await open(id)
    const item = await menuItem(r, '[data-publish-page]')
    expect(item!.disabled).toBe(true)
    expect(item!.textContent).toContain('Task pages need a connection')
    expect(r.container.querySelector('[data-page-marker]')).toBeNull()
    online.mockRestore()
    await r.unmount()
  })

  it('a subtask cannot be published on its own', async () => {
    stubServer()
    const parent = await createTask({ title: 'Parent' })
    const child = await createTask({ title: 'Child', parent_id: parent })
    const r = await open(child)
    expect(await menuItem(r, '[data-publish-page]')).toBeNull()
    await r.unmount()
  })
})

describe('guest replies in the conversation', () => {
  it('reads "<name> (guest)" with the task page mark', async () => {
    stubServer()
    const id = await createTask({ title: 'Paint the fence' })
    await mutate('comment', 'c1', { task_id: id, author_id: ME, body: 'Need more paint', parent_id: null, mentions: [], created_at: Date.now(), edited_at: null, deleted_at: null, guest_name: 'Marco', page_id: 'p1' })
    const r = await open(id)
    await waitFor(() => !!r.container.querySelector('[data-guest-comment]'), 'the guest comment')
    const c = r.container.querySelector('[data-guest-comment]')!
    expect(c.textContent).toContain('Marco (guest)')
    expect(c.textContent).toContain('through the task page')
    expect(await db.comments.count()).toBe(1)
    await r.unmount()
  })
})
