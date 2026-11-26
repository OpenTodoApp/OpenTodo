// @vitest-environment happy-dom
// "New phone screens" in Settings (OpenSpec changes phone-ui-trial and phone-ui-default): shown
// only below 768 px, on until turned off, and it flips the device's switch.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { click, minWidthPx, render } from '../ui/test-utils'
import { PhoneUiSection } from '../app/PreferencesPanels'
import { setPhoneUiEnabled } from './prefs'

const isPhoneUiEnabled = () => localStorage.getItem('opentodo.phoneUi') !== '0'

let width = 390
const original = window.matchMedia
beforeEach(() => {
  setPhoneUiEnabled(true)
  window.matchMedia = ((q: string) => ({
    matches: q.includes('min-width') ? minWidthPx(q) <= width : false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
})
afterEach(() => { window.matchMedia = original; setPhoneUiEnabled(true) })

const control = () => document.querySelector<HTMLElement>('[data-phone-ui-switch] [role="switch"], [data-phone-ui-switch] input, [data-phone-ui-switch] button')

describe('the switch in Settings', () => {
  it('is offered on a phone, is on, and turns the phone screens off and on', async () => {
    width = 390
    const r = await render(<PhoneUiSection />)
    expect(document.body.textContent).toContain('New phone screens')
    expect(isPhoneUiEnabled()).toBe(true)
    await click(control()!)
    expect(isPhoneUiEnabled()).toBe(false)
    await click(control()!)
    expect(isPhoneUiEnabled()).toBe(true)
    await r.unmount()
  })

  it('is not offered from 768 px', async () => {
    width = 768
    const r = await render(<PhoneUiSection />)
    expect(document.querySelector('[data-phone-ui-switch]')).toBeNull()
    await r.unmount()
  })
})
