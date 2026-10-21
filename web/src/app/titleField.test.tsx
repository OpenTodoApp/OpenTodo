// @vitest-environment happy-dom
// A title that understands what is typed into it (OpenSpec change smart-title-tokens,
// natural-language-capture "Parsing while editing a title", design D6).
import { act, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveQuickAddSettings } from '../lib/nlp'
import type { EditPlan } from '../lib/nlp/edit'
import { flush, render, type } from '../ui/test-utils'
import { TitleField } from './TitleField'

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 9, 10, 0))
})
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = '' })

const projects = [{ id: 'p-work', name: 'Work' }]

function Harness({ title, onCommit, readOnly = false }: { title: string; onCommit: (p: EditPlan) => void; readOnly?: boolean }) {
  const [value, setValue] = useState(title)
  return <TitleField title={title} value={value} onChange={setValue} onCommit={onCommit} projects={projects} labels={[]} ariaLabel="Title" readOnly={readOnly} />
}

async function edit(field: HTMLInputElement, text: string) {
  await act(async () => { field.focus() })
  await type(field, text)
  await act(async () => { field.setSelectionRange(text.length, text.length) })
  await flush()
}
const commit = (field: HTMLInputElement) => act(async () => { field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })) })

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
    await flush(30)
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
})
