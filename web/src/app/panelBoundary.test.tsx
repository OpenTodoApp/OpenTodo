// @vitest-environment happy-dom
// One failing part of the shell, and failed actions (OpenSpec change client-sync-robustness).
import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { bulkToast, hideBulkToast } from './bulk/toastStore'
import { act as runAction } from './actionError'
import { PanelBoundary } from './PanelBoundary'
import { useDatabase } from '../lib/db'
import { createTask, resetDeviceId, setTaskParent } from '../lib/ops'
import { flush, render } from '../ui/test-utils'

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

describe('failed actions', () => {
  it('a refused change shows its translated message as a toast', async () => {
    useDatabase(`actions-${Date.now()}`)
    resetDeviceId()
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    hideBulkToast()
    const id = await createTask({ title: 'Plan' })
    // Before: `void setTaskParent(...).catch(() => undefined)` showed nothing.
    runAction(setTaskParent(id, id))
    await flush(20)
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
