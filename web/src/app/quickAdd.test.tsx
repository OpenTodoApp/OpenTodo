// @vitest-environment happy-dom
// Quick add's guide link (OpenSpec change ux-overhaul, documentation "Contextual
// help"): offered for the first three adds on this device, then gone.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { flush, render, type } from '../ui/test-utils'
import { QUICK_ADD_HELP_USES, QuickAdd, quickAddUses } from './QuickAdd'

beforeEach(() => localStorage.clear())
afterEach(() => { document.body.innerHTML = '' })

describe('guide link', () => {
  it('shows for the first three adds on this device; an empty line is not a use', async () => {
    const added: unknown[] = []
    const r = await render(<QuickAdd placeholder="Add a task" onAdd={async (input) => { added.push(input) }} />)
    const link = () => r.container.querySelector('[data-help-screen="quick-add"]')
    const input = r.container.querySelector('input')!
    const form = r.container.querySelector('form')!
    const submit = () => act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    expect(QUICK_ADD_HELP_USES).toBe(3)
    expect(link()).toBeTruthy()

    await submit()
    await flush(10)
    expect(quickAddUses()).toBe(0)
    expect(link()).toBeTruthy()

    for (let i = 1; i <= QUICK_ADD_HELP_USES; i++) {
      await type(input, `Task ${i}`)
      await submit()
      await flush(20)
      expect(quickAddUses()).toBe(i)
      expect(link() !== null).toBe(i < QUICK_ADD_HELP_USES)
    }
    expect(added).toHaveLength(3)
    expect(localStorage.getItem('ot.quickAdd.uses')).toBe('3')
    await r.unmount()

    // A later quick add on this device starts without the link, and a fourth add does not count on.
    const again = await render(<QuickAdd placeholder="Add a task" onAdd={async () => {}} />)
    expect(again.container.querySelector('[data-help-screen="quick-add"]')).toBeNull()
    await type(again.container.querySelector('input')!, 'Task 4')
    await act(async () => { again.container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    await flush(20)
    expect(quickAddUses()).toBe(3)
    await again.unmount()
  })
})
