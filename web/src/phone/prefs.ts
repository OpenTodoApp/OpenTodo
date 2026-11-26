// The switch of the phone UI (OpenSpec changes phone-ui-trial D3 and phone-ui-default):
// one flag kept on this device, never synced, never sent to the server and never an
// operation. On unless the person turned it off: only "off" is stored, so a device
// that never touched the switch, or had turned it on during the trial, shows the
// phone screens. This module is in the main bundle (Shell and Settings read it); the
// phone screens load only while it is on and the window is narrower than 768 px.
import { createStoredValue } from '../lib/deviceStorage'

/** The key in the device's storage (the tests read it). */
const PHONE_UI_KEY = 'opentodo.phoneUi'

// Another tab of the app toggling it applies here too (the storage event).
const phoneUi = createStoredValue<boolean>(PHONE_UI_KEY, {
  parse: (raw) => raw !== '0',
  serialize: (on) => (on ? null : '0'),
}, { crossTab: true, server: false })

/** Turn them on or off; takes effect at once, without a reload. */
export const setPhoneUiEnabled = phoneUi.set

/** Whether the phone screens are on for this device (on by default). */
export const usePhoneUiEnabled = phoneUi.use
