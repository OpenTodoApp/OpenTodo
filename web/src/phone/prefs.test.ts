// @vitest-environment happy-dom
// The phone UI's switch (OpenSpec change phone-ui-trial, "The phone screens are opt-in
// on each device"): off until turned on, kept on the device, never an operation.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import { setPhoneUiEnabled } from './prefs'

const PHONE_UI_KEY = 'opentodo.phoneUi'

beforeEach(async () => {
  await db.delete()
  await db.open()
  setPhoneUiEnabled(false)
})

describe('the phone UI switch', () => {
  it('is off until turned on, and is kept in the device\'s storage', () => {
    expect(localStorage.getItem(PHONE_UI_KEY)).toBeNull()
    setPhoneUiEnabled(true)
    expect(localStorage.getItem(PHONE_UI_KEY)).toBe('1')
    setPhoneUiEnabled(false)
    expect(localStorage.getItem(PHONE_UI_KEY)).toBeNull()
  })

  it('writes no operation: nothing to sync, nothing for another device', async () => {
    setPhoneUiEnabled(true)
    expect(await db.outbox.count()).toBe(0)
  })
})
