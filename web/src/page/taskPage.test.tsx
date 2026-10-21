// @vitest-environment happy-dom
// The task page a guest opens (OpenSpec task-pages, "The task page", "Guests name
// themselves", "Encrypted task pages").
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { b64url } from '../lib/crypto'
import { encryptSnapshot, generateShareKey } from '../lib/taskPageCrypto'
import type { TaskPageContent } from '../lib/types'
import { click, render, type, waitFor } from '../ui/test-utils'
import { TaskPageScreen } from './TaskPageScreen'

const SECRET = 'abcdefghijklmnopqrstuv'
const content: TaskPageContent = {
  id: 't1', title: 'Paint the fence', description: 'Two coats of **white**', due: { date: '2026-10-25' }, deadline: null, completed_at: null,
  subtasks: [{ id: 's1', title: 'Buy primer', completed_at: null, depth: 1 }, { id: 's2', title: 'Sand the boards', completed_at: null, depth: 2 }],
  links: [{ id: 'a1', name: 'Paint shop', url: 'https://example.com/paint' }], files: [], location: null,
  comments: [{ id: 'c1', name: 'Marco', guest: true, body: 'Need more paint', createdAt: 1 }],
}

type Answer = { status: number; body: unknown } | 'network'
let answer: (method: string, path: string, body: unknown) => Answer
const sent: { method: string; path: string; body: unknown }[] = []

beforeEach(() => {
  sent.length = 0
  localStorage.clear()
  vi.stubGlobal('fetch', (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://test.invalid')
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    sent.push({ method, path: url.pathname, body })
    expect(init?.credentials).toBe('omit')
    const a = answer(method, url.pathname, body)
    if (a === 'network') throw new TypeError('Failed to fetch')
    return new Response(JSON.stringify(a.body), { status: a.status, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch)
})
afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const live = (rights: string, extra: Partial<TaskPageContent> = {}) => ({ status: 200, body: { mode: 'live', rights, serverTime: Date.now(), label: null, ...content, ...extra } })

describe('a live page', () => {
  it('read-only: the task, no reply box and no checkboxes', async () => {
    answer = () => live('view')
    const r = await render(<TaskPageScreen secret={SECRET} fragment="" />)
    await waitFor(() => !!r.container.querySelector('h1'), 'the title')
    expect(r.container.querySelector('h1')!.textContent).toBe('Paint the fence')
    expect(r.container.textContent).toContain('It is read-only')
    expect(r.container.textContent).toContain('Marco (guest)')
    expect(r.container.querySelector('textarea')).toBeNull()
    expect(r.container.querySelector('input[type=checkbox]')).toBeNull()
    const link = r.container.querySelector<HTMLAnchorElement>('a[href="https://example.com/paint"]')!
    expect(link.target).toBe('_blank')
    expect(link.rel).toContain('noreferrer')
    await r.unmount()
  })

  it('tick rights: Space ticks a subtask, focus stays on it, the server is told', async () => {
    answer = (m, p) => (m === 'POST' && p.endsWith('/tick') ? { status: 200, body: { taskId: 's1', completed_at: 2 } } : live('tick'))
    const r = await render(<TaskPageScreen secret={SECRET} fragment="" />)
    await waitFor(() => !!r.container.querySelector('input[type=checkbox]'), 'the checklist')
    // A name first: the page remembers it per page in this browser.
    const box = r.container.querySelector<HTMLInputElement>('input[type=checkbox]')!
    box.focus()
    await click(box)
    await waitFor(() => !!r.container.querySelector('input[maxlength="40"]'), 'the name prompt')
    await type(r.container.querySelector<HTMLInputElement>('input[maxlength="40"]')!, 'Marco')
    await click([...r.container.querySelectorAll('button')].find((b) => b.textContent === 'Save name')!)
    const again = r.container.querySelector<HTMLInputElement>('input[type=checkbox]')!
    again.focus()
    await click(again)
    await waitFor(() => sent.some((s) => s.path.endsWith('/tick')), 'the tick request')
    expect(sent.find((s) => s.path.endsWith('/tick'))!.body).toEqual({ taskId: 's1', completed: true, name: 'Marco' })
    expect(document.activeElement).toBe(again)
    expect(Object.keys(localStorage).some((k) => k.startsWith('opentodo.taskPage.') && localStorage.getItem(k) === 'Marco')).toBe(true)
    await r.unmount()
  })

  it('a first reply asks for a name, then sends', async () => {
    answer = (m, p) => (m === 'POST' && p.endsWith('/replies') ? { status: 201, body: { id: 'c2' } } : live('reply'))
    const r = await render(<TaskPageScreen secret={SECRET} fragment="" />)
    await waitFor(() => !!r.container.querySelector('textarea'), 'the reply box')
    const area = r.container.querySelector('textarea')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area, 'Done the first coat')
      area.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click(r.container.querySelector('[data-page-send]')!)
    await waitFor(() => !!r.container.querySelector('input[maxlength="40"]'), 'the name prompt')
    expect(sent.some((s) => s.path.endsWith('/replies'))).toBe(false)
    await type(r.container.querySelector<HTMLInputElement>('input[maxlength="40"]')!, 'Marco')
    await click([...r.container.querySelectorAll('button')].find((b) => b.textContent === 'Save name')!)
    await waitFor(() => sent.some((s) => s.path.endsWith('/replies')), 'the reply')
    expect(sent.find((s) => s.path.endsWith('/replies'))!.body).toEqual({ name: 'Marco', body: 'Done the first coat' })
    await waitFor(() => r.container.textContent!.includes('Replying as Marco'), 'the remembered name')
    await r.unmount()
  })

  it('offline: keeps the content, says so, turns actions off', async () => {
    let up = true
    answer = () => (up ? live('tick') : 'network')
    const r = await render(<TaskPageScreen secret={SECRET} fragment="" />)
    await waitFor(() => !!r.container.querySelector('textarea'), 'the page')
    up = false
    await act(async () => { window.dispatchEvent(new Event('online')) })
    await waitFor(() => r.container.textContent!.includes('Could not refresh'), 'the offline notice')
    expect(r.container.querySelector('h1')!.textContent).toBe('Paint the fence')
    expect(r.container.querySelector<HTMLTextAreaElement>('textarea')!.disabled).toBe(true)
    expect(r.container.querySelector<HTMLInputElement>('input[type=checkbox]')!.disabled).toBe(true)
    await r.unmount()
  })

  it('a revoked or expired page says it is no longer available', async () => {
    answer = () => ({ status: 404, body: { error: { code: 'page_invalid', message: 'gone' } } })
    const r = await render(<TaskPageScreen secret={SECRET} fragment="" />)
    await waitFor(() => r.container.textContent!.includes('no longer available'), 'the gone state')
    await r.unmount()
  })
})

describe('an encrypted page', () => {
  it('opens with the full link, and shows nothing without it', async () => {
    const key = await generateShareKey()
    const fragment = '#' + b64url(new Uint8Array(await crypto.subtle.exportKey('raw', key)))
    const snapshot = await encryptSnapshot(key, content)
    answer = () => ({ status: 200, body: { mode: 'encrypted', rights: 'reply', serverTime: Date.now(), label: null, snapshot, snapshotAt: 5 } })
    const r = await render(<TaskPageScreen secret={SECRET} fragment={fragment} />)
    await waitFor(() => !!r.container.querySelector('h1'), 'the title')
    expect(r.container.querySelector('h1')!.textContent).toBe('Paint the fence')
    await r.unmount()
    for (const wrong of ['', '#' + 'A'.repeat(43)]) {
      const w = await render(<TaskPageScreen secret={SECRET} fragment={wrong} />)
      await waitFor(() => w.container.textContent!.includes('cannot be opened without the full link'), 'the locked state')
      expect(w.container.textContent).not.toContain('Paint the fence')
      await w.unmount()
    }
  })
})
