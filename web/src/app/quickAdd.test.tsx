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

describe('spent and estimate (OpenSpec time-tracking 8.2)', () => {
  it('Spent and estimate: `30m/2h` shows a Spent chip beside the estimate and hands both to the task', async () => {
    const added: Record<string, unknown>[] = []
    const r = await render(<QuickAdd placeholder="Add a task" onAdd={async (input) => { added.push(input as never) }} />)
    const input = r.container.querySelector('input')!
    await type(input, 'Draft the offer 30m/2h')
    await flush(20)
    const chips = [...r.container.querySelectorAll('[data-chip]')].map((c) => [c.getAttribute('data-chip'), c.textContent])
    expect(chips.map((c) => c[0])).toEqual(['estimate', 'spent'])
    expect(chips[1][1]).toContain('Spent 30 min')
    await act(async () => { r.container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    await flush(20)
    expect(added[0]).toMatchObject({ title: 'Draft the offer', estimate_minutes: 120, spent_minutes: 30 })
    await r.unmount()
  })

  it('Plus stays an estimate only', async () => {
    const added: Record<string, unknown>[] = []
    const r = await render(<QuickAdd placeholder="Add a task" onAdd={async (input) => { added.push(input as never) }} />)
    await type(r.container.querySelector('input')!, 'Draft the offer +30m')
    await act(async () => { r.container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    await flush(20)
    expect(added[0]).toMatchObject({ title: 'Draft the offer', estimate_minutes: 30 })
    expect(added[0].spent_minutes).toBeUndefined()
    await r.unmount()
  })
})
