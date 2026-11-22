// @vitest-environment happy-dom
// Quick add reads links (OpenSpec change quick-add-links, task 2.1): the link chip
// reads the host, the add carries the URL, and Backspace twice keeps it as text.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setMeta, useDatabase } from '../lib/db'
import type { QuickAddInput } from '../lib/nlp'
import { key, render, type, waitFor } from '../ui/test-utils'
import { QuickAdd } from './QuickAdd'

let n = 0
beforeEach(async () => {
  useDatabase(`qal-ui-${Date.now()}-${n++}`)
  await setMeta('userId', 'u1')
  localStorage.setItem('opentodo.quickadd', JSON.stringify({ enabled: true, languages: ['en'], dayMonthOrder: 'auto' }))
})
afterEach(() => localStorage.clear())

async function typed(line: string) {
  const added: QuickAddInput[] = []
  const r = await render(<QuickAdd placeholder="Add a task" onAdd={(i) => { added.push(i) }} />)
  const input = r.container.querySelector('textarea')!
  await type(input, line)
  const submit = async () => {
    await act(async () => { input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    await waitFor(() => added.length > 0, 'the add')
  }
  return { r, input, added, submit, chip: () => r.container.querySelector('[data-chip="link"]') }
}

describe('the link chip', () => {
  it('reads the host and adds the link', async () => {
    const { r, added, submit, chip } = await typed('Review the mockup https://www.example.com/mockup')
    await waitFor(() => !!chip(), 'the link chip')
    expect(chip()!.textContent).toContain('example.com')
    await submit()
    expect(added[0]).toMatchObject({ title: 'Review the mockup', links: ['https://www.example.com/mockup'] })
    await r.unmount()
  })

  it('Backspace twice keeps the link in the title', async () => {
    const { r, input, added, submit, chip } = await typed('Read https://example.com/post')
    await waitFor(() => !!chip(), 'the link chip')
    input.setSelectionRange(input.value.length, input.value.length)
    await key(input, 'Backspace')
    await key(input, 'Backspace')
    await waitFor(() => !chip(), 'the link chip dismissed')
    await submit()
    expect(added[0].title).toBe('Read https://example.com/post')
    expect(added[0].links).toBeUndefined()
    await r.unmount()
  })

  it('reads no link before the first sign-in: it stays where it was typed', async () => {
    await setMeta('userId', null)
    const { r, added, submit, chip } = await typed('Check https://example.com/x before lunch')
    await submit()
    expect(chip()).toBeNull()
    expect(added[0].title).toBe('Check https://example.com/x before lunch')
    expect(added[0].links).toBeUndefined()
    await r.unmount()
  })
})
