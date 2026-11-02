// Delete on a ticked set in the Filter view and saved views (useListKeys) reports a
// failed bulk trash like the task lists' own shortcut does, instead of dropping it.
// @vitest-environment happy-dom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '../ui/test-utils'
import type { Task } from '../lib/types'
import type { BulkList } from './bulk/useBulkList'
import { bulkToast, hideBulkToast } from './bulk/toastStore'
import { installShortcutDispatcher, resetShortcutScopes } from './shortcuts/dispatch'
import { useListKeys } from './useListKeys'

const trashTicked = vi.fn<(ids: readonly string[]) => Promise<void>>()
const runBulk = vi.fn<(ids: readonly string[], action: unknown) => Promise<void>>()
const parkTask = vi.fn<(id: string) => Promise<void>>()
vi.mock('./bulk/BulkActions', () => ({ runBulk: (ids: readonly string[], action: unknown) => runBulk(ids, action), trashTicked: (ids: readonly string[]) => trashTicked(ids) }))
vi.mock('../lib/ops', async (orig) => ({ ...(await orig<typeof import('../lib/ops')>()), parkTask: (id: string) => parkTask(id) }))

const task = { id: 't1', title: 'one' } as Task
const bulk = { ticked: ['t1', 't2'], order: ['t1', 't2'], selection: { set: () => {} }, openActions: () => {} } as unknown as BulkList

function Harness() {
  useListKeys({ rows: [{ key: 't1', task }], selected: 't1', setSelected: () => {}, openId: null, setOpenId: () => {}, pickerFor: null, setPickerFor: () => {}, onIdleEscape: () => {}, bulk })
  return null
}

let release = () => {}
beforeEach(() => { trashTicked.mockReset(); runBulk.mockReset(); parkTask.mockReset(); release = installShortcutDispatcher(); vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { release(); resetShortcutScopes(); act(() => hideBulkToast()); vi.restoreAllMocks() })

const press = (key = 'Delete') => act(async () => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })) })

describe('Delete on a ticked set in useListKeys', () => {
  it('hands the ticked ids to the bulk trash', async () => {
    trashTicked.mockResolvedValue(undefined)
    const r = await render(<Harness />)
    await press()
    expect(trashTicked).toHaveBeenCalledWith(['t1', 't2'])
    expect(bulkToast()).toBeNull()
    await r.unmount()
  })

  it('reports a failed bulk trash in the toast', async () => {
    trashTicked.mockRejectedValue(new Error('the server refused'))
    const r = await render(<Harness />)
    await press()
    await waitFor(() => bulkToast() !== null, 'the failure toast')
    expect(bulkToast()).toMatchObject({ label: 'the server refused', undoId: null })
    await r.unmount()
  })
})

describe('the other list shortcuts report a failure too', () => {
  it('complete on a ticked set', async () => {
    runBulk.mockRejectedValue(new Error('complete refused'))
    const r = await render(<Harness />)
    await press('c')
    await waitFor(() => bulkToast() !== null, 'the failure toast')
    expect(runBulk).toHaveBeenCalledWith(['t1', 't2'], { kind: 'complete' })
    expect(bulkToast()).toMatchObject({ label: 'complete refused' })
    await r.unmount()
  })

  it('priority on a ticked set', async () => {
    runBulk.mockRejectedValue(new Error('priority refused'))
    const r = await render(<Harness />)
    await press('2')
    await waitFor(() => bulkToast() !== null, 'the failure toast')
    expect(bulkToast()).toMatchObject({ label: 'priority refused' })
    await r.unmount()
  })

  it('park on the selected task', async () => {
    parkTask.mockRejectedValue(new Error('park refused'))
    const r = await render(<Harness />)
    await press('n')
    await waitFor(() => bulkToast() !== null, 'the failure toast')
    expect(parkTask).toHaveBeenCalledWith('t1')
    expect(bulkToast()).toMatchObject({ label: 'park refused' })
    await r.unmount()
  })
})
