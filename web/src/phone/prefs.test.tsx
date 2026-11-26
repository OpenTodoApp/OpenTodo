// @vitest-environment happy-dom
// The phone UI's switch (OpenSpec changes phone-ui-trial and phone-ui-default, "The phone
// screens are the default on a phone"): on unless turned off, kept on the device, never an
// operation. Only "off" is stored.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import { render } from '../ui/test-utils'
import { setPhoneUiEnabled, usePhoneUiEnabled } from './prefs'

const PHONE_UI_KEY = 'opentodo.phoneUi'

/** What the app reads for this device right now. */
async function shown(): Promise<boolean> {
  let on = false
  function Probe() { on = usePhoneUiEnabled(); return null }
  const r = await render(<Probe />)
  await r.unmount()
  return on
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  localStorage.removeItem(PHONE_UI_KEY)
  setPhoneUiEnabled(true)
})

describe('the phone UI switch', () => {
  it('is on for a device that never touched it, and stores nothing for on', async () => {
    expect(localStorage.getItem(PHONE_UI_KEY)).toBeNull()
    expect(await shown()).toBe(true)
  })

  it('turned off stores "0" and stays off; turned on again removes it', async () => {
    setPhoneUiEnabled(false)
    expect(localStorage.getItem(PHONE_UI_KEY)).toBe('0')
    expect(await shown()).toBe(false)
    setPhoneUiEnabled(true)
    expect(localStorage.getItem(PHONE_UI_KEY)).toBeNull()
    expect(await shown()).toBe(true)
  })

  it('a device that had turned the trial on keeps the phone screens', async () => {
    localStorage.setItem(PHONE_UI_KEY, '1')
    window.dispatchEvent(new StorageEvent('storage', { key: PHONE_UI_KEY }))
    expect(await shown()).toBe(true)
  })

  it('writes no operation: nothing to sync, nothing for another device', async () => {
    setPhoneUiEnabled(false)
    expect(await db.outbox.count()).toBe(0)
  })
})
