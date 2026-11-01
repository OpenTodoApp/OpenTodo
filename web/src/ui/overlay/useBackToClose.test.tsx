// @vitest-environment happy-dom
// Back closes overlays (the Android back gesture): each open overlay owns one marker history
// entry, Back closes it, and any other close releases the entry so a later Back navigates.
import { act, StrictMode, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { click, render, waitFor } from '../test-utils'
import { Dialog } from './Dialog'

const marker = () => (history.state as { overlay?: number } | null)?.overlay
const dialogs = () => document.querySelectorAll('[data-overlay="dialog"]').length

function Single() {
  const [open, setOpen] = useState(true)
  return open ? <Dialog title="Add a task" onClose={() => setOpen(false)}><button>Inside</button></Dialog> : <p>closed</p>
}

// A sheet with a second one over it; "Both" closes the two in one commit.
function Stacked() {
  const [outer, setOuter] = useState(true)
  const [inner, setInner] = useState(false)
  if (!outer) return <p>closed</p>
  return (
    <Dialog title="Outer" onClose={() => setOuter(false)}>
      <button onClick={() => setInner(true)}>More</button>
      <button onClick={() => { setOuter(false); setInner(false) }}>Both</button>
      {inner && <Dialog title="Inner" onClose={() => setInner(false)}><button>Inside</button></Dialog>}
    </Dialog>
  )
}

const buttonNamed = (t: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === t)!
const settled = (n: number) => waitFor(() => marker() === (n || undefined), `marker ${n}`)

describe('overlays and Back', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(pointer: coarse)', addEventListener() {}, removeEventListener() {} }))
    history.pushState(null, '', '/a')
    history.pushState(null, '', '/b')
  })
  afterEach(() => vi.unstubAllGlobals())

  it('closes on Back and stays on the page', async () => {
    const r = await render(<Single />)
    await waitFor(() => dialogs() === 1, 'the dialog')
    expect(marker()).toBe(1)
    await act(async () => history.back())
    await waitFor(() => dialogs() === 0, 'closed by Back')
    expect(location.pathname).toBe('/b')
    await r.unmount()
  })

  it('leaves the history clean when closed with the close button', async () => {
    const r = await render(<Single />)
    await waitFor(() => dialogs() === 1, 'the dialog')
    await click(document.querySelector('[data-overlay-close]')!)
    await settled(0)
    await act(async () => history.back())
    await waitFor(() => location.pathname === '/a', 'a later Back navigates')
    await r.unmount()
  })

  it('closes nested overlays one Back at a time', async () => {
    const r = await render(<Stacked />)
    await waitFor(() => dialogs() === 1, 'the outer dialog')
    await click(buttonNamed('More'))
    await waitFor(() => dialogs() === 2, 'both dialogs')
    expect(marker()).toBe(2)
    await act(async () => history.back())
    await waitFor(() => dialogs() === 1, 'the inner one closed')
    expect(marker()).toBe(1)
    await act(async () => history.back())
    await waitFor(() => dialogs() === 0, 'the outer one closed')
    expect(location.pathname).toBe('/b')
    await r.unmount()
  })

  it('releases both entries when nested overlays close together', async () => {
    const r = await render(<Stacked />)
    await waitFor(() => dialogs() === 1, 'the outer dialog')
    await click(buttonNamed('More'))
    await waitFor(() => dialogs() === 2, 'both dialogs')
    await click(buttonNamed('Both'))
    await waitFor(() => dialogs() === 0, 'both closed')
    await settled(0)
    await act(async () => history.back())
    await waitFor(() => location.pathname === '/a', 'a later Back navigates')
    await r.unmount()
  })

  it('pushes a single entry under StrictMode', async () => {
    const r = await render(<StrictMode><Single /></StrictMode>)
    await waitFor(() => dialogs() === 1, 'the dialog')
    await act(async () => history.back())
    await waitFor(() => dialogs() === 0, 'closed by one Back')
    expect(location.pathname).toBe('/b')
    await r.unmount()
  })

  it('does nothing with a mouse', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
    const r = await render(<Single />)
    await waitFor(() => dialogs() === 1, 'the dialog')
    expect(marker()).toBeUndefined()
    await r.unmount()
  })
})
