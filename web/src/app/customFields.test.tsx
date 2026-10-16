// @vitest-environment happy-dom
// Custom fields on screen (OpenSpec change custom-fields, tasks 5.1-5.4, 5.6): the
// Fields dialog, the panel's editors, badges, the columns layout and history labels.
import 'fake-indexeddb/auto'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { setFieldNames } from '../lib/fieldNames'
import { createField, fieldBadges } from '../lib/fields'
import { fieldLabel } from '../lib/history'
import { createProject, createTask, resetDeviceId, updateTask } from '../lib/ops'
import { saveViewMode } from '../lib/sections'
import { click, flush, key, render, type } from '../ui/test-utils'
import { FieldsDialog, optionRenames } from './FieldsDialog'
import { ProjectHeader } from './ProjectHeader'
import { FieldsGroup } from './task-detail/FieldsGroup'
import { TaskListView } from './TaskListView'
import { TaskRow } from './TaskRow'

const original = window.matchMedia
function viewport(width: number) {
  window.matchMedia = ((q: string) => {
    const m = /min-width:\s*(\d+)px/.exec(q)
    const max = /max-width:\s*(\d+)px/.exec(q)
    const matches = m ? width >= Number(m[1]) : max ? width <= Number(max[1]) : false
    return { matches, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }
  }) as typeof window.matchMedia
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  viewport(1280)
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  window.matchMedia = original
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
const button = (root: ParentNode, text: string) => [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)

describe('Fields dialog', () => {
  it('adds a choice field, refuses a duplicate name, and renames an option on the tasks holding it', async () => {
    const p = await createProject({ name: 'Kitchen' })
    await createField(p, { name: 'Cost', type: 'number' })
    const project = (await db.projects.get(p))!
    const r = await render(<FieldsDialog project={project} onClose={() => {}} />)
    await waitFor(() => document.querySelectorAll('[data-field-row]').length === 1)
    const form = document.querySelector('[data-field-add]')!
    await type(form.querySelector<HTMLInputElement>('input')!, 'cost')
    await click(button(form, 'Add field')!)
    await waitFor(() => !!form.querySelector('[role="alert"], [role="status"]'))
    expect(form.textContent).toContain('already has a field named')
    expect(document.activeElement).toBe(form.querySelector('input'))

    await type(form.querySelector<HTMLInputElement>('input')!, 'Status')
    const select = form.querySelector<HTMLSelectElement>('select')!
    select.value = 'choice'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await flush(20)
    const opts = form.querySelector<HTMLTextAreaElement>('textarea')!
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    set.call(opts, 'Quote\nOrdered\nDone'); opts.dispatchEvent(new Event('input', { bubbles: true }))
    await click(button(form, 'Add field')!)
    await waitFor(() => document.querySelectorAll('[data-field-row]').length === 2)
    const status = (await db.fields.toArray()).find((f) => f.name === 'Status')!
    const t = await createTask({ title: 'Oven', project_id: p })
    await updateTask(t, { fields: { [status.id]: 'Ordered' } })
    expect(optionRenames(['Quote', 'Ordered', 'Done'], ['Quote', 'On order', 'Done'])).toEqual({ Ordered: 'On order' })
    const area = document.querySelector<HTMLTextAreaElement>(`[data-field-row="${status.id}"] textarea`)!
    set.call(area, 'Quote\nOn order\nDone'); area.dispatchEvent(new Event('input', { bubbles: true }))
    area.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    await flush(80)
    expect((await db.tasks.get(t))!.fields?.[status.id]).toBe('On order')
    await r.unmount()
  })

  it('is offered to editors, not to viewers', async () => {
    const p = await createProject({ name: 'Shared' })
    const project = (await db.projects.get(p))!
    let r = await render(<ProjectHeader project={project} userId="u1" />)
    await click(r.container.querySelector('button[aria-label="Project menu"]')!)
    await flush(20)
    expect([...document.querySelectorAll('[role="menuitem"]')].some((e) => e.textContent?.includes('Fields…'))).toBe(true)
    await key(document.body, 'Escape')
    await r.unmount()
    document.body.innerHTML = ''
    await db.memberships.put({ projectId: p, role: 'viewer', ownerId: 'x', members: [] })
    r = await render(<ProjectHeader project={project} userId="u1" />)
    await flush(50)
    await click(r.container.querySelector('button[aria-label="Project menu"]')!)
    await flush(20)
    expect([...document.querySelectorAll('[role="menuitem"]')].some((e) => e.textContent?.includes('Fields…'))).toBe(false)
    await r.unmount()
  })
})

describe('panel, badges and columns', () => {
  it('edits a number with Enter, offers a safe link, and shows nothing without fields', async () => {
    const p = await createProject({ name: 'Kitchen' })
    const cost = await createField(p, { name: 'Cost', type: 'number' })
    const quote = await createField(p, { name: 'Quote', type: 'link' })
    const id = await createTask({ title: 'Oven', project_id: p })
    await updateTask(id, { fields: { [quote]: 'https://example.com/quote.pdf' } })
    let task = (await db.tasks.get(id))!
    const r = await render(<FieldsGroup task={task} readOnly={false} />)
    await waitFor(() => !!document.querySelector(`[data-field="${cost}"] input`))
    const input = document.querySelector<HTMLInputElement>(`[data-field="${cost}"] input`)!
    await type(input, '1200')
    await key(input, 'Enter')
    await flush(50)
    task = (await db.tasks.get(id))!
    expect(task.fields?.[cost]).toBe(1200)
    const link = document.querySelector<HTMLAnchorElement>('[data-field-open]')!
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(link.getAttribute('target')).toBe('_blank')
    await r.unmount()
    const bare = await createTask({ title: 'Loose' })
    const none = await render(<FieldsGroup task={(await db.tasks.get(bare))!} readOnly={false} />)
    await flush(50)
    expect(document.querySelector('[data-fields-group]')).toBeNull()
    await none.unmount()
  })

  it('picks a choice with the combobox (Clear listed first), and notes a value that is not a number', async () => {
    const p = await createProject({ name: 'Kitchen' })
    const client = await createField(p, { name: 'Client', type: 'choice', options: 'Acme\nGlobex' })
    const cost = await createField(p, { name: 'Cost', type: 'number' })
    const id = await createTask({ title: 'Oven', project_id: p })
    await updateTask(id, { fields: { [cost]: 'lots' } })
    const r = await render(<FieldsGroup task={(await db.tasks.get(id))!} readOnly={false} />)
    await waitFor(() => !!document.querySelector(`[data-field="${client}"] [role="combobox"]`))
    const note = document.querySelector(`[data-field="${cost}"] [data-field-mismatch]`)!
    expect(note.textContent).toBe('(not a number)')
    expect(document.querySelector(`[data-field="${cost}"] input`)!.getAttribute('aria-describedby')).toContain(note.id)
    const box = document.querySelector<HTMLInputElement>(`[data-field="${client}"] [role="combobox"]`)!
    box.focus()
    box.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    await flush(30)
    await waitFor(() => [...document.querySelectorAll('[role="option"]')].some((o) => o.textContent?.includes('Globex')))
    const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')]
    expect(options[0].textContent).toContain('Clear')
    await click(options.find((o) => o.textContent?.includes('Globex'))!)
    await flush(50)
    expect((await db.tasks.get(id))!.fields?.[client]).toBe('Globex')
    await r.unmount()
  })
  it('shows three badges and "+n" naming the rest, and none after a move to a project without the field', async () => {
    const defs = ['A', 'B', 'C', 'D', 'E'].map((n, i) => ({ id: `f${i}`, name: n, type: 'number' as const, options: '' }))
    const values = Object.fromEntries(defs.map((d, i) => [d.id, i + 1]))
    const b = fieldBadges(defs, values)
    expect(b.shown.map((x) => x.text)).toEqual(['A 1', 'B 2', 'C 3'])
    expect(b.rest).toEqual(['D 4', 'E 5'])
    const task = { id: 't', title: 'Oven', description: '', project_id: 'p', parent_id: null, priority: 4, due: null, labels: [], position: 0, created_at: 0, completed_at: null, deleted_at: null, fields: values, _clock: {} } as never
    const html = renderToStaticMarkup(<ul><TaskRow task={task} fieldDefs={defs as never} selected={false} showProject={false} onToggle={() => {}} onOpen={() => {}} card /></ul>)
    expect(html).toContain('data-field-more')
    expect(html).toContain('2 more: D 4, E 5')
    expect(renderToStaticMarkup(<ul><TaskRow task={task} fieldDefs={[]} selected={false} showProject={false} onToggle={() => {}} onOpen={() => {}} /></ul>)).not.toContain('data-field-badge')
  })

  it('offers columns from 768 px with a header and cells, and badges on a phone', async () => {
    const p = await createProject({ name: 'Kitchen' })
    const cost = await createField(p, { name: 'Cost', type: 'number' })
    await createField(p, { name: 'Status', type: 'choice', options: 'Quote\nDone' })
    const id = await createTask({ title: 'Oven', project_id: p })
    await updateTask(id, { fields: { [cost]: 120 } })
    await saveViewMode(p, 'columns')
    let r = await render(<TaskListView route={{ view: 'project', id: p }} />)
    await waitFor(() => !!document.querySelector('[data-field-header]'))
    expect([...document.querySelectorAll('[data-field-column]')].map((e) => e.textContent)).toEqual(['Cost', 'Status'])
    expect(document.querySelector(`[data-field-cell="${cost}"]`)!.textContent).toBe('Cost: 120')
    expect(document.querySelector('[data-columns-frame]')!.hasAttribute('data-scroll-x')).toBe(true)
    expect(document.querySelector('[role="group"][aria-label="Project layout"]')!.textContent).toContain('Columns')
    await r.unmount()
    document.body.innerHTML = ''
    viewport(390)
    r = await render(<TaskListView route={{ view: 'project', id: p }} />)
    await waitFor(() => !!document.querySelector('[data-field-badge]'))
    expect(document.querySelector('[data-field-header]')).toBeNull()
    expect(document.querySelector('[data-field-badge]')!.textContent).toBe('Cost 120')
    await r.unmount()
  })

  it('names fields in history and activity labels', () => {
    setFieldNames([['abc', 'Cost']])
    expect(fieldLabel('fields.abc')).toBe('Cost')
    expect(fieldLabel('fields.zzz')).toBe('field')
  })
})
