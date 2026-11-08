// @vitest-environment happy-dom
// "Something isn't working" (OpenSpec feedback-door, tasks 2.1 and 3.1): the dialog from Settings →
// About and from the account menu, the two doors, the long-text fallback, and no request of its own.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AboutSection } from './AboutSection'
import { FeedbackHost } from './FeedbackHost'
import { closeFeedback, openFeedback } from '../lib/feedbackRequest'
import type { User } from '../lib/types'
import { click, render, waitFor } from '../ui/test-utils'

const config = vi.hoisted(() => ({ email: '' }))
vi.mock('../lib/feedback', async (orig) => ({
  ...(await orig<typeof import('../lib/feedback')>()),
  get FEEDBACK_EMAIL() { return config.email },
}))

const user: User = { id: 'u1', email: 'ada@example.com', name: 'Ada', role: 'owner', createdAt: 1 }
const box = () => document.querySelector<HTMLTextAreaElement>('[data-feedback-text]')
const button = (attr: string) => document.querySelector<HTMLButtonElement>(`[${attr}]`)!
const cancel = () => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Cancel')!

/** Types into the textarea the way the browser does: the value, then the input event React listens for. */
function typeInto(el: HTMLTextAreaElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  set.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

let opened: string[]
let openSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  localStorage.clear()
  opened = []
  config.email = ''
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"version":"0.22.0"}', { status: 200 })))
  openSpy = vi.spyOn(window, 'open').mockImplementation((url?: string | URL) => { opened.push(String(url)); return null })
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn(async () => undefined) } })
  history.replaceState(null, '', '/today')
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  closeFeedback()
})

describe('Something isn\'t working', () => {
  it('opens from Settings → About, and Cancel closes it', async () => {
    const r = await render(<><AboutSection user={user} /><FeedbackHost /></>)
    expect(box()).toBeNull()
    await click(button('data-about-feedback'))
    await waitFor(() => !!box(), 'the dialog')
    await click(cancel())
    await waitFor(() => box() === null, 'the dialog closed')
    await r.unmount()
  })

  it('starts with the context block after a blank line, and a hello stays first', async () => {
    const r = await render(<FeedbackHost />)
    openFeedback()
    await waitFor(() => !!box(), 'the dialog')
    expect(box()!.value.startsWith('\n\n--\nOpenTodo ')).toBe(true)
    typeInto(box()!, 'hi' + box()!.value)
    expect(box()!.value.startsWith('hi\n\n--\nOpenTodo ')).toBe(true)
    await r.unmount()
  })

  it('sends only the sentence when the context block was deleted', async () => {
    const r = await render(<FeedbackHost />)
    openFeedback()
    await waitFor(() => !!box(), 'the dialog')
    typeInto(box()!, 'the date picker closes by itself')
    await click(button('data-feedback-github'))
    const url = new URL(opened[0])
    expect(url.searchParams.get('title')).toBe('the date picker closes by itself')
    expect(url.searchParams.get('body')).toBe('the date picker closes by itself')
    await r.unmount()
  })

  it('offers Open on GitHub, and not Send by email while no feedback address is set', async () => {
    const r = await render(<FeedbackHost />)
    openFeedback()
    await waitFor(() => !!box(), 'the dialog')
    expect(button('data-feedback-github')).toBeTruthy()
    expect(document.querySelector('[data-feedback-email]')).toBeNull()
    await r.unmount()
  })

  it('sends by email to the published address when one is set', async () => {
    config.email = 'feedback@example.org'
    const r = await render(<FeedbackHost />)
    openFeedback()
    await waitFor(() => !!box(), 'the dialog')
    typeInto(box()!, 'Hi there')
    await click(button('data-feedback-email'))
    const url = new URL(opened[0])
    expect(url.protocol).toBe('mailto:')
    expect(url.pathname).toBe('feedback@example.org')
    expect(url.searchParams.get('subject')).toBe('Hi there')
    expect(url.searchParams.get('body')).toBe('Hi there')
    await r.unmount()
  })

  it('copies a very long text and opens the link without the body', async () => {
    const r = await render(<FeedbackHost />)
    openFeedback()
    await waitFor(() => !!box(), 'the dialog')
    const long = 'x'.repeat(2000)
    typeInto(box()!, long)
    await click(button('data-feedback-github'))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(long)
    expect(new URL(opened[0]).searchParams.has('body')).toBe(false)
    await waitFor(() => !!document.querySelector('[data-feedback-notice]'), 'the notice')
    expect(document.querySelector('[data-feedback-notice]')!.textContent).toContain('copied')
    await r.unmount()
  })

  it('makes no request of its own when a door is used', async () => {
    const r = await render(<FeedbackHost />)
    openFeedback()
    await waitFor(() => !!box(), 'the dialog')
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockClear()
    typeInto(box()!, 'Something broke')
    await click(button('data-feedback-github'))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(openSpy).toHaveBeenCalledTimes(1)
    await r.unmount()
  })
})
