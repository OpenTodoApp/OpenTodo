// @vitest-environment happy-dom
// Field buttons in quick add in a list (OpenSpec change add-task-button D2, issue #1936):
// Priority, Project and Label beside the field start their token, open the line's own
// suggestions and write what typing writes; a set field's words are selected.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../../lib/db'
import { saveQuickAddSettings } from '../../lib/nlp/settings'
import { resetDeviceId } from '../../lib/ops'
import { click, render, type, waitFor } from '../../ui/test-utils'
import { QuickAdd } from '../QuickAdd'

let n = 0
beforeEach(async () => {
  useDatabase(`quick-add-line-tools-${Date.now()}-${n++}`)
  resetDeviceId()
  await db.meta.put({ key: 'userId', value: 'u-ana' })
  saveQuickAddSettings({ enabled: true, languages: null })
})
afterEach(() => { saveQuickAddSettings({ enabled: true, languages: null }) })

const q = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)
const field = () => q<HTMLTextAreaElement>('textarea[aria-label="Add a task"]')!
const tool = (kind: string) => q<HTMLButtonElement>(`[data-quick-add-tool="${kind}"]`)!
const projects = [{ id: 'p-home', name: 'Home' }, { id: 'p-work', name: 'Work' }]
const labels = [{ id: 'l-errands', name: 'errands' }]

async function pick(suggestion: string) {
  await waitFor(() => !!q(`[data-suggestion="${suggestion}"]`), `the suggestion ${suggestion}`)
  await act(async () => { q(`[data-suggestion="${suggestion}"]`)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })) })
}

async function submit() {
  await act(async () => { field().form!.requestSubmit() })
}

describe('field buttons in quick add in a list', () => {
  it('Project starts `#`, opens the projects and writes the token; the task is saved in it', async () => {
    const onAdd = vi.fn()
    const r = await render(<QuickAdd layout="line" placeholder="Add a task" projects={projects} labels={labels} onAdd={onAdd} />)
    await type(field(), 'Buy primer')
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    tool('project').dispatchEvent(down)
    expect(down.defaultPrevented).toBe(true)
    await click(tool('project'))
    await waitFor(() => field().value === 'Buy primer #', 'the token started')
    await waitFor(() => q('[data-token-suggestions]')?.getAttribute('data-token-suggestions') === 'project', 'the projects')
    await pick('p-home')
    await waitFor(() => field().value.trim() === 'Buy primer #Home', 'the project written')
    await waitFor(() => tool('project').hasAttribute('data-set'), 'the button set')
    await waitFor(() => document.activeElement === field(), 'the field focused')
    await submit()
    await waitFor(() => onAdd.mock.calls.length > 0, 'added')
    expect(onAdd.mock.calls[0][0]).toMatchObject({ title: 'Buy primer', project_id: 'p-home' })
    await r.unmount()
  })

  it('Priority opens the levels; p1 is saved as priority 1', async () => {
    const onAdd = vi.fn()
    const r = await render(<QuickAdd layout="line" placeholder="Add a task" projects={projects} labels={labels} onAdd={onAdd} />)
    await type(field(), 'Call the bank')
    await click(tool('priority'))
    await waitFor(() => q('[data-token-suggestions]')?.getAttribute('data-token-suggestions') === 'priority', 'the levels')
    await pick('p1')
    await waitFor(() => field().value.trim() === 'Call the bank p1', 'p1 written')
    await submit()
    await waitFor(() => onAdd.mock.calls.length > 0, 'added')
    expect(onAdd.mock.calls[0][0]).toMatchObject({ title: 'Call the bank', priority: 1 })
    await r.unmount()
  })

  it('Label writes `@name`; the task is saved with the label', async () => {
    const onAdd = vi.fn()
    const r = await render(<QuickAdd layout="line" placeholder="Add a task" projects={projects} labels={labels} onAdd={onAdd} />)
    await type(field(), 'Fix the bike')
    await click(tool('label'))
    await waitFor(() => q('[data-token-suggestions]')?.getAttribute('data-token-suggestions') === 'label', 'the labels')
    await pick('l-errands')
    await waitFor(() => field().value.trim() === 'Fix the bike @errands', 'the label written')
    await submit()
    await waitFor(() => onAdd.mock.calls.length > 0, 'added')
    expect(onAdd.mock.calls[0][0]).toMatchObject({ title: 'Fix the bike', labels: ['l-errands'] })
    await r.unmount()
  })

  it('a set field: its button selects the words that set it', async () => {
    const r = await render(<QuickAdd layout="line" placeholder="Add a task" projects={projects} labels={labels} onAdd={vi.fn()} />)
    await type(field(), 'Buy primer #Work')
    await waitFor(() => tool('project').hasAttribute('data-set'), 'the button set')
    await click(tool('project'))
    await waitFor(() => field().selectionStart === 11 && field().selectionEnd === 16, '#Work selected')
    await r.unmount()
  })

  it('keyboard: the buttons follow the field in the tab order, are named by their field, and return the focus to it', async () => {
    const r = await render(<QuickAdd layout="line" placeholder="Add a task" projects={projects} labels={labels} onAdd={vi.fn()} />)
    const group = q('[data-quick-add-tools]')!
    expect(group.getAttribute('role')).toBe('group')
    const names = [...group.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))
    expect(names).toEqual(['Pick a date', 'Priority', 'Project', 'Label'])
    for (const b of group.querySelectorAll('button')) expect(b.tabIndex).toBe(0)
    // The buttons come after the field in document (tab) order.
    expect(field().compareDocumentPosition(tool('priority')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await type(field(), 'Plan trip')
    // A focused button activates on Enter or Space as a click (native button).
    tool('label').focus()
    await click(tool('label'))
    await waitFor(() => field().value === 'Plan trip @', 'the label token started')
    await waitFor(() => document.activeElement === field(), 'the field focused')
    await r.unmount()
  })

  it('recognition off: no field buttons', async () => {
    saveQuickAddSettings({ enabled: false, languages: null })
    const r = await render(<QuickAdd layout="line" placeholder="Add a task" projects={projects} labels={labels} onAdd={vi.fn()} />)
    expect(q('[data-quick-add-tools]')).toBeNull()
    await r.unmount()
  })
})
