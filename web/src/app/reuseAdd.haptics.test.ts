// @vitest-environment happy-dom
// The create tap (#1445, appearance-preferences "Haptic feedback preference"): adding a
// single task through the quick-add chokepoint (addToList — the command bar, the phone
// sheet, the list and section add lines) gives one light tick; a pasted list
// (addManyToList) does not, and nothing ticks with the preference off.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { mutate, resetDeviceId } from '../lib/ops'
import { USER_PREFS_ID } from '../lib/userPrefs'
import { resetHaptics } from './motion'
import { addManyToList, addToList } from './reuseAdd'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  resetHaptics()
})
afterEach(() => { delete window.opentodoShell })

/** A shell that plays haptics, recording the kinds it is asked for. */
function shellKinds(): string[] {
  const kinds: string[] = []
  window.opentodoShell = { bridge: 1, platform: 'ios', app: '1.5.0', capabilities: ['haptics'], haptic: (k) => void kinds.push(k) }
  return kinds
}

describe('create tap', () => {
  it('a single add through addToList ticks once', async () => {
    await mutate('user_prefs', USER_PREFS_ID, { haptics: 'on' })
    resetHaptics()
    const kinds = shellKinds()
    await addToList({ title: 'Buy milk' }, async () => 'id1')
    await vi.waitFor(() => expect(kinds).toEqual(['tick']))
  })

  it('a pasted list through addManyToList does not tick', async () => {
    await mutate('user_prefs', USER_PREFS_ID, { haptics: 'on' })
    resetHaptics()
    const kinds = shellKinds()
    await addManyToList([{ title: 'A' }, { title: 'B' }], async () => {})
    await new Promise((r) => setTimeout(r, 0))
    expect(kinds).toEqual([])
  })

  it('is silent with the preference off', async () => {
    await mutate('user_prefs', USER_PREFS_ID, { haptics: 'off' })
    resetHaptics()
    const kinds = shellKinds()
    await addToList({ title: 'Quiet' }, async () => 'id2')
    expect(await db.userPrefs.get(USER_PREFS_ID).then((r) => r?.haptics)).toBe('off')
    await new Promise((r) => setTimeout(r, 0))
    expect(kinds).toEqual([])
  })
})
