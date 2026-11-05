// @vitest-environment happy-dom
// The enrolment wizard's QR (OpenSpec `mfa-totp`, design D9; mfa-enrolment-qr): the
// encoder loads lazily, so the image appears once its chunk arrives — and it is drawn
// here, from the provisioning URI, never fetched as an image (the secret must not
// leave the device that way).
import { act, createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { render, waitFor } from '../ui/test-utils'
import { EnrolmentStepView } from './TwoFactorPanel'

const noop = () => {}
const enrollment = {
  secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
  uri: 'otpauth://totp/OpenTodo:a%40example.com?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=OpenTodo',
  expiresAt: Date.UTC(2026, 9, 10, 12) + 600_000,
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('the enrolment QR', () => {
  it('is drawn in the page once the encoder loads, with no image request', async () => {
    // Load the chunk first so it resolves inside the render's act, not after it.
    await act(async () => { await import('./QrCode') })
    const r = await render(createElement(EnrolmentStepView, {
      enrollment, code: '', busy: false, disabled: false, error: null, onCode: noop, onConfirm: noop, onCancel: noop,
    }))
    await waitFor(() => !!document.querySelector('svg[role="img"] path'), 'the QR encoder to load')
    const svg = document.querySelector<SVGSVGElement>('svg[role="img"]')!
    expect(svg.getAttribute('aria-label')).toContain('QR code')
    // A path per dark module, so a scannable matrix rather than an empty square:
    expect(svg.querySelector('path')!.getAttribute('d')).toMatch(/^M\d+ \d+h1v1h-1z/)
    expect(document.querySelector('img')).toBeNull()
    await r.unmount()
  })
})
