// @vitest-environment happy-dom
// Quick add ends at its field and preview (OpenSpec change lean-chrome D1,
// documentation "Contextual help" "No help under the field"): no help link on the
// first add or any later one, and nothing about its uses is stored on the device.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { flush, render, type, waitFor } from '../ui/test-utils'
import { pastedInputs, QuickAdd } from './QuickAdd'

beforeEach(() => localStorage.clear())

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
      await waitFor(() => added.length === i, `add ${i}`)
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
    await waitFor(() => !!r.container.querySelector('[data-chip="spent"]'), 'the Spent chip')
    const chips = [...r.container.querySelectorAll('[data-chip]')].map((c) => [c.getAttribute('data-chip'), c.textContent])
    expect(chips.map((c) => c[0])).toEqual(['estimate', 'spent'])
    expect(chips[1][1]).toContain('Spent 30 min')
    await act(async () => { r.container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    await waitFor(() => added.length === 1, 'the add')
    expect(added[0]).toMatchObject({ title: 'Draft the offer', estimate_minutes: 120, spent_minutes: 30 })
    await r.unmount()
  })

  it('Plus stays an estimate only', async () => {
    const added: Record<string, unknown>[] = []
    const r = await render(<QuickAdd placeholder="Add a task" onAdd={async (input) => { added.push(input as never) }} />)
    await type(r.container.querySelector('input')!, 'Draft the offer +30m')
    await act(async () => { r.container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    await waitFor(() => added.length === 1, 'the add')
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
    await waitFor(() => !!r.container.querySelector('[data-chip="project"]'), 'the project chip')
    expect(input.value).toBe('Paint the hall #Homerenovation ')
    expect(r.container.querySelector('[data-chip="project"]')!.textContent).toContain('Home renovation')
    // Enter now submits: the list is closed.
    await act(async () => { r.container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    await waitFor(() => added.length === 1, 'the add')
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

describe('inline tints (moments-and-onboarding 6.1)', () => {
  const tints = (root: ParentNode) => [...root.querySelectorAll('[data-quick-add-tints] [data-tint]')].map((m) => [m.getAttribute('data-tint'), m.textContent])
  const setup = async () => {
    const r = await render(<QuickAdd placeholder="Add a task" onAdd={async () => {}} />)
    return { r, input: r.container.querySelector('input')! }
  }

  it('Chips appear as tokens are typed, and the field tints the same spans in their hue', async () => {
    const { r, input } = await setup()
    await type(input, 'Buy milk tomorrow p2')
    await waitFor(() => tints(r.container).length === 2, 'two tints')
    expect(tints(r.container)).toEqual([['due', 'tomorrow'], ['priority', 'p2']])
    const layer = r.container.querySelector('[data-quick-add-tints]')!
    expect(layer.textContent).toBe('Buy milk tomorrow p2')
    expect(layer.querySelector('[data-tint="priority"]')!.getAttribute('data-hue')).toBe(r.container.querySelector('[data-chip="priority"]')!.getAttribute('data-hue'))
    await type(input, 'Buy milk tomorrow')
    await waitFor(() => tints(r.container).length === 1, 'one tint')
    expect(tints(r.container)).toEqual([['due', 'tomorrow']])
    await r.unmount()
  })

  it('Dismissing the recurrence chip removes its tint', async () => {
    const { r, input } = await setup()
    await type(input, 'Water plants every Monday')
    await waitFor(() => tints(r.container).some((x) => x[0] === 'recurrence'), 'the recurrence tint')
    expect(tints(r.container).map((x) => x[0])).toContain('recurrence')
    await act(async () => { r.container.querySelector<HTMLButtonElement>('[data-chip="recurrence"] button')!.click() })
    await waitFor(() => !r.container.querySelector('[data-chip="recurrence"]'), 'the chip dismissed')
    expect(tints(r.container).map((x) => x[0])).not.toContain('recurrence')
    await r.unmount()
  })

  it('Quoted phrase: no reminder and no tint for the quoted span', async () => {
    const { r, input } = await setup()
    await type(input, 'Read "remind me at 9" essay')
    // The layer mirrors the text once the parse has run.
    await waitFor(() => r.container.querySelector('[data-quick-add-tints]')?.textContent === 'Read "remind me at 9" essay', 'the parsed text')
    expect(tints(r.container)).toEqual([])
    await r.unmount()
  })

  it('Screen reader: the layer is hidden; the field and the chips are what is read', async () => {
    const { r, input } = await setup()
    await type(input, 'Call Ana friday')
    await waitFor(() => !!r.container.querySelector('[data-chip="due"]'), 'the due chip')
    expect(r.container.querySelector('[data-quick-add-tints]')!.getAttribute('aria-hidden')).toBe('true')
    expect(input.value).toBe('Call Ana friday')
    expect(r.container.querySelector('[data-chip="due"]')).not.toBeNull()
    await r.unmount()
  })

  it('High contrast: the tint becomes a 1 px underline in the attribute colour', async () => {
    const css = (await import('../index.css?raw')).default
    expect(css).toMatch(/\[data-contrast="high"\] \.quick-add-tint \{[^}]*underline 1px var\(--hue-solid\)/)
    const { r, input } = await setup()
    await type(input, 'Pay rent p1')
    await waitFor(() => !!r.container.querySelector('[data-tint="priority"]'), 'the priority tint')
    expect(r.container.querySelector('[data-tint="priority"]')!.className).toBe('quick-add-tint')
    await r.unmount()
  })
})

// OpenSpec change paste-to-tasks, tasks 3.1 and 3.2: a pasted list offers one task per line.
describe('pasting several lines', () => {
  /** Pastes `text` into the field; returns whether the paste was held back. */
  async function paste(input: HTMLInputElement, text: string): Promise<boolean> {
    const e = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(e, 'clipboardData', { value: { files: [], getData: (kind: string) => (kind === 'text/plain' ? text : '') } })
    await act(async () => { input.dispatchEvent(e) })
    await flush()
    return e.defaultPrevented
  }
  const offer = () => document.querySelector<HTMLElement>('[data-paste-offer]')
  const press = (sel: string) => act(async () => { document.querySelector<HTMLButtonElement>(sel)!.click() })

  async function setup(extra: { onAddMany?: boolean } = {}) {
    const added: Record<string, unknown>[] = []
    const many: Record<string, unknown>[][] = []
    const r = await render(<QuickAdd placeholder="Add a task" projects={[{ id: 'p-work', name: 'Work' }]}
      onAdd={async (i) => { added.push(i as never) }}
      onAddMany={extra.onAddMany === false ? undefined : async (inputs) => { many.push(inputs as never) }} />)
    return { r, added, many, input: r.container.querySelector('input')! }
  }

  it('an empty field: the offer shows the count, five previews and "and N more"; Add hands every line at once', async () => {
    const { r, many, added, input } = await setup()
    expect(await paste(input, '- Milk\n- Eggs\n\n- Bread\n* Butter\n1. Jam\n2) Tea\n[ ] Rice')).toBe(true)
    await waitFor(() => !!offer(), 'the offer')
    expect(offer()!.dataset.pasteOffer).toBe('add')
    expect(offer()!.textContent).toContain('Add 7 tasks, one per line?')
    expect([...document.querySelectorAll('[data-paste-preview] li:not([data-paste-more])')].map((li) => li.textContent)).toEqual(['Milk', 'Eggs', 'Bread', 'Butter', 'Jam'])
    expect(document.querySelector('[data-paste-more]')!.textContent).toBe('and 2 more')
    expect(document.querySelector('[data-paste-add]')!.textContent).toContain('Add 7 tasks')
    await press('[data-paste-add]')
    await waitFor(() => many.length === 1 && !offer(), 'the batch')
    expect(many[0].map((i) => i.title)).toEqual(['Milk', 'Eggs', 'Bread', 'Butter', 'Jam', 'Tea', 'Rice'])
    expect(added).toEqual([])
    expect(input.value).toBe('')
    await r.unmount()
  })

  it('a field that already holds text is not intercepted', async () => {
    const { r, input } = await setup()
    await type(input, 'Buy ')
    await act(async () => { input.setSelectionRange(4, 4) })
    expect(await paste(input, 'Milk\nEggs')).toBe(false)
    expect(offer()).toBeNull()
    await r.unmount()
  })

  it('a wholly selected field is intercepted', async () => {
    const { r, input } = await setup()
    await type(input, 'old text')
    await act(async () => { input.setSelectionRange(0, input.value.length) })
    expect(await paste(input, 'Milk\nEggs')).toBe(true)
    await waitFor(() => !!offer(), 'the offer')
    await r.unmount()
  })

  it('a single line (after cleanup) pastes as before', async () => {
    const { r, input } = await setup()
    expect(await paste(input, '- Milk\n\n   \n-')).toBe(false)
    expect(offer()).toBeNull()
    await r.unmount()
  })

  it('Paste as one line fills the field with the lines joined by spaces and creates nothing', async () => {
    const { r, input, many, added } = await setup()
    await paste(input, 'Milk\nEggs')
    await waitFor(() => !!offer(), 'the offer')
    await press('[data-paste-one-line]')
    await waitFor(() => !offer() && input.value === 'Milk Eggs', 'the joined line')
    expect(many).toEqual([])
    expect(added).toEqual([])
    await r.unmount()
  })

  it('Escape closes the offer and pastes nothing', async () => {
    const { r, input, many } = await setup()
    await paste(input, 'Milk\nEggs')
    await waitFor(() => !!offer(), 'the offer')
    await act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })) })
    await waitFor(() => !offer(), 'the offer closed')
    expect(input.value).toBe('')
    expect(many).toEqual([])
    await r.unmount()
  })

  it('more than 100 lines: the offer says so, offers Import and one line, and adds nothing', async () => {
    const { r, input, many } = await setup()
    await paste(input, Array.from({ length: 150 }, (_, i) => `Item ${i + 1}`).join('\n'))
    await waitFor(() => !!offer(), 'the offer')
    expect(offer()!.dataset.pasteOffer).toBe('too-many')
    expect(offer()!.textContent).toContain('That is more than 100 lines. Use Import for long lists.')
    expect(document.querySelector('[data-paste-import]')).not.toBeNull()
    expect(document.querySelector('[data-paste-one-line]')).not.toBeNull()
    expect(document.querySelector('[data-paste-add]')).toBeNull()
    expect(many).toEqual([])
    await r.unmount()
  })

  it('a refused batch keeps the offer open with the reason', async () => {
    const r = await render(<QuickAdd placeholder="Add a task" onAdd={() => {}} onAddMany={async () => { throw new Error('This title is too long to encrypt.') }} />)
    const input = r.container.querySelector('input')!
    await paste(input, 'Milk\nEggs')
    await waitFor(() => !!offer(), 'the offer')
    await press('[data-paste-add]')
    await waitFor(() => !!document.querySelector('[data-paste-error]'), 'the reason')
    expect(document.querySelector('[data-paste-error]')!.textContent).toBe('This title is too long to encrypt.')
    expect(offer()).not.toBeNull()
    await r.unmount()
  })

  it('without onAddMany each line goes through onAdd in order', async () => {
    const { r, input, added } = await setup({ onAddMany: false })
    await paste(input, 'One\nTwo\nThree')
    await waitFor(() => !!offer(), 'the offer')
    await press('[data-paste-add]')
    await waitFor(() => added.length === 3, 'three adds')
    expect(added.map((i) => i.title)).toEqual(['One', 'Two', 'Three'])
    await r.unmount()
  })
})

describe('pastedInputs (paste-to-tasks 3.2)', () => {
  const context = { today: '2026-10-30', now: '09:00', languages: ['en'], weekStart: 1, projects: [{ id: 'p-work', name: 'Work' }] }

  it('each line is parsed on its own: dates, #project and p1', async () => {
    const inputs = await pastedInputs(['Call Anna tomorrow 10am', 'Send invoice #Work p1'], context)
    expect(inputs[0]).toMatchObject({ title: 'Call Anna', due: { date: '2026-10-31', time: '10:00' } })
    expect(inputs[1]).toMatchObject({ title: 'Send invoice', project_id: 'p-work', priority: 1 })
    expect(inputs[1].due).toBeUndefined()
  })

  it('a line that parses to no title keeps its text; with parsing off lines are titles as they are', async () => {
    expect(await pastedInputs(['tomorrow'], context)).toEqual([{ title: 'tomorrow' }])
    expect(await pastedInputs(['Call Anna tomorrow', 'p1'], null)).toEqual([{ title: 'Call Anna tomorrow' }, { title: 'p1' }])
  })
})
