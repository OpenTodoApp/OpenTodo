// The switch of the phone UI (OpenSpec change phone-ui-trial, design D3): one flag
// kept on this device, never synced, never sent to the server and never an
// operation. Off until the person turns it on. This module is in the main bundle
// (Shell and Settings read it); the phone screens load only while it is on and the
// window is narrower than 768 px.
import { createStoredValue } from '../lib/deviceStorage'

/** The key in the device's storage (the tests read it). */
const PHONE_UI_KEY = 'opentodo.phoneUi'

// Another tab of the app toggling it applies here too (the storage event).
const phoneUi = createStoredValue<boolean>(PHONE_UI_KEY, {
  parse: (raw) => raw === '1',
  serialize: (on) => (on ? '1' : null),
}, { crossTab: true, server: false })

/** Turn them on or off; takes effect at once, without a reload. */
export const setPhoneUiEnabled = phoneUi.set

/** Whether the new phone screens are on for this device (off by default). */
export const usePhoneUiEnabled = phoneUi.use
