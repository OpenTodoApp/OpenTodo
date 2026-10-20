// @vitest-environment happy-dom
// Quick add ends at its field and preview (OpenSpec change lean-chrome D1,
// documentation "Contextual help" "No help under the field"): no help link on the
// first add or any later one, and nothing about its uses is stored on the device.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { flush, render, type } from '../ui/test-utils'
import { QuickAdd } from './QuickAdd'

beforeEach(() => localStorage.clear())
afterEach(() => { document.body.innerHTML = '' })

describe('no help under the field', () => {
  it('renders no help link before, during or after adds, and writes nothing to the device', async () => {
    const added: unknown[] = []
    const r = await render(<QuickAdd placeholder="Add a task" onAdd={async (input) => { added.push(input) }} />)
    const link = () => r.container.querySelector('[data-help-screen]')
    const input = r.container.querySelector('input')!
    const form = r.container.querySelector('form')!
    const submit = () => act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    expect(link()).toBeNull()
    for (let i = 1; i <= 4; i++) {
      await type(input, `Task ${i}`)
      await submit()
      await flush(20)
      expect(link()).toBeNull()
    }
    expect(added).toHaveLength(4)
    expect(localStorage.length).toBe(0)
    await r.unmount()
  })
})
