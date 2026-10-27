// @vitest-environment happy-dom
// The Fields dialog (OpenSpec custom-fields, "Managing definitions"): add,
// duplicate names refused with focus kept, viewers not offered the dialog, the
// delete confirmation states how many tasks hold a value, keyboard reorder, axe.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { createField, liveFields, setFieldValue } from '../lib/fields'
import { createProject, createTask, mutate, resetDeviceId } from '../lib/ops'
import type { Project } from '../lib/types'
import { click, key, render, waitFor } from '../ui/test-utils'
import { FieldsDialog, renamedOptions, valuesText } from './FieldsDialog'
import { projectMenuGroups } from './ProjectHeader'

let n = 0
beforeEach(() => {
  useDatabase(`fieldsdialog-${Date.now()}-${n++}`)
  resetDeviceId()
  document.body.innerHTML = ''
})

async function setValue(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) {
  await act(async () => {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  })
}

async function openDialog() {
  const pid = await createProject({ name: 'Kitchen' })
  const project = (await db.projects.get(pid)) as Project
  const r = await render(<FieldsDialog project={project} onClose={() => {}} />)
  const dialog = () => document.querySelector('[data-testid="fields-dialog"]') as HTMLElement
  await waitFor(() => !!dialog()?.querySelector('form[aria-label="Add a field"] input'), 'the dialog')
  const form = () => dialog().querySelector('form[aria-label="Add a field"]') as HTMLFormElement
  const nameInput = () => form().querySelector('input') as HTMLInputElement
  const add = async (name: string, type = 'text', options?: string) => {
    await setValue(nameInput(), name)
    await setValue(form().querySelector('select')!, type)
    if (options !== undefined) {
      await waitFor(() => !!form().querySelector('textarea'), 'the options field')
      await setValue(form().querySelector('textarea')!, options)
    }
    await act(async () => { form().requestSubmit() })
    // Added (the name is cleared) or refused (the dialog says why).
    await waitFor(() => nameInput().value === '' || /already has a field named/.test(dialog().textContent ?? ''), 'the field added or refused')
  }
  return { pid, r, dialog, form, nameInput, add }
}

describe('Fields dialog', () => {
  it('adds fields of each kind; a choice keeps its options', async () => {
    const { pid, dialog, add, r } = await openDialog()
    await add('Cost', 'number')
    await add('Status', 'choice', 'Quote\nOrdered\nDone')
    await waitFor(() => dialog().querySelectorAll('[data-field-def]').length === 2)
    const defs = liveFields(pid, await db.fields.toArray())
    expect(defs.map((d) => [d.name, d.type, d.options])).toEqual([['Cost', 'number', ''], ['Status', 'choice', 'Quote\nOrdered\nDone']])
    expect([...dialog().querySelectorAll('[data-field-type]')].map((e) => e.textContent)).toEqual(['Number', 'Choice'])
    await r.unmount()
  })

  it('Duplicate name: refused, focus stays on the name', async () => {
    const { pid, dialog, add, nameInput, r } = await openDialog()
    await add('Cost', 'number')
    await add('cost', 'text')
    expect(dialog().textContent).toContain('already has a field named')
    expect(document.activeElement).toBe(nameInput())
    expect(liveFields(pid, await db.fields.toArray())).toHaveLength(1)
    await r.unmount()
  })

  it('Alt+Down on a row handle moves the field down', async () => {
    const { pid, dialog, add, r } = await openDialog()
    await add('A')
    await add('B')
    await waitFor(() => dialog().querySelectorAll('[data-field-handle]').length === 2)
    const handle = dialog().querySelector('[data-field-handle]') as HTMLButtonElement
    handle.focus()
    await key(handle, 'ArrowDown', { altKey: true })
    await waitFor(() => [...dialog().querySelectorAll('[data-field-def]')].map((e) => e.textContent?.includes('B')).at(0) === true)
    expect(liveFields(pid, await db.fields.toArray()).map((d) => d.name)).toEqual(['B', 'A'])
    await r.unmount()
  })

  it('delete asks first and states how many tasks hold a value; values stay', async () => {
    const { pid, dialog, add, r } = await openDialog()
    await add('Cost', 'number')
    const [def] = liveFields(pid, await db.fields.toArray())
    const t1 = await createTask({ title: 'a', project_id: pid })
    const t2 = await createTask({ title: 'b', project_id: pid })
    await setFieldValue(t1, def.id, 1)
    await setFieldValue(t2, def.id, 2)
    await click(dialog().querySelector('button[aria-label="Delete Cost"]')!)
    await waitFor(() => !!document.querySelector('[data-testid="confirm-dialog"]')?.textContent?.includes('Values on 2 tasks'), 'the confirmation with the count')
    const confirm = document.querySelector('[data-testid="confirm-dialog"]') as HTMLElement
    expect(confirm.textContent).toContain('Values on 2 tasks are kept but hidden.')
    await click([...confirm.querySelectorAll('button')].find((b) => b.textContent?.includes('Delete field'))!)
    await waitFor(async () => liveFields(pid, await db.fields.toArray()).length === 0, 'the field deleted')
    expect((await db.tasks.get(t1))!.fields).toEqual({ [def.id]: 1 })
    expect(valuesText(1)).toBe('Values on 1 task are kept but hidden.')
    await r.unmount()
  })

  it('has no axe violations', async () => {
    const { add, dialog, r } = await openDialog()
    await add('Cost', 'number')
    const axe = (await import('axe-core')).default
    const res = await axe.run(dialog(), { rules: { 'color-contrast': { enabled: false } } })
    expect(res.violations.map((v) => v.id)).toEqual([])
    await r.unmount()
  })
})

describe('inherited fields (inherited-custom-fields)', () => {
  it('lists the parent\'s fields first, read-only, refuses their names and flags a clash', async () => {
    const scoring = await createProject({ name: 'Scoring' })
    const topic = await createProject({ name: 'Topic', parent_id: scoring })
    await createField(scoring, { name: 'WSJF', type: 'number' })
    // A clash that arrives through a move: written as plain ops, as another device would.
    await mutate('field', 'own-size', { name: 'Size', project_id: topic, type: 'number', options: '', position: 0, created_at: 1, deleted_at: null })
    await mutate('field', 'parent-size', { name: 'size', project_id: scoring, type: 'number', options: '', position: 5, created_at: 1, deleted_at: null })
    const project = (await db.projects.get(topic)) as Project
    await render(<FieldsDialog project={project} onClose={() => {}} />)
    const dialog = () => document.querySelector('[data-testid="fields-dialog"]') as HTMLElement
    await waitFor(() => dialog()?.querySelectorAll('[data-field-inherited]').length === 2, 'the inherited fields')
    const group = dialog().querySelector(`[data-inherited-fields="${scoring}"]`) as HTMLElement
    expect(group.textContent).toContain('From Scoring')
    expect(group.querySelectorAll('button')).toHaveLength(0)
    expect(dialog().querySelector('[data-inherited-note]')?.textContent).toContain('edited in the project that defines them')
    expect(dialog().querySelector('[data-field-def="own-size"] [data-field-clash]')?.textContent).toContain('“Scoring”')
    // Adding a name the parent already has is refused, naming the parent.
    const form = dialog().querySelector('form[aria-label="Add a field"]') as HTMLFormElement
    const input = form.querySelector('input') as HTMLInputElement
    await setValue(input, 'wsjf')
    await act(async () => { form.requestSubmit() })
    await waitFor(() => /inherits a field named “wsjf” from “Scoring”/.test(dialog().textContent ?? ''), 'the refusal')
    expect(document.activeElement).toBe(input)
  })
})

describe('project menu', () => {
  const project = { id: 'p', name: 'Kitchen', color: '#000', position: 0, archived: false, parent_id: null, icon: null, created_at: 0, deleted_at: null, description: '', notes_doc: '', _clock: {} } as Project
  const ids = (role: 'owner' | 'admin' | 'editor' | 'viewer') =>
    projectMenuGroups(project, { role, shared: role !== 'owner', targets: [], subCount: 0, openTasks: 0 }, { rename: () => {}, fields: () => {} })
      .flatMap((g) => g.items.map((i) => i.id))
  it('offers Fields… to editors and above, not to viewers', () => {
    expect(ids('owner')).toContain('fields')
    expect(ids('editor')).toContain('fields')
    expect(ids('viewer')).not.toContain('fields')
  })
})

describe('option renames', () => {
  it('a line changed in place is a rename; added or removed lines are not', () => {
    expect(renamedOptions('Quote\nOrdered\nDone', 'Quote\nOn order\nDone')).toEqual({ Ordered: 'On order' })
    expect(renamedOptions('Quote\nOrdered', 'Quote\nOrdered\nDone')).toEqual({})
    expect(renamedOptions('A\nB', 'B\nA')).toEqual({})
  })
})
