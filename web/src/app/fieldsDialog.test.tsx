// @vitest-environment happy-dom
// The Fields dialog (OpenSpec custom-fields, "Managing definitions"): add,
// duplicate names refused with focus kept, viewers not offered the dialog, the
// delete confirmation states how many tasks hold a value, keyboard reorder, axe.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { liveFields, setFieldValue } from '../lib/fields'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import type { Project } from '../lib/types'
import { click, flush, key, render } from '../ui/test-utils'
import { FieldsDialog, renamedOptions, valuesText } from './FieldsDialog'
import { projectMenuGroups } from './ProjectHeader'

let n = 0
beforeEach(() => {
  useDatabase(`fieldsdialog-${Date.now()}-${n++}`)
  resetDeviceId()
  document.body.innerHTML = ''
})

const settle = () => flush(40)
async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
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
  await settle()
  const dialog = () => document.querySelector('[data-testid="fields-dialog"]') as HTMLElement
  const form = () => dialog().querySelector('form[aria-label="Add a field"]') as HTMLFormElement
  const nameInput = () => form().querySelector('input') as HTMLInputElement
  const add = async (name: string, type = 'text', options?: string) => {
    await setValue(nameInput(), name)
    await setValue(form().querySelector('select')!, type)
    await settle()
    if (options !== undefined) await setValue(form().querySelector('textarea')!, options)
    await act(async () => { form().requestSubmit() })
    await settle()
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
    await settle()
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
    await settle()
    await click(dialog().querySelector('button[aria-label="Delete Cost"]')!)
    await settle()
    const confirm = document.querySelector('[data-testid="confirm-dialog"]') as HTMLElement
    expect(confirm.textContent).toContain('Values on 2 tasks are kept but hidden.')
    await click([...confirm.querySelectorAll('button')].find((b) => b.textContent?.includes('Delete field'))!)
    await settle()
    expect(liveFields(pid, await db.fields.toArray())).toHaveLength(0)
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
