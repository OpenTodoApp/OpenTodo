// @vitest-environment happy-dom
// Dialog placement="sheet" (OpenSpec change lean-chrome D3): the bottom sheet is an
// ordinary dialog of the overlay stack, so Escape and a tap on the scrim close it.
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { click, flush, key, render } from '../test-utils'
import { Dialog } from './Dialog'

afterEach(() => { document.body.innerHTML = '' })

function Harness() {
  const [open, setOpen] = useState(true)
  return open ? <Dialog title="Start guide" placement="sheet" onClose={() => setOpen(false)}><button>Continue</button></Dialog> : <p data-closed>closed</p>
}

describe('Dialog sheet', () => {
  it('closes on Escape', async () => {
    const r = await render(<Harness />)
    await flush(20)
    expect(document.querySelector('[data-placement="sheet"]')).not.toBeNull()
    await key(document.querySelector('[data-overlay="dialog"] button')!, 'Escape')
    await flush(20)
    expect(document.querySelector('[data-overlay="dialog"]')).toBeNull()
    expect(r.container.querySelector('[data-closed]')).not.toBeNull()
    await r.unmount()
  })

  it('closes on a tap on the scrim, not on a tap inside', async () => {
    const r = await render(<Harness />)
    await flush(20)
    await click([...document.querySelectorAll('[data-overlay="dialog"] button')].find((b) => b.textContent === 'Continue')!)
    expect(document.querySelector('[data-overlay="dialog"]')).not.toBeNull()
    await click(document.querySelector('[data-overlay-root]')!)
    await flush(20)
    expect(document.querySelector('[data-overlay="dialog"]')).toBeNull()
    await r.unmount()
  })
})
