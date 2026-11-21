// @vitest-environment happy-dom
// haptic-kinds D2: a failure toast plays `error`; a row lifted by touch plays `tick`
// once (not with a mouse, and not again after a hold that selected and ticked).
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useDatabase } from '../lib/db'
import { beginDrag, TOUCH_HOLD_MS } from '../lib/dnd'
import { reportEntryFailure } from '../lib/focus/failures'
import { resetHaptics } from '../lib/haptics'
import { resetDeviceId } from '../lib/ops'
import { flush, render, waitFor } from '../ui/test-utils'
import { hideActionToast } from './bulk/toastStore'
import { ToastActionHost } from './ToastActionHost'

let played: string[] = []
let n = 0
beforeEach(() => {
  useDatabase(`haptic-kinds-app-${Date.now()}-${n++}`)
  resetDeviceId()
  resetHaptics()
  played = []
  window.opentodoShell = { bridge: 1, platform: 'android', app: '1.6.0', capabilities: ['haptics'], haptic: (kind: string) => void played.push(kind) }
})
afterEach(() => { act(() => hideActionToast()); delete window.opentodoShell; resetHaptics() })

const pointer = (type: string, pointerType: string, x: number) => window.dispatchEvent(new PointerEvent(type, { pointerId: 9, pointerType, clientX: x, clientY: 50 }))

/** A plain touch drag: hold, move, release. */
async function touchDrag() {
  beginDrag({ pointerId: 9, pointerType: 'touch', button: 0, clientX: 50, clientY: 50 }, { label: 'Task', onDrop: () => {} })
  await flush(TOUCH_HOLD_MS + 20)
  pointer('pointermove', 'touch', 120)
  pointer('pointerup', 'touch', 120)
}

describe('outcome and lift haptics', () => {
  it('a failure toast plays error', async () => {
    const r = await render(<ToastActionHost />)
    act(() => reportEntryFailure('start', new Error('offline')))
    expect(document.querySelector('[data-action-toast]')).not.toBeNull()
    await waitFor(() => played.length === 1, 'the haptic')
    expect(played).toEqual(['error'])
    await r.unmount()
  })

  it('a row lifted by touch plays tick once; a mouse drag plays nothing', async () => {
    beginDrag({ pointerId: 9, pointerType: 'touch', button: 0, clientX: 50, clientY: 50 }, { label: 'Task', onDrop: () => {} })
    await flush(TOUCH_HOLD_MS + 20)
    pointer('pointermove', 'touch', 120)
    pointer('pointermove', 'touch', 140)
    pointer('pointerup', 'touch', 140)
    await waitFor(() => played.length === 1, 'the haptic')
    beginDrag({ pointerId: 9, pointerType: 'mouse', button: 0, clientX: 50, clientY: 50 }, { label: 'Task', onDrop: () => {} })
    pointer('pointermove', 'mouse', 120)
    pointer('pointerup', 'mouse', 120)
    await touchDrag()
    // The mouse drag between the two touch drags played nothing.
    await waitFor(() => played.length === 2, 'the second tick')
    expect(played).toEqual(['tick', 'tick'])
  })

  it('a hold that selected does not tick again when the row lifts', async () => {
    beginDrag({ pointerId: 9, pointerType: 'touch', button: 0, clientX: 50, clientY: 50 }, { label: 'Task', onDrop: () => {}, onHold: () => {} })
    await flush(TOUCH_HOLD_MS + 20)
    pointer('pointermove', 'touch', 120)
    pointer('pointerup', 'touch', 120)
    await touchDrag()
    // Only the plain drag after it ticked.
    await waitFor(() => played.length === 1, 'the plain drag tick')
    expect(played).toEqual(['tick'])
  })
})
