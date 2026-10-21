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

// Token suggestions and explained misses (OpenSpec change smart-title-tokens,
// natural-language-capture "Token suggestions" and "Unmatched tokens are explained").
describe('# and @ suggestions', () => {
  const projects = [{ id: 'p-home', name: 'Home' }, { id: 'p-homework', name: 'Homework' }, { id: 'p-reno', name: 'Home renovation' }]
  const labels = [{ id: 'l-errand', name: 'errand' }, { id: 'l-deep', name: 'deep-work' }]
  /** Types `text` with the caret at its end, as a person would. */
  async function typeAtEnd(input: HTMLInputElement, text: string) {
    await type(input, text)
    await act(async () => { input.setSelectionRange(text.length, text.length); input.dispatchEvent(new Event('select', { bubbles: true })) })
    await flush()
  }
  const key = (input: HTMLInputElement, k: string) => act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })) })
  const options = () => [...document.querySelectorAll('[role="listbox"] [role="option"]')].map((o) => o.textContent ?? '')

  it('#ren lists "Home renovation"; Enter inserts a token that resolves to it and shows its chip', async () => {
    const added: Record<string, unknown>[] = []
    const r = await render(<QuickAdd placeholder="Add a task" projects={projects} onAdd={async (i) => { added.push(i as never) }} />)
    const input = r.container.querySelector('input')!
    await typeAtEnd(input, 'Paint the hall #ren')
    expect(input.getAttribute('aria-expanded')).toBe('true')
    expect(options()[0]).toContain('Home renovation')
    await key(input, 'Enter')
    await flush(30)
    expect(input.value).toBe('Paint the hall #Homerenovation ')
    expect(r.container.querySelector('[data-chip="project"]')!.textContent).toContain('Home renovation')
    // Enter now submits: the list is closed.
    await act(async () => { r.container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    await flush(30)
    expect(added[0]).toMatchObject({ title: 'Paint the hall', project_id: 'p-reno' })
    await r.unmount()
  })

  it('@d lists deep-work and offers Create last', async () => {
    const r = await render(<QuickAdd placeholder="Add a task" labels={labels} onAdd={() => {}} />)
    const input = r.container.querySelector('input')!
    await typeAtEnd(input, 'Focus @d')
    expect(options()[0]).toContain('deep-work')
    expect(options().at(-1)).toContain('Create label “d”')
    await r.unmount()
  })

  it('Esc closes the list and keeps the text, without leaving quick add', async () => {
    const r = await render(<QuickAdd placeholder="Add a task" projects={projects} onAdd={() => {}} />)
    const input = r.container.querySelector('input')!
    input.focus()
    await typeAtEnd(input, 'Fix #ho')
    expect(options().length).toBeGreaterThan(0)
    await key(input, 'Escape')
    await flush()
    expect(document.querySelector('[role="listbox"]')).toBeNull()
    expect(input.value).toBe('Fix #ho')
    expect(document.activeElement).toBe(input)
    await r.unmount()
  })

  it('explains an unknown and an ambiguous #token, and names a new label', async () => {
    const r = await render(<QuickAdd placeholder="Add a task" projects={projects} labels={labels} onAdd={() => {}} />)
    const input = r.container.querySelector('input')!
    await typeAtEnd(input, 'Rake leaves #gardn @urgent')
    expect(r.container.querySelector('[data-unmatched="none"]')!.textContent).toContain('No project “gardn” · stays in the title')
    expect(r.container.querySelector('[data-new-label]')!.textContent).toBe('New label “urgent”')
    await typeAtEnd(input, 'Fix sink #hom now')
    expect(r.container.querySelector('[data-unmatched="ambiguous"]')!.textContent).toContain('3 projects match “hom”')
    await r.unmount()
  })
})
