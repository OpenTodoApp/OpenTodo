// @vitest-environment happy-dom
// The long press that ticks a row on touch (OpenSpec change focus-everywhere,
// task 2.5; bulk-actions "One ticked task on touch"): it ticks and shows the
// selection bar, and its haptic pulse follows the haptics preference.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDatabase } from '../../lib/db'
import { readHapticsPref } from '../../lib/haptics'
import { mutate, resetDeviceId } from '../../lib/ops'
import { USER_PREFS_ID } from '../../lib/userPrefs'
import { resetHaptics } from '../motion'
import { holdSelect } from './RowSwipe'

let n = 0
beforeEach(() => {
  useDatabase(`hold-select-${Date.now()}-${n++}`)
  resetDeviceId()
  resetHaptics()
})
afterEach(() => { vi.unstubAllGlobals(); resetHaptics() })

function selection() {
  const ticked = new Set<string>()
  return { ticked, toggle: (id: string) => { if (ticked.has(id)) ticked.delete(id); else ticked.add(id) } }
}

describe('holdSelect', () => {
  it('Haptics off: the row is ticked and the selection bar shows, and the device does not vibrate', async () => {
    const vibrate = vi.fn(() => true)
    vi.stubGlobal('navigator', { ...navigator, vibrate })
    await mutate('user_prefs', USER_PREFS_ID, { haptics: 'off' })
    const sel = selection()
    const setSelectMode = vi.fn()
    holdSelect('a', sel, setSelectMode)
    expect([...sel.ticked]).toEqual(['a'])
    expect(setSelectMode).toHaveBeenCalledWith(true)
    expect(await readHapticsPref()).toBe(false)
    await new Promise((r) => setTimeout(r, 0))
    expect(vibrate).not.toHaveBeenCalled()
  })

  it('Haptics on (the default): one 10 ms pulse; a ticked row stays ticked', async () => {
    const vibrate = vi.fn(() => true)
    vi.stubGlobal('navigator', { ...navigator, vibrate })
    const sel = selection()
    sel.ticked.add('a')
    holdSelect('a', sel, () => {})
    expect([...sel.ticked]).toEqual(['a'])
    await vi.waitFor(() => expect(vibrate).toHaveBeenCalledWith(10))
    expect(vibrate).toHaveBeenCalledTimes(1)
  })
})
