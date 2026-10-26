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
import { render, waitFor } from '../ui/test-utils'
import { closePanel, openTaskPanel, panelOccupant, resetPanel, setTaskSplit } from './panel'
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
afterEach(() => { vi.unstubAllGlobals(); resetPanel() })

const aside = (id: string) => document.querySelector<HTMLElement>(`[data-detail-for="${id}"]`)

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

  describe('beside a split page with an empty pane (GitHub issue 442)', () => {
    const original = window.matchMedia
    beforeEach(() => {
      window.matchMedia = ((q: string) => ({
        matches: !/pointer:\s*coarse/.test(q), media: q, onchange: null,
        addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
      })) as typeof window.matchMedia
      setTaskSplit(true, () => <p data-empty-text>No task selected</p>)
    })
    afterEach(() => { window.matchMedia = original })
    const emptyPane = () => document.querySelector('[data-split-empty]')

    it('filling the empty pane does not slide in', async () => {
      const a = await createTask({ title: 'Pay rent' })
      const r = await render(<PanelHost user={{ id: 'me' }} />)
      await waitFor(() => !!emptyPane(), 'the empty pane')
      await act(async () => { openTaskPanel(a) })
      await waitFor(() => !!aside(a))
      expect(aside(a)!.className).not.toContain('panel-enter')
      await r.unmount()
    })

    it('an id that does not exist leaves the empty pane in place', async () => {
      const r = await render(<PanelHost user={{ id: 'me' }} />)
      await waitFor(() => !!emptyPane(), 'the empty pane')
      let gone = 0
      const watch = new MutationObserver(() => { if (!emptyPane()) gone++ })
      watch.observe(document.body, { childList: true, subtree: true })
      await act(async () => { openTaskPanel('no-such-task') })
      // The unknown id leaves the slot (PanelHost's effect closes it); the pane stood throughout.
      await waitFor(() => panelOccupant() === null && !!emptyPane(), 'the unknown task left')
      watch.disconnect()
      expect(gone).toBe(0)
      expect(document.querySelector('[data-detail-for]')).toBeNull()
      await r.unmount()
    })
  })
})
