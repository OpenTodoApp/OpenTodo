// @vitest-environment happy-dom
// The note page a guest opens (OpenSpec note-public-links, "The note page", "What a
// note page shows", "Encrypted note pages"): "Guest opens it", "Link to another
// note" and "Encrypted note page".
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { b64url } from '../lib/crypto'
import { encryptSnapshot, generateShareKey } from '../lib/taskPageCrypto'
import type { NotePageContent } from '../lib/types'
import { render, waitFor } from '../ui/test-utils'
import { NotePageScreen } from './NotePageScreen'
import { TaskPageScreen } from './TaskPageScreen'

const SECRET = 'abcdefghijklmnopqrstuv'
const content: NotePageContent = {
  title: 'Babysitter how-to',
  text: 'Bedtime at **8**. The Door code is on the fridge.\n\n- [x] dinner\n- [ ] bath\n\n![The kitchen](attachment:img1)',
  changedAt: Date.now() - 5 * 60_000,
  links: [],
  files: [{ id: 'img1', name: 'kitchen.png', size: 10, image: true }, { id: 'f2', name: 'allergies.pdf', size: 20, image: false }],
}

type Answer = { status: number; body: unknown } | 'network'
let answer: (method: string, path: string) => Answer
const sent: string[] = []

beforeEach(() => {
  sent.length = 0
  vi.stubGlobal('fetch', (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://test.invalid')
    sent.push(url.pathname)
    expect(init?.credentials).toBe('omit')
    const a = answer(init?.method ?? 'GET', url.pathname)
    if (a === 'network') throw new TypeError('Failed to fetch')
    return new Response(JSON.stringify(a.body), { status: a.status, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch)
})
afterEach(() => vi.unstubAllGlobals())

const live = (extra: Partial<NotePageContent> = {}) => ({ status: 200, body: { kind: 'note', mode: 'live', rights: 'view', serverTime: Date.now(), label: null, ...content, ...extra } })

describe('a live note page', () => {
  it('Guest opens it: title, change time, notice, text with read-only checklist, the photo in place and the file as a download', async () => {
    answer = () => live()
    const r = await render(<NotePageScreen secret={SECRET} fragment="" />)
    await waitFor(() => !!r.container.querySelector('h1'), 'the title')
    expect(r.container.querySelector('h1')!.textContent).toBe('Babysitter how-to')
    expect(r.container.textContent).toContain('Changed 5 min ago')
    expect(r.container.textContent).toContain('Anyone with the link can read this note. It is read-only.')
    expect(r.container.querySelector('strong')!.textContent).toBe('8')
    const boxes = [...r.container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')]
    expect(boxes.length).toBe(2)
    expect(boxes.every((b) => b.disabled)).toBe(true)
    const img = r.container.querySelector<HTMLImageElement>('[data-page-image]')!
    expect(img.getAttribute('src')).toBe(`/api/v1/pages/${SECRET}/files/img1`)
    expect(img.alt).toBe('The kitchen')
    expect(img.className).toContain('max-w-full')
    // The embedded photo is not listed again; the other file is a download.
    const downloads = [...r.container.querySelectorAll<HTMLAnchorElement>('a[download]')]
    expect(downloads.map((a) => a.textContent)).toEqual(['allergies.pdf'])
    expect(downloads[0].getAttribute('href')).toBe(`/api/v1/pages/${SECRET}/files/f2?download=1`)
    expect(r.container.querySelector('textarea, form')).toBeNull()
    await r.unmount()
  })

  it('Link to another note: the text the publisher wrote, as plain text that leads nowhere', async () => {
    answer = () => live({ text: 'Ask about Door code first.', files: [] })
    const r = await render(<NotePageScreen secret={SECRET} fragment="" />)
    await waitFor(() => !!r.container.querySelector('h1'), 'the title')
    expect(r.container.textContent).toContain('Ask about Door code first.')
    expect(r.container.querySelector('a')).toBeNull()
    await r.unmount()
  })

  it('refreshes while open and keeps the content when the server cannot be reached', async () => {
    let up = true
    answer = () => (up ? live() : 'network')
    const r = await render(<NotePageScreen secret={SECRET} fragment="" />)
    await waitFor(() => !!r.container.querySelector('h1'), 'the page')
    up = false
    await act(async () => { window.dispatchEvent(new Event('online')) })
    await waitFor(() => r.container.textContent!.includes('Could not refresh'), 'the offline notice')
    expect(r.container.querySelector('h1')!.textContent).toBe('Babysitter how-to')
    await r.unmount()
  })

  it('a revoked page says it is no longer available', async () => {
    answer = () => ({ status: 404, body: { error: { code: 'page_invalid', message: 'gone' } } })
    const r = await render(<NotePageScreen secret={SECRET} fragment="" />)
    await waitFor(() => r.container.textContent!.includes('no longer available'), 'the gone state')
    await r.unmount()
  })

  it('the secret decides the layout: /t/ of a note page shows the note', async () => {
    answer = () => live()
    const r = await render(<TaskPageScreen secret={SECRET} fragment="" />)
    await waitFor(() => !!r.container.querySelector('[data-note-page-view]'), 'the note layout')
    expect(r.container.querySelector('h1')!.textContent).toBe('Babysitter how-to')
    await r.unmount()
  })
})

describe('an encrypted note page', () => {
  it('Encrypted note page: decrypts with the full link, says images and files are left out, and shows nothing without the fragment', async () => {
    const key = await generateShareKey()
    const fragment = '#' + b64url(new Uint8Array(await crypto.subtle.exportKey('raw', key)))
    const snapshot = await encryptSnapshot(key, { ...content, files: [], omitted: true })
    answer = () => ({ status: 200, body: { kind: 'note', mode: 'encrypted', rights: 'view', serverTime: Date.now(), label: null, snapshot, snapshotAt: 5 } })
    const r = await render(<NotePageScreen secret={SECRET} fragment={fragment} />)
    await waitFor(() => !!r.container.querySelector('h1'), 'the title')
    expect(r.container.querySelector('h1')!.textContent).toBe('Babysitter how-to')
    expect(r.container.querySelector('[data-page-omitted]')!.textContent).toBe('Images and files are not shown on encrypted pages')
    expect(r.container.querySelector('img')).toBeNull()
    await r.unmount()
    const w = await render(<NotePageScreen secret={SECRET} fragment="" />)
    await waitFor(() => w.container.textContent!.includes('cannot be opened without the full link'), 'the locked state')
    expect(w.container.textContent).not.toContain('Babysitter')
    await w.unmount()
  })
})
