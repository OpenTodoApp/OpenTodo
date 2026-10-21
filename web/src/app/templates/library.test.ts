// Every library template starts (OpenSpec change template-library, "Library validation in
// CI", task 3.2): each compiled template goes through startLibraryTemplate, the dialog's own
// create path, into an empty database on a fixed start day; the projects, sections, tasks,
// labels and every resolved due date are checked, so the format can never drift from the
// code that uses it.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import library from '../../generated/templates.json'
import { db, useDatabase } from '../../lib/db'
import { resetDeviceId } from '../../lib/ops'
import { resolveOffset, startLibraryTemplate, type Library, type LibraryTask } from '../../lib/templateLibrary'

const START = '2026-01-05'
let n = 0
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 0, 5, 9, 0))
  useDatabase(`library-${Date.now()}-${n++}`)
  resetDeviceId()
})

/** Every task of the template, flattened, with its expected due date. */
function expected(tasks: LibraryTask[] | undefined, out: { title: string; due: string | null; time?: string }[] = []) {
  for (const tk of tasks ?? []) {
    out.push({ title: tk.title.en, due: tk.due ? resolveOffset(tk.due, START) : null, time: tk.time })
    expected(tk.subtasks, out)
  }
  return out
}

describe('the template library', () => {
  const templates = (library as Library).templates
  it('ships at least the ten initial templates', () => {
    expect(templates.length).toBeGreaterThanOrEqual(10)
  })

  for (const tpl of templates) {
    it(`starts "${tpl.text.title.en}" on ${START}`, async () => {
      const plan = await startLibraryTemplate(tpl, { lang: 'en', startDay: START })
      const projects = (await db.projects.toArray()).sort((a, b) => a.position - b.position)
      const sections = await db.sections.toArray()
      const tasks = await db.tasks.toArray()
      const labels = await db.labels.toArray()
      expect(projects).toHaveLength(tpl.counts.projects)
      expect(sections).toHaveLength(tpl.counts.sections)
      expect(tasks).toHaveLength(tpl.counts.tasks)
      expect(labels.map((l) => l.name).sort()).toEqual(tpl.labels.map((l) => l.name.en).sort())
      expect(plan.projectIds).toHaveLength(tpl.counts.projects)
      expect(projects[0].icon ?? null).toBe(tpl.projects[0].icon ?? tpl.icon)

      const want = tpl.projects.flatMap((p) => [...expected(p.tasks), ...(p.sections ?? []).flatMap((s) => expected(s.tasks))])
      for (const w of want) {
        const task = tasks.find((x) => x.title === w.title)
        expect(task, w.title).toBeTruthy()
        expect(task!.due?.date ?? null, w.title).toBe(w.due)
        if (w.time) expect(task!.due?.time, w.title).toBe(w.time)
        expect(task!.completed_at).toBeNull()
      }
      // Every task's labels are labels the template created.
      const ids = new Set(labels.map((l) => l.id))
      for (const task of tasks) for (const id of task.labels) expect(ids.has(id)).toBe(true)
    })
  }

  it('Trip planning on 2026-01-05: one project, three sections, eight tasks with two subtasks, two labels', async () => {
    const trip = templates.find((x) => x.slug === 'trip-planning')!
    await startLibraryTemplate(trip, { lang: 'en', startDay: START })
    const tasks = await db.tasks.toArray()
    expect(await db.projects.count()).toBe(1)
    expect(await db.sections.count()).toBe(3)
    expect(tasks.filter((x) => !x.parent_id)).toHaveLength(8)
    expect(tasks.filter((x) => x.parent_id)).toHaveLength(2)
    expect(await db.labels.count()).toBe(2)
    expect(tasks.find((x) => x.title === 'Check passport expiry date')?.due?.date).toBe('2026-01-05')
    for (const title of ['Clothes', 'Toiletries', 'Chargers and adapters']) expect(tasks.find((x) => x.title === title)?.due?.date).toBe('2026-02-02')
  })

  it('starting the same template twice makes two complete projects with different ids', async () => {
    const trip = templates.find((x) => x.slug === 'trip-planning')!
    const a = await startLibraryTemplate(trip, { lang: 'en', startDay: START })
    const b = await startLibraryTemplate(trip, { lang: 'en', startDay: START })
    expect(a.projectIds[0]).not.toBe(b.projectIds[0])
    expect(await db.projects.count()).toBe(2)
    expect(await db.tasks.count()).toBe(2 * trip.counts.tasks)
    expect(await db.labels.count()).toBe(2)
  })
})
