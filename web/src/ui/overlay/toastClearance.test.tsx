// @vitest-environment happy-dom
// A toast that moved out of the way of keyboard focus goes back to its own place once the
// person taps, clicks or the focus leaves (accessibility-aa; design-system "Toast primitive").
// Without it a reminder sent to the top of a phone, or to the other corner from 640 px,
// stayed there over the header or the sidebar footer.
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '../test-utils'
import { ToastRegion } from './Toasts'

const box = (top: number, bottom: number, left = 0, right = 360) => ({ top, bottom, left, right, width: right - left, height: bottom - top, x: left, y: top, toJSON: () => ({}) }) as DOMRect

afterEach(() => { vi.restoreAllMocks() })

async function setup(wide: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation((q: string) => ({ matches: wide && q.includes('40rem'), media: q, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList)
  const row = document.createElement('button')
  row.textContent = 'Call the plumber'
  document.body.append(row)
  const r = await render(<ToastRegion label="Reminders"><p>Renew passport</p></ToastRegion>)
  const region = r.container.querySelector<HTMLElement>('[data-toast-region]')!
  // The region sits over the row wherever it is: the focus is never clear of it, so it moves once.
  vi.spyOn(region, 'getBoundingClientRect').mockImplementation(() => box(560, 700))
  vi.spyOn(row, 'getBoundingClientRect').mockImplementation(() => box(600, 640))
  vi.spyOn(row, 'matches').mockImplementation((s: string) => s === ':focus-visible')
  return { row, region, r }
}

describe('a toast that moved for keyboard focus', () => {
  it('goes back to the bottom of a phone on a tap', async () => {
    const { row, region, r } = await setup(false)
    await act(async () => { row.focus() })
    await waitFor(() => region.dataset.toastSide === 'top', 'the toast moved to the top')
    await act(async () => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })) })
    await waitFor(() => region.dataset.toastSide === 'end', 'back at the bottom')
    await r.unmount(); row.remove()
  })

  it('leaves the other corner when the focus leaves for nothing', async () => {
    const { row, region, r } = await setup(true)
    await act(async () => { row.focus() })
    await waitFor(() => region.dataset.toastSide === 'start', 'the toast moved to the other corner')
    await act(async () => { row.blur() })
    await waitFor(() => region.dataset.toastSide === 'end', 'back in its corner')
    await r.unmount(); row.remove()
  })

  it('stays put for a tap on the toast itself', async () => {
    const { row, region, r } = await setup(false)
    await act(async () => { row.focus() })
    await waitFor(() => region.dataset.toastSide === 'top', 'the toast moved to the top')
    await act(async () => { region.querySelector('p')!.dispatchEvent(new Event('pointerdown', { bubbles: true })) })
    expect(region.dataset.toastSide).toBe('top')
    await r.unmount(); row.remove()
  })
})
