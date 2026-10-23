// @vitest-environment happy-dom
// The task panel's motion (OpenSpec change motion-v2, web-app "Overlay motion"): it
// slides in when it opens from closed, never when it switches to another task. Tasks dock
// only on a page that keeps a split (task-full-page D3), so the test asks for one.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createTask, resetDeviceId } from '../lib/ops'
import { setCurrentUserId } from '../lib/sharing'
import { flush, render } from '../ui/test-utils'
import { closePanel, openTaskPanel, resetPanel, setTaskSplit } from './panel'
import { PanelHost } from './PanelHost'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  setCurrentUserId('me')
  resetPanel()
  setTaskSplit(true)
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
})
afterEach(() => { vi.unstubAllGlobals(); resetPanel(); document.body.innerHTML = '' })

const aside = (id: string) => document.querySelector<HTMLElement>(`[data-detail-for="${id}"]`)
async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

describe('panel motion', () => {
  it('slides in from closed, not when the shown task changes, and again after closing', async () => {
    const a = await createTask({ title: 'Pay rent' })
    const b = await createTask({ title: 'Call mum' })
    const r = await render(<PanelHost user={{ id: 'me' }} />)
    await act(async () => { openTaskPanel(a) })
    await waitFor(() => !!aside(a))
    expect(aside(a)!.className).toContain('panel-enter')
    await act(async () => { openTaskPanel(b) })
    await waitFor(() => !!aside(b))
    expect(aside(b)!.className).not.toContain('panel-enter')
    await act(async () => { closePanel() })
    await waitFor(() => !aside(b))
    await act(async () => { openTaskPanel(b) })
    await waitFor(() => !!aside(b))
    expect(aside(b)!.className).toContain('panel-enter')
    await r.unmount()
  })
})
