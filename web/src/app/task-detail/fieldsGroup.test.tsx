// @vitest-environment happy-dom
// The Fields group of the task panel (OpenSpec custom-fields, "Fields in the
// detail panel", "Typed values and their limits"): one editor per definition of
// the task's project, inline errors, the mismatch note, absent for Inbox.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { db } from '../../lib/db'
import { createField, setFieldValue } from '../../lib/fields'
import { applyOps, createProject, createTask } from '../../lib/ops'
import { click, key } from '../../ui/test-utils'
import { open, settle, setupTaskDetailTests, waitFor } from './taskDetail.testkit'

setupTaskDetailTests()

async function typeInto(input: HTMLInputElement, text: string) {
  await act(async () => {
    input.focus()
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function kitchen() {
  const pid = await createProject({ name: 'Kitchen' })
  const cost = await createField(pid, { name: 'Cost', type: 'number' })
  const status = await createField(pid, { name: 'Status', type: 'choice', options: 'Quote\nOrdered\nDone' })
  const quote = await createField(pid, { name: 'Quote', type: 'link' })
  const paid = await createField(pid, { name: 'Paid', type: 'checkbox' })
  const id = await createTask({ title: 'Tiles', project_id: pid })
  return { pid, cost, status, quote, paid, id }
}

const group = (c: HTMLElement) => c.querySelector('[data-fields-group]') as HTMLElement | null
const fieldRow = (c: HTMLElement, defId: string) => c.querySelector(`[data-field-row="${defId}"]`) as HTMLElement

describe('Fields group', () => {
  it('lists the project fields in order and is absent for Inbox and projects without fields', async () => {
    const { id, cost, status, quote, paid } = await kitchen()
    const r = await open(id)
    await waitFor(() => !!group(r.container))
    expect([...group(r.container)!.querySelectorAll('[data-field-row]')].map((e) => e.getAttribute('data-field-row'))).toEqual([cost, status, quote, paid])
    await r.unmount()
    const inbox = await createTask({ title: 'Loose' })
    const r2 = await open(inbox)
    expect(group(r2.container)).toBeNull()
    await r2.unmount()
    const empty = await createProject({ name: 'Garden' })
    const g = await createTask({ title: 'Seeds', project_id: empty })
    const r3 = await open(g)
    expect(group(r3.container)).toBeNull()
    await r3.unmount()
  })

  it('Edit a number: 120 and Enter writes the number, shown with digit grouping', async () => {
    const { id, cost } = await kitchen()
    const r = await open(id)
    await waitFor(() => !!group(r.container))
    const input = fieldRow(r.container, cost).querySelector('input') as HTMLInputElement
    expect(input.getAttribute('inputmode')).toBe('decimal')
    await typeInto(input, '1234.5')
    await key(input, 'Enter')
    await settle()
    expect((await db.tasks.get(id))!.fields).toEqual({ [cost]: 1234.5 })
    await waitFor(() => input.value === new Intl.NumberFormat().format(1234.5))
    await r.unmount()
  })

  it('Number refused in the panel: an inline error, nothing written', async () => {
    const { id, cost } = await kitchen()
    const r = await open(id)
    await waitFor(() => !!group(r.container))
    const input = fieldRow(r.container, cost).querySelector('input') as HTMLInputElement
    await typeInto(input, 'abc')
    await key(input, 'Enter')
    await settle()
    expect(input.getAttribute('aria-invalid')).toBe('true')
    const err = fieldRow(r.container, cost).querySelector('[role="alert"]')
    expect(err?.textContent).toContain('number')
    expect(input.getAttribute('aria-describedby')).toContain(err!.id)
    expect((await db.tasks.get(id))!.fields ?? {}).toEqual({})
    await r.unmount()
  })

  it('Open a link: the row shows the link and an action without a referrer', async () => {
    const { id, quote } = await kitchen()
    await setFieldValue(id, quote, 'https://example.com/quote.pdf')
    const r = await open(id)
    await waitFor(() => !!fieldRow(r.container, quote)?.querySelector('a'))
    const a = fieldRow(r.container, quote).querySelector('a')!
    expect((fieldRow(r.container, quote).querySelector('input') as HTMLInputElement).value).toBe('https://example.com/quote.pdf')
    expect(a.getAttribute('href')).toBe('https://example.com/quote.pdf')
    expect(a.getAttribute('target')).toBe('_blank')
    expect(a.getAttribute('rel')).toBe('noopener noreferrer')
    await r.unmount()
  })

  it('Keyboard: editors are reachable in order; a choice opens with Alt+Down and writes the option', async () => {
    const { id, status, paid } = await kitchen()
    const r = await open(id)
    await waitFor(() => !!group(r.container))
    const focusables = [...group(r.container)!.querySelectorAll<HTMLElement>('input, button')]
    expect(focusables.length).toBeGreaterThanOrEqual(4)
    expect(focusables.every((e) => e.tabIndex >= 0)).toBe(true)
    const picker = fieldRow(r.container, status).querySelector('button[aria-haspopup]') as HTMLButtonElement
    picker.focus()
    await key(picker, 'ArrowDown', { altKey: true })
    await settle()
    expect(picker.getAttribute('aria-expanded')).toBe('true')
    const option = [...document.querySelectorAll('[role="option"]')].find((o) => o.textContent?.includes('Ordered'))!
    await click(option)
    await settle()
    expect((await db.tasks.get(id))!.fields?.[status]).toBe('Ordered')
    const sw = fieldRow(r.container, paid).querySelector('[role="switch"]') as HTMLButtonElement
    await click(sw)
    await settle()
    expect((await db.tasks.get(id))!.fields?.[paid]).toBe(true)
    await r.unmount()
  })

  it('a value that no longer matches its type shows as text with a note; the next edit replaces it', async () => {
    const { id, cost } = await kitchen()
    // A string arrives for a number field (another device, an older client).
    await applyOps([{ id: 'x', entity: 'task', entityId: id, field: `fields.${cost}`, value: 'cheap', ts: Date.now() + 1, device: 'other' }])
    const r = await open(id)
    await waitFor(() => !!fieldRow(r.container, cost))
    const input = fieldRow(r.container, cost).querySelector('input') as HTMLInputElement
    expect(input.value).toBe('cheap')
    const note = fieldRow(r.container, cost).querySelector('p')
    expect(note?.textContent).toBe('(not a number)')
    expect(input.getAttribute('aria-describedby')).toContain(note!.id)
    await typeInto(input, '75')
    await key(input, 'Enter')
    await settle()
    expect((await db.tasks.get(id))!.fields?.[cost]).toBe(75)
    await r.unmount()
  })

  it('viewers see values read-only', async () => {
    const { id, cost } = await kitchen()
    await setFieldValue(id, cost, 5)
    const r = await open(id, { readOnly: true })
    await waitFor(() => !!fieldRow(r.container, cost))
    expect((fieldRow(r.container, cost).querySelector('input') as HTMLInputElement).readOnly).toBe(true)
    await r.unmount()
  })
})
