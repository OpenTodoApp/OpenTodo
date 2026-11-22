// @vitest-environment happy-dom
// One failing part of the shell, and failed actions (OpenSpec change client-sync-robustness).
import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { bulkToast, hideBulkToast } from './bulk/toastStore'
import { act as runAction } from './actionError'
import { PanelBoundary } from './PanelBoundary'
import { lazy } from '../lib/lazy'
import { Suspense } from 'react'
import { useDatabase } from '../lib/db'
import { createTask, resetDeviceId, setTaskParent } from '../lib/ops'
import { flush, render, waitFor } from '../ui/test-utils'

function Broken(): never {
  throw new Error('chunk gone')
}

describe('PanelBoundary', () => {
  it('shows the message with Reload in place of the failed part; the rest still renders; a new key retries', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await render(<div><nav>sidebar</nav><PanelBoundary resetKey="a"><Broken /></PanelBoundary></div>)
    expect(r.container.querySelector('nav')?.textContent).toBe('sidebar')
    const alert = r.container.querySelector('[data-panel-error]')
    expect(alert?.getAttribute('role')).toBe('alert')
    expect(alert?.querySelector('button')?.textContent).toBe('Reload')
    await r.rerender(<div><nav>sidebar</nav><PanelBoundary resetKey="b"><p>fine</p></PanelBoundary></div>)
    expect(r.container.querySelector('[data-panel-error]')).toBeNull()
    expect(r.container.textContent).toContain('fine')
    await r.unmount()
    err.mockRestore()
  })
})

describe('a part that failed to load offline (lazy-retry-online)', () => {
  const setOnline = (on: boolean) => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => on })

  it('renders again once the device is back online, without a reload', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    let online = false
    setOnline(false)
    const Part = lazy(async () => {
      if (!online) throw new TypeError('Failed to fetch dynamically imported module: /assets/Part.js')
      return { default: () => <p>part</p> }
    })
    const r = await render(<PanelBoundary><Suspense fallback={null}><Part /></Suspense></PanelBoundary>)
    await waitFor(() => !!r.container.querySelector('[data-panel-error]'), 'the message')
    online = true
    setOnline(true)
    window.dispatchEvent(new Event('online'))
    await waitFor(() => r.container.textContent === 'part', 'the part')
    await r.unmount()
    err.mockRestore()
  })

  it('tries again a moment later when the first try after the connection returns still fails', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    setOnline(false)
    let failures = 2 // the offline load, then the first try once back online
    const Part = lazy(async () => {
      if (failures-- > 0) throw new TypeError('Failed to fetch dynamically imported module: /assets/Part.js')
      return { default: () => <p>part</p> }
    })
    const r = await render(<PanelBoundary><Suspense fallback={null}><Part /></Suspense></PanelBoundary>)
    await waitFor(() => !!r.container.querySelector('[data-panel-error]'), 'the message')
    setOnline(true)
    window.dispatchEvent(new Event('online'))
    await waitFor(() => r.container.textContent === 'part', 'the part, a second later', 3000)
    await r.unmount()
    err.mockRestore()
  })

  it('a chunk that fails while online, or another error, keeps the message', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    setOnline(true)
    const Part = lazy(async (): Promise<{ default: () => null }> => { throw new TypeError('Failed to fetch dynamically imported module: /assets/Gone.js') })
    const r = await render(<div><PanelBoundary><Suspense fallback={null}><Part /></Suspense></PanelBoundary><PanelBoundary><Broken /></PanelBoundary></div>)
    await waitFor(() => r.container.querySelectorAll('[data-panel-error]').length === 2, 'both messages')
    window.dispatchEvent(new Event('online'))
    await flush(0)
    expect(r.container.querySelectorAll('[data-panel-error]').length).toBe(2)
    await r.unmount()
    err.mockRestore()
  })
})

describe('failed actions', () => {
  it('a refused change shows its translated message as a toast', async () => {
    useDatabase(`actions-${Date.now()}`)
    resetDeviceId()
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    hideBulkToast()
    const id = await createTask({ title: 'Plan' })
    // Before: `void setTaskParent(...).catch(() => undefined)` showed nothing.
    runAction(setTaskParent(id, id))
    await waitFor(() => !!bulkToast(), 'the toast')
    expect(bulkToast()?.label).toBe('a task cannot be its own parent')
    expect(bulkToast()?.undoId).toBeNull()
    err.mockRestore()
  })

  it('a failure without a message still says the change was not saved', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    runAction(Promise.reject('nope'))
    await flush(0)
    expect(bulkToast()?.label).toBe('The change could not be saved.')
    err.mockRestore()
  })
})
