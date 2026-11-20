// @vitest-environment happy-dom
// A title that understands what is typed into it (OpenSpec change smart-title-tokens,
// natural-language-capture "Parsing while editing a title", design D6).
import { act, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveQuickAddSettings } from '../lib/nlp'
import type { EditPlan } from '../lib/nlp/edit'
import { flush, render, type, waitFor } from '../ui/test-utils'
import { TitleField } from './TitleField'

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 9, 10, 0))
})
afterEach(() => { vi.useRealTimers() })

const projects = [{ id: 'p-work', name: 'Work' }]

function Harness({ title, onCommit, readOnly = false, multiline = false }: { title: string; onCommit: (p: EditPlan) => void; readOnly?: boolean; multiline?: boolean }) {
  const [value, setValue] = useState(title)
  return <TitleField title={title} value={value} onChange={setValue} onCommit={onCommit} projects={projects} labels={[]} ariaLabel="Title" readOnly={readOnly} multiline={multiline} />
}

async function edit(field: HTMLInputElement, text: string) {
  await act(async () => { field.focus() })
  await type(field, text)
  await act(async () => { field.setSelectionRange(text.length, text.length) })
  await flush()
}
const enter = (field: HTMLInputElement, init: KeyboardEventInit = {}) => {
  const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init })
  return act(async () => { field.dispatchEvent(ev) })
}
const commit = (field: HTMLInputElement) => enter(field)

describe('TitleField', () => {
  it('appending " tomorrow p1" shows chips, and Enter commits the date and priority with the title unchanged', async () => {
    const plans: EditPlan[] = []
    const r = await render(<Harness title="Call the bank" onCommit={(p) => plans.push(p)} />)
    const field = r.container.querySelector('input')!
    await edit(field, 'Call the bank tomorrow p1')
    expect(r.container.querySelector('[data-chip="due"]')).toBeTruthy()
    expect(r.container.querySelector('[data-chip="priority"]')).toBeTruthy()
    await commit(field)
    await flush()
    expect(plans.at(-1)!.patch).toMatchObject({ due: { date: '2026-10-10' }, priority: 1 })
    expect(plans.at(-1)!.patch.title).toBeUndefined()
    await r.unmount()
  })

  it('Enter while an input method is composing does not save the title', async () => {
    const plans: EditPlan[] = []
    const r = await render(<Harness title="开会" onCommit={(p) => plans.push(p)} />)
    const field = r.container.querySelector('input')!
    await edit(field, '开会明天')
    await enter(field, { isComposing: true })
    expect(plans).toEqual([])
    const code = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    Object.defineProperty(code, 'keyCode', { get: () => 229 })
    await act(async () => { field.dispatchEvent(code) })
    expect(plans).toEqual([])
    await commit(field)
    await flush()
    expect(plans.at(-1)!.patch.title).toBe('开会明天')
    await r.unmount()
  })

  it('never re-reads the old title: "Review may report" + " draft" is a plain rename', async () => {
    const plans: EditPlan[] = []
    const r = await render(<Harness title="Review may report" onCommit={(p) => plans.push(p)} />)
    const field = r.container.querySelector('input')!
    await edit(field, 'Review may report draft')
    expect(r.container.querySelector('[data-chip]')).toBeNull()
    await commit(field)
    await flush()
    expect(plans.at(-1)).toEqual({ patch: { title: 'Review may report draft' }, labels: [], reminders: [] })
    await r.unmount()
  })

  it('a project token moves the task: its id is in the plan', async () => {
    const plans: EditPlan[] = []
    const r = await render(<Harness title="Plan" onCommit={(p) => plans.push(p)} />)
    const field = r.container.querySelector('input')!
    await edit(field, 'Plan #Work')
    // The first Enter picks "Work" from the suggestions, the second commits.
    expect(document.querySelector('[role="listbox"]')).toBeTruthy()
    await commit(field)
    await waitFor(() => field.value === 'Plan #Work ', 'the suggestion picked')
    expect(field.value).toBe('Plan #Work ')
    await commit(field)
    await flush()
    expect(plans.at(-1)!.patch).toMatchObject({ project_id: 'p-work' })
    await r.unmount()
  })

  it('with parsing off, or for a viewer, the text is the title and nothing is parsed', async () => {
    saveQuickAddSettings({ ...(await import('../lib/nlp')).loadQuickAddSettings(), enabled: false })
    const plans: EditPlan[] = []
    const r = await render(<Harness title="Call the bank" onCommit={(p) => plans.push(p)} />)
    const field = r.container.querySelector('input')!
    await edit(field, 'Call the bank tomorrow')
    expect(r.container.querySelector('[data-chip]')).toBeNull()
    await commit(field)
    await flush()
    expect(plans.at(-1)).toEqual({ patch: { title: 'Call the bank tomorrow' }, labels: [], reminders: [] })
    await r.unmount()
  })

  it('a long panel title scrolled to its end shows its start again once left', async () => {
    const r = await render(<Harness title={'Long title '.repeat(20).trim()} onCommit={() => {}} multiline />)
    const field = r.container.querySelector('textarea')!
    await act(async () => { field.focus() })
    field.scrollTop = 80
    await act(async () => { field.blur() })
    expect(field.scrollTop).toBe(0)
    await r.unmount()
  })

  // GitHub issue 1463: the × on a chip keeps the words as text and sets nothing, in
  // the title editors as in quick add (natural-language-capture "Dismiss and escape
  // parsed tokens", "Parsing while editing a title").
  describe('dismissing a chip', () => {
    const dismissed = async (title: string, line: string, kind: string) => {
      const plans: EditPlan[] = []
      const r = await render(<Harness title={title} onCommit={(p) => plans.push(p)} />)
      const field = r.container.querySelector('input')!
      await edit(field, line)
      await waitFor(() => !!r.container.querySelector(`[data-chip="${kind}"]`), `the ${kind} chip`)
      await press(r.container.querySelector(`[data-chip="${kind}"] button`)!)
      return { r, plans, field }
    }

    it('the × on the date keeps the text as typed, sets no due date and does not end the edit', async () => {
      const { r, plans, field } = await dismissed('review order', 'review order from 10. Oct 2026', 'due')
      expect(plans).toEqual([])
      expect(document.activeElement).toBe(field)
      expect(field.value).toBe('review order from 10. Oct 2026')
      expect(r.container.querySelector('[data-chip="due"]')).toBeNull()
      await commit(field)
      await flush()
      expect(plans).toEqual([{ patch: { title: 'review order from 10. Oct 2026' }, labels: [], reminders: [] }])
      await r.unmount()
    })

    it('the dismissed date stays dismissed while typing goes on; a new token still parses', async () => {
      const { r, plans, field } = await dismissed('Call', 'Call next friday', 'due')
      await type(field, 'Call next friday p1')
      await flush()
      expect(r.container.querySelector('[data-chip="due"]')).toBeNull()
      expect(r.container.querySelector('[data-chip="priority"]')).toBeTruthy()
      await commit(field)
      await flush()
      expect(plans.at(-1)).toEqual({ patch: { title: 'Call next friday', priority: 1 }, labels: [], reminders: [] })
      await r.unmount()
    })

    it.each([
      ['due', 'Water plants tomorrow'],
      ['priority', 'Water plants p2'],
      ['label', 'Water @garden plants'],
      ['project', 'Water #Work plants'],
      ['recurrence', 'Water plants every Monday'],
      ['estimate', 'Water plants +30m'],
    ])('the × on a %s chip saves the line as typed and nothing else', async (kind, line) => {
      const { r, plans, field } = await dismissed('Water plants', line, kind)
      await commit(field)
      await flush()
      expect(plans.at(-1)).toEqual({ patch: { title: line }, labels: [], reminders: [] })
      await r.unmount()
    })

    it('Tab to the × and Enter on it dismisses within the same edit', async () => {
      const plans: EditPlan[] = []
      const r = await render(<Harness title="Pay" onCommit={(p) => plans.push(p)} />)
      const field = r.container.querySelector('input')!
      await edit(field, 'Pay tomorrow')
      const x = r.container.querySelector<HTMLButtonElement>('[data-chip="due"] button')!
      await act(async () => { x.focus() })
      expect(plans).toEqual([])
      await act(async () => { x.click() })
      expect(document.activeElement).toBe(field)
      await commit(field)
      await flush()
      expect(plans).toEqual([{ patch: { title: 'Pay tomorrow' }, labels: [], reminders: [] }])
      await r.unmount()
    })
  })
})

/** A mouse press as a browser makes it: focus moves to the button unless mousedown is prevented, then the click. */
async function press(el: HTMLElement) {
  await act(async () => {
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    el.dispatchEvent(down)
    if (!down.defaultPrevented) el.focus()
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
  })
  // The press may have ended the edit and removed the chips: the click lands only if the button is still there.
  await act(async () => { if (el.isConnected) el.click() })
}
