// @vitest-environment happy-dom
// Taking turns in the task panel (OpenSpec change chore-rotation, tasks 5.1, 5.2):
// "Take turns…" in the Assignee editor of a recurring task in a shared project,
// the rotation editor (people picker, Add everyone in <group>, Alt+Up/Down,
// Stop taking turns), the "Takes turns" line, and nothing for personal projects,
// non-recurring tasks and viewers.
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { db } from '../../lib/db'
import { createProject, createTask, updateTask } from '../../lib/ops'
import { click, key, render } from '../../ui/test-utils'
import { AssigneeChip } from '../AssigneePicker'
import { ME, membership, open, setupTaskDetailTests, waitFor } from './taskDetail.testkit'

setupTaskDetailTests()

async function household() {
  const p = await createProject({ name: 'House' })
  await membership(p, ME, 'u-bob', 'u-carol')
  const id = await createTask({ title: 'Bins', project_id: p, recurrence: 'every monday', due: { date: '2026-10-19' } })
  await updateTask(id, { assignee_id: ME })
  return { p, id }
}

const takeTurns = () => document.querySelector<HTMLButtonElement>('[data-take-turns]')
const handle = (id: string) => document.querySelector<HTMLButtonElement>(`[data-rotation-row="${id}"] [data-rotation-handle]`)

describe('take turns', () => {
  it('fills the rotation from the picker and a group, reorders with Alt+Up and stops', async () => {
    const { p, id } = await household()
    // Bob and Carol share the project through the group Adults.
    const m = (await db.memberships.get(p))!
    m.members = m.members.map((x) => (x.userId === ME ? x : { ...x, via: [{ id: 'g-adults' }] }))
    await db.memberships.put(m)
    await db.groups.put({ id: 'g-adults', workspaceId: 'w', name: 'Adults', members: ['u-bob', 'u-carol', 'u-elsewhere'] })
    const v = await open(id)
    await click(v.valueButton('assignee'))
    await waitFor(() => !!takeTurns(), 'Take turns…')
    await click(takeTurns()!)
    await waitFor(() => !!document.querySelector('[data-rotation-editor]'), 'the rotation editor')

    await v.pick('assignee', 'You')
    await waitFor(async () => (await db.tasks.get(id))!.rotation?.length === 1, 'me added')
    await waitFor(() => !!document.querySelector('[data-rotation-group="g-adults"]'), 'the group button')
    await click(document.querySelector('[data-rotation-group="g-adults"]')!)
    await waitFor(async () => (await db.tasks.get(id))!.rotation?.length === 3, 'the group added')
    expect((await db.tasks.get(id))!.rotation).toEqual([ME, 'u-bob', 'u-carol'])

    // Carol first with Alt+Up twice; each press writes the whole list once.
    await waitFor(() => !!handle('u-carol'), 'Carol in the list')
    await key(handle('u-carol')!, 'ArrowUp', { altKey: true })
    await waitFor(async () => (await db.tasks.get(id))!.rotation?.[1] === 'u-carol', 'Carol moved up')
    await key(handle('u-carol')!, 'ArrowUp', { altKey: true })
    await waitFor(async () => (await db.tasks.get(id))!.rotation?.[0] === 'u-carol', 'Carol first')
    expect((await db.tasks.get(id))!.rotation).toEqual(['u-carol', ME, 'u-bob'])
    const ops = (await db.outbox.toArray()).filter((o) => o.entityId === id && o.field === 'rotation')
    expect(ops.every((o) => Array.isArray(o.value))).toBe(true)

    // The panel line names them in order, the current assignee emphasised.
    const line = () => v.container.querySelector('[data-rotation-line]')
    await waitFor(() => /Takes turns:.*u-carol.*You.*u-bob/.test(line()?.textContent ?? ''), 'the Takes turns line')
    expect(line()!.textContent).toMatch(/Takes turns:.*u-carol.*You.*u-bob/)
    expect(line()!.querySelector('[aria-current="true"]')?.textContent).toBe('You')

    await click(document.querySelector('[data-rotation-stop]')!)
    await waitFor(async () => (await db.tasks.get(id))!.rotation?.length === 0, 'stopped')
    await waitFor(() => !line(), 'the line gone')
    await v.unmount()
  })

  it('is not offered for a personal project, a task that does not repeat, or a viewer', async () => {
    const solo = await createProject({ name: 'Solo' })
    const mine = await createTask({ title: 'Plants', project_id: solo, recurrence: 'every day', due: { date: '2026-10-14' } })
    let v = await open(mine)
    await v.add('Show in Assigned to me')
    await waitFor(() => !!v.editor() || !!v.row('assignee'))
    expect(takeTurns()).toBeNull()
    await v.unmount()

    const { p } = await household()
    const once = await createTask({ title: 'Lamp', project_id: p })
    v = await open(once)
    await click(v.valueButton('assignee'))
    await waitFor(() => v.options('assignee').length > 0, 'the picker')
    expect(takeTurns()).toBeNull()
    await v.unmount()

    // A viewer sees the line, read-only, and no editor.
    const { id } = await household()
    await updateTask(id, { rotation: [ME, 'u-bob', 'u-gone'] })
    v = await open(id, { readOnly: true })
    await waitFor(() => !!v.container.querySelector('[data-rotation-line]'), 'the line')
    const text = v.container.querySelector('[data-rotation-line]')!.textContent
    expect(text).toContain('left the project')
    expect(v.container.querySelector('[data-rotation-line] button')).toBeNull()
    await v.unmount()
  })
})

describe('row glyph', () => {
  it('marks a rotating assignee with an accessible name', async () => {
    const r = await render(<AssigneeChip id="u-bob" name="Bob" turns />)
    expect(r.container.querySelector('[data-turns] > span:last-child')!.textContent).toBe('Bob, takes turns')
    expect(r.container.querySelector('[data-turns] [aria-hidden="true"]')).not.toBeNull()
    await r.unmount()
  })
})
