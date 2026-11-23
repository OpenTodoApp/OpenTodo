import { beforeEach, describe, expect, it } from 'vitest'
import { db, setMeta, useDatabase } from './db'
import { createProject, createTask, createTasks, resetDeviceId, updateProject } from './ops'
import { reuseMatchFor } from './reuseAdd'
import { parse } from './nlp/parse'
import { editPlan, parseEdit } from './nlp/edit'
import { toTaskInput } from './nlp/quickadd'
import { titleEditUndoable } from './undoActions'
import { undoBatch } from './undo'

// Links typed in quick add or a title become link attachments (OpenSpec change quick-add-links, D2, D3, D5).
let n = 0
beforeEach(async () => {
  useDatabase(`qal-${Date.now()}-${n++}`)
  resetDeviceId()
  await setMeta('userId', 'u1')
})

const ctx = { today: '2026-10-09', now: '10:00', languages: ['en'], projects: [], links: true }

async function input(line: string) {
  return toTaskInput(parse(line, ctx), { labels: [], createLabel: async () => 'l' })
}
const linksOf = async (id: string) => (await db.attachments.where('task_id').equals(id).toArray()).map((a) => ({ url: a.url, name: a.name, size: a.size, author: a.author_id }))

describe('links in quick add', () => {
  it('a link becomes a link attachment in the task batch', async () => {
    const id = await createTask(await input('Review the mockup https://www.example.com/mockup tomorrow'))
    const task = (await db.tasks.get(id))!
    expect(task.title).toBe('Review the mockup')
    expect(task.due).toEqual({ date: '2026-10-10' })
    expect(await linksOf(id)).toEqual([{ url: 'https://www.example.com/mockup', name: 'www.example.com', size: 0, author: 'u1' }])
    // Queued for sync with the task, written locally first (offline).
    const outbox = await db.outbox.toArray()
    expect(outbox.some((o) => o.entity === 'attachment' && o.field === 'url' && o.value === 'https://www.example.com/mockup')).toBe(true)
  })

  it('attaches a link once, and not the origin again', async () => {
    const line = await input('Read https://example.com/a https://example.com/a https://example.com/b')
    const id = await createTask({ ...line, origin: { kind: 'url', url: 'https://example.com/b' } })
    expect((await linksOf(id)).map((l) => l.url)).toEqual(['https://example.com/a'])
  })

  it('each line of a paste keeps its own links', async () => {
    const [a, b] = await createTasks([await input('Milk https://shop.example/milk'), await input('Eggs')])
    expect((await linksOf(a)).map((l) => l.url)).toEqual(['https://shop.example/milk'])
    expect(await linksOf(b)).toEqual([])
  })
})

describe('links: order, no author, reusable lists', () => {
  it('lists the links in the order typed', async () => {
    const id = await createTask(await input('Compare https://b.example https://a.example https://c.example'))
    const rows = await db.attachments.where('task_id').equals(id).toArray()
    expect(rows.sort((x, y) => x.created_at - y.created_at).map((a) => a.url)).toEqual(['https://b.example/', 'https://a.example/', 'https://c.example/'])
  })

  it('never reuses an item of a reusable list for a line with a link', async () => {
    const list = await createProject({ name: 'Groceries' })
    await updateProject(list, { reusable: true })
    await createTask({ title: 'Milk', project_id: list })
    expect(await reuseMatchFor({ title: 'Milk', project_id: list })).not.toBeNull()
    expect(await reuseMatchFor({ title: 'Milk', project_id: list, links: ['https://shop.example/milk'] })).toBeNull()
  })
})

describe('links typed while editing a title (quick-add-links D5)', () => {
  it('does not attach a link the task already has, in any spelling', async () => {
    const id = await createTask({ ...(await input('Spec https://example.com/spec')) })
    const plan = editPlan({ title: 'Spec', project_id: null }, parseEdit('Spec', 'Spec https://Example.com:443/spec', ctx))
    await titleEditUndoable(id, plan.patch, plan.reminders, plan.links)
    expect((await linksOf(id)).map((l) => l.url)).toEqual(['https://example.com/spec'])
  })

  it('attaches the link in the same undoable change, and Undo removes both', async () => {
    const id = await createTask({ title: 'Call the bank' })
    const plan = editPlan({ title: 'Call the bank', project_id: null }, parseEdit('Call the bank', 'Call the bank https://bank.example/contact', ctx))
    expect(plan.patch).toEqual({})
    const r = await titleEditUndoable(id, plan.patch, plan.reminders, plan.links)
    expect((await linksOf(id)).map((l) => l.url)).toEqual(['https://bank.example/contact'])
    await undoBatch(r.entry!.id)
    const left = await db.attachments.where('task_id').equals(id).toArray()
    expect(left.every((a) => a.deleted_at)).toBe(true)
  })

  it('leaves a link that was already in the title', () => {
    const plan = editPlan({ title: 'Read https://example.com/post', project_id: null }, parseEdit('Read https://example.com/post', 'Read https://example.com/post today', ctx))
    expect(plan.links).toBeUndefined()
    expect(plan.patch).toEqual({ due: { date: '2026-10-09' } })
  })
})
