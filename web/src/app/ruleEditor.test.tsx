// @vitest-environment happy-dom
// The on-drop rule editor in Arrange (OpenSpec change rule-boards, task 3.4).
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createLabel, deleteLabel } from '../lib/labels'
import { resetDeviceId } from '../lib/ops'
import { createView, setOnDrop, setPanels } from '../lib/views'
import { click, flush, render, type } from '../ui/test-utils'
import { DashboardView } from './DashboardView'
import { resetPanel } from './panel'
import { useViewData } from './useViews'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 9, 0))
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function waitFor(ok: () => boolean | Promise<boolean>, ms = 3000) {
  for (let t = 0; t < ms && !(await ok()); t += 20) await flush(20)
  expect(await ok()).toBe(true)
}
function Board({ id }: { id: string }) {
  const data = useViewData()
  const dash = data.views.find((v) => v.id === id)
  return dash ? <DashboardView dashboard={dash} data={data} /> : null
}
const byLabel = (label: string) => document.querySelector<HTMLElement>(`[aria-label="${label}"]`)
const button = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!
const editor = () => document.querySelector<HTMLElement>('[data-testid="rule-editor"]')

async function setup() {
  const errands = await createView({ name: 'Errands', query: '@errand', pinned: false })
  const dash = await createView({ name: 'Board', kind: 'dashboard' })
  await setPanels(dash, [errands])
  await render(<Board id={dash} />)
  await waitFor(() => !!document.querySelector('section[aria-label="Errands"]'))
  await click(button('Arrange'))
  return errands
}

describe('rule editor', () => {
  it('sets "add label errand" and "due today" and the panel reads "Adds errand, due today" (spec "Edit a column\'s rule")', async () => {
    await createLabel({ name: 'errand' })
    const id = await setup()
    await click(byLabel('Rule for Errands')!)
    await waitFor(() => !!editor())
    // Phones open the label list as a sheet from a button; wide screens type into the field.
    const opener = editor()!.querySelector<HTMLButtonElement>('[data-combobox] > button')
    if (opener) await click(opener)
    await waitFor(() => !!document.querySelector('input[aria-label="Add labels"]'))
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Add labels"]')!
    await act(async () => input.focus())
    await type(input, 'errand')
    const option = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent?.includes('errand'))
    await waitFor(() => !!option())
    await click(option()!)
    const due = [...editor()!.querySelectorAll('label')].find((l) => l.textContent?.startsWith('Date'))!.querySelector('select')!
    await act(async () => { due.value = 'today'; due.dispatchEvent(new Event('change', { bubbles: true })) })
    await waitFor(() => editor()!.querySelector('[data-rule-summary]')!.textContent === 'Adds errand, due today')
    await click(button('Save'))
    await waitFor(async () => !!(await db.views.get(id))!.on_drop)
    expect((await db.views.get(id))!.on_drop).toMatchObject({ due: 'today', add_labels: [expect.any(String)] })
    const panel = document.querySelector<HTMLElement>('section[aria-label="Errands"]')!
    await waitFor(() => panel.hasAttribute('data-has-rule'))
    expect(document.getElementById(panel.getAttribute('aria-describedby')!)!.textContent).toBe('On drop: Adds errand, due today')
    expect(panel.querySelector('[data-rule-icon]')).toBeTruthy()
  })

  it('shows a deleted label as removed; "No rule" clears the rule (spec "Rule names a deleted label")', async () => {
    const gone = await createLabel({ name: 'gone' })
    await deleteLabel(gone)
    const errands = await setup()
    await setOnDrop(errands, { add_labels: [gone], priority: 2 })
    await waitFor(() => !!document.querySelector('section[aria-label="Errands"][data-has-rule]'))
    await click(byLabel('Rule for Errands')!)
    await waitFor(() => !!editor())
    expect(editor()!.querySelector('[data-rule-label="removed"]')!.textContent).toContain('Removed label')
    expect(editor()!.querySelector('[data-rule-summary]')!.textContent).toBe('Priority 2')
    await click(button('No rule'))
    await waitFor(async () => (await db.views.get(errands))!.on_drop === null)
  })
})
