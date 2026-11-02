// @vitest-environment happy-dom
// A navigation while an overlay is open takes the overlay's marker entry (router navigate()),
// so Back returns to the page the overlay was opened from.
import { act, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Dialog } from '../ui/overlay/Dialog'
import { click, render, waitFor } from '../ui/test-utils'
import { navigate, setLeaveGuard } from './router'

const marker = () => (history.state as { overlay?: number } | null)?.overlay
const dialogs = () => document.querySelectorAll('[data-overlay="dialog"]').length
const buttonNamed = (t: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === t)!

describe('navigating with an overlay open', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(pointer: coarse)', addEventListener() {}, removeEventListener() {} }))
    navigate({ view: 'inbox' })
    navigate({ view: 'today' })
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('keeps the history sane when a navigation closes the overlay', async () => {
    function Nav() {
      const [open, setOpen] = useState(true)
      return open ? <Dialog title="Go" onClose={() => setOpen(false)}><button onClick={() => { navigate({ view: 'upcoming' }); setOpen(false) }}>Go</button></Dialog> : <p>closed</p>
    }
    const r = await render(<Nav />)
    await waitFor(() => dialogs() === 1, 'the dialog')
    await click(buttonNamed('Go'))
    await waitFor(() => dialogs() === 0, 'closed')
    await waitFor(() => marker() === undefined, 'no marker')
    expect(location.pathname).toBe('/upcoming')
    await act(async () => history.back())
    await waitFor(() => location.pathname === '/today', 'Back lands before the overlay, not on a stale entry')
    await r.unmount()
  })

  it('steps over a marker left under a route that replaced the one above it', async () => {
    function Nav() {
      const [outer, setOuter] = useState(true)
      const [inner, setInner] = useState(true)
      if (!outer) return <p>closed</p>
      return (
        <Dialog title="Outer" onClose={() => setOuter(false)}>
          <button onClick={() => { navigate({ view: 'upcoming' }); setOuter(false); setInner(false) }}>Go</button>
          {inner && <Dialog title="Inner" onClose={() => setInner(false)}><button>Inside</button></Dialog>}
        </Dialog>
      )
    }
    const r = await render(<Nav />)
    await waitFor(() => dialogs() === 2, 'both dialogs')
    await click(buttonNamed('Go'))
    await waitFor(() => dialogs() === 0, 'closed')
    await act(async () => history.back())
    await waitFor(() => location.pathname === '/today' && marker() === undefined, 'Back skips the stale marker')
    await r.unmount()
  })

  it('a navigation after the overlay closed, but before its Back landed, is not undone by it', async () => {
    function Nav() {
      const [open, setOpen] = useState(true)
      return open ? <Dialog title="Go" onClose={() => setOpen(false)}><button onClick={() => setOpen(false)}>Close</button></Dialog> : <p>closed</p>
    }
    // A browser traverses in a later task; happy-dom lands at once, so the traversal is delayed here.
    const realGo = history.go.bind(history)
    vi.spyOn(history, 'go').mockImplementation((delta) => { setTimeout(() => realGo(delta), 20) })
    const r = await render(<Nav />)
    await waitFor(() => dialogs() === 1, 'the dialog')
    // Closing releases the marker in a microtask (history.go(-1), which lands in a later task);
    // a command that awaits something and then navigates arrives in between.
    await click(buttonNamed('Close'))
    await waitFor(() => dialogs() === 0, 'closed')
    navigate({ view: 'upcoming' })
    await act(async () => { await new Promise((res) => setTimeout(res, 80)) }) // the delayed traversal lands
    expect(location.pathname).toBe('/upcoming')
    expect(marker()).toBeUndefined()
    await act(async () => history.back())
    await waitFor(() => location.pathname === '/today', 'Back returns to the page the overlay was opened from')
    await r.unmount()
  })

  it('Back on a dialog over a guarded page closes the dialog and does not ask to leave', async () => {
    let asked = 0
    setLeaveGuard(() => { asked++; return true })
    function Nav() {
      const [open, setOpen] = useState(true)
      return open ? <Dialog title="Pick" onClose={() => setOpen(false)}><p>inside</p></Dialog> : <p>closed</p>
    }
    const r = await render(<Nav />)
    await waitFor(() => dialogs() === 1, 'the dialog')
    await act(async () => history.back())
    await waitFor(() => dialogs() === 0, 'closed by Back')
    expect(asked).toBe(0)
    expect(location.pathname).toBe('/today')
    setLeaveGuard(null)
    await r.unmount()
  })
})
