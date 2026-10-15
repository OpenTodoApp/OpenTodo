// @vitest-environment happy-dom
// The task panel on a phone (OpenSpec change ux-overhaul, app-shell "Panel width
// and expansion"): below 768 px a full-screen sheet with a sticky header, closed by
// Back or by a swipe down on the header; from 768 px the panel keeps its Close.
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
  it('is a full-screen sheet with a sticky header and a Back action that closes it', async () => {
    width = 390
    const id = await createTask({ title: 'Phone task' })
    let closed = 0
    const r = await render(<TaskDetail taskId={id} projects={[]} labelMap={new Map<string, Label>()} onClose={() => { closed++ }} />)
    await waitFor(() => !!document.querySelector(`[data-detail-for="${id}"]`))
    const panel = document.querySelector(`[data-detail-for="${id}"]`)!
    expect(panel.className).toContain('fixed inset-y-0 right-0')
    expect(panel.className).toContain('w-full')
    expect(panel.className).not.toMatch(/(^|\s)max-w-md(\s|$)/)
    expect(panel.querySelector('[data-panel-header]')).toBeTruthy()
    const back = panel.querySelector<HTMLButtonElement>('[data-task-back]')!
    expect(back.getAttribute('aria-label')).toBe('Back to the list')
    await click(back)
    expect(closed).toBe(1)
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
