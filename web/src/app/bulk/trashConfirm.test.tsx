// The keyboard's Delete on a big ticked set asks first: past the threshold the
// spec lands in the host, confirming runs the same bulk trash the menu does; a
// small set runs at once with its Undo offer.
// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from '../../lib/db'
import { createTask, resetDeviceId } from '../../lib/ops'
import { render, waitFor } from '../../ui/test-utils'
import { BulkConfirmHost } from './BulkConfirmHost'
import { BULK_TRASH_CONFIRM_FROM, clearBulkConfirm, trashTicked } from './BulkActions'
import { bulkToast, hideBulkToast } from './toastStore'

let n = 0
beforeEach(() => {
  useDatabase(`trash-confirm-${Date.now()}-${n++}`)
  resetDeviceId()
})
afterEach(() => { act(() => { clearBulkConfirm(); hideBulkToast() }) })

describe('trashTicked', () => {
  it('a small set runs at once, with the Undo offer', async () => {
    const ids = [await createTask({ title: 'a' }), await createTask({ title: 'b' })]
    await trashTicked(ids)
    expect((await db.tasks.get(ids[0]))!.deleted_at).not.toBeNull()
    expect(bulkToast()?.undoId).toBeTruthy()
  })

  it(`a set past ${BULK_TRASH_CONFIRM_FROM} asks first: the dialog names the count, confirming trashes`, async () => {
    const ids: string[] = []
    for (let i = 0; i < BULK_TRASH_CONFIRM_FROM + 1; i++) ids.push(await createTask({ title: `task ${i}` }))
    const r = await render(<BulkConfirmHost />)
    await act(async () => { await trashTicked(ids) })
    await waitFor(() => document.querySelector('[data-testid="confirm-dialog"]') !== null, 'the confirm dialog')
    expect(document.querySelector('[data-testid="confirm-dialog"]')!.textContent).toContain('21')
    expect((await db.tasks.get(ids[0]))!.deleted_at).toBeNull()
    const confirm = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Move to Trash')!
    await act(async () => { confirm.click() })
    await waitFor(async () => (await db.tasks.get(ids[0]))!.deleted_at !== null, 'the trash applied')
    expect((await db.tasks.get(ids[0]))!.deleted_at).not.toBeNull()
    await r.unmount()
  })
})
