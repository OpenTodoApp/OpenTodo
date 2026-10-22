// @vitest-environment happy-dom
// The task panel on a phone (OpenSpec changes ux-overhaul and phone-v2, app-shell
// "Panel width and expansion"): below 768 px a bottom sheet at most 90 dvh over a
// scrim, with a handle above the sticky header, closed by Close, a drag down on the
// handle or header, a drag down on the body at scroll top, or the scrim; from 768 px
// the panel keeps its Close.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { createTask, resetDeviceId } from '../../lib/ops'
import type { Label } from '../../lib/types'
import { click, flush, render } from '../../ui/test-utils'
import { TaskDetail } from './TaskDetail'

let width = 390
const original = window.matchMedia

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  window.matchMedia = ((q: string) => ({
    matches: Number(/min-width:\s*(\d+)px/.exec(q)?.[1] ?? 0) <= width, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => { window.matchMedia = original; document.body.innerHTML = ''; vi.unstubAllGlobals() })

async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

function touch(el: Element, type: 'touchstart' | 'touchend', x: number, y: number) {
  const e = new Event(type, { bubbles: true, cancelable: true })
  const point = { clientX: x, clientY: y }
  Object.defineProperty(e, 'touches', { value: type === 'touchstart' ? [point] : [] })
  Object.defineProperty(e, 'changedTouches', { value: [point] })
  el.dispatchEvent(e)
}

describe('below 768 px', () => {
  it('is a bottom sheet over a scrim: a handle above the sticky header, 90 dvh at most, Close in place of Back', async () => {
    width = 390
    const id = await createTask({ title: 'Phone task' })
    let closed = 0
    const r = await render(<TaskDetail taskId={id} projects={[]} labelMap={new Map<string, Label>()} onClose={() => { closed++ }} />)
    await waitFor(() => !!document.querySelector(`[data-detail-for="${id}"]`))
    const panel = document.querySelector<HTMLElement>(`[data-detail-for="${id}"]`)!
    expect(panel.hasAttribute('data-sheet')).toBe(true)
    expect(panel.className).toContain('fixed inset-x-0')
    expect(panel.className).toContain('rounded-t-card')
    expect(panel.style.maxHeight).toBe('calc(90dvh - var(--vv-bottom, 0px))')
    // Above the on-screen keyboard: the composer and the focused field stay in view.
    expect(panel.style.bottom).toBe('var(--vv-bottom, 0px)')
    expect(panel.firstElementChild!.hasAttribute('data-sheet-handle')).toBe(true)
    expect(panel.querySelector('[data-panel-header]')).toBeTruthy()
    expect(panel.querySelector('[data-task-back]')).toBeNull()
    await click(panel.querySelector<HTMLButtonElement>('[aria-label="Close"]')!)
    expect(closed).toBe(1)
    await click(document.querySelector<HTMLElement>('[data-sheet-scrim]')!)
    expect(closed).toBe(2)
    await r.unmount()
  })

  it('a drag down on the handle closes; on the body only at scroll top', async () => {
    width = 390
    const id = await createTask({ title: 'Drag me' })
    let closed = 0
    const r = await render(<TaskDetail taskId={id} projects={[]} labelMap={new Map<string, Label>()} onClose={() => { closed++ }} />)
    await waitFor(() => !!document.querySelector(`[data-detail-for="${id}"]`))
    const handle = document.querySelector('[data-sheet-handle]')!
    touch(handle, 'touchstart', 100, 10); touch(handle, 'touchend', 104, 120)
    expect(closed).toBe(1)
    const body = document.querySelector<HTMLElement>('[data-panel-body]')!
    body.scrollTop = 200
    touch(body, 'touchstart', 100, 300); touch(body, 'touchend', 100, 450)
    expect(closed).toBe(1)
    body.scrollTop = 0
    touch(body, 'touchstart', 100, 300); touch(body, 'touchend', 100, 450)
    expect(closed).toBe(2)
    await r.unmount()
  })

  it('a swipe down on the header closes it; a sideways or short swipe does not', async () => {
    width = 390
    const id = await createTask({ title: 'Swipe me' })
    let closed = 0
    const r = await render(<TaskDetail taskId={id} projects={[]} labelMap={new Map<string, Label>()} onClose={() => { closed++ }} />)
    await waitFor(() => !!document.querySelector(`[data-detail-for="${id}"]`))
    const header = document.querySelector(`[data-detail-for="${id}"] [data-panel-header]`)!
    touch(header, 'touchstart', 100, 40); touch(header, 'touchend', 110, 70)
    expect(closed).toBe(0)
    touch(header, 'touchstart', 100, 40); touch(header, 'touchend', 200, 160)
    expect(closed).toBe(0)
    touch(header, 'touchstart', 100, 40); touch(header, 'touchend', 110, 160)
    expect(closed).toBe(1)
    await r.unmount()
  })
})

describe('from 768 px', () => {
  it('keeps Close and no Back, capped at 28 rem', async () => {
    width = 1024
    const id = await createTask({ title: 'Desk task' })
    const r = await render(<TaskDetail taskId={id} projects={[]} labelMap={new Map<string, Label>()} onClose={() => {}} />)
    await waitFor(() => !!document.querySelector(`[data-detail-for="${id}"]`))
    const panel = document.querySelector(`[data-detail-for="${id}"]`)!
    expect(panel.querySelector('[data-task-back]')).toBeNull()
    expect(panel.className).toContain('md:max-w-md')
    expect(panel.querySelector('[aria-label="Close"]')).toBeTruthy()
    await r.unmount()
    width = 390
  })
})
