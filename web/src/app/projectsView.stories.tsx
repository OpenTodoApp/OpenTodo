import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useRef, useState } from 'react'
import { db } from '../lib/db'
import { archiveProject, createProject, createTask } from '../lib/ops'
import type { ArchivedProject } from '../lib/archive'
import type { Project } from '../lib/types'
import { ArchivedProjectsList } from './ArchivedProjects'
import { ProjectsView } from './ProjectsView'
import { FROZEN_ISO, HEX, seedBase, seeded, TODAY, withClock, withSeed } from './stories/fixtures'

// The All projects page (OpenSpec changes sidebar-favourites, design D6, and
// projects-table): the tree as a table with health, progress, open tasks, next due,
// people and the last change, the find field, and the archived projects in a tab.
const meta: Meta = { title: 'Screens/All projects' }
export default meta

/** One project in each health state, a sub-project, and two archived projects. */
async function seedProjects() {
  await seedBase()
  // Work: on track, one of three done. Website launch under it: slipping.
  await createTask({ title: 'Draft the Q4 plan', project_id: seeded.work, due: { date: '2026-10-16' } })
  await createTask({ title: 'Book the offsite', project_id: seeded.work })
  const done = await createTask({ title: 'Send the budget', project_id: seeded.work })
  await db.tasks.update(done, { completed_at: new Date(FROZEN_ISO).getTime() - 3_600_000 })
  await createTask({ title: 'Fix the pricing page', project_id: seeded.website, due: { date: '2026-10-12' } })
  await createTask({ title: 'Write the launch post', project_id: seeded.website, due: { date: TODAY } })
  // Home: late, the passport's deadline has passed.
  await createTask({ title: 'Renew the passport', project_id: seeded.home, deadline: '2026-10-10' })
  await createTask({ title: 'Paint the hallway', project_id: seeded.home })
  // Reading: quiet, nothing changed for nine days.
  const reading = await createProject({ name: 'Reading', color: HEX.teal })
  const novel = await createTask({ title: 'Finish the novel', project_id: reading })
  const old = new Date(FROZEN_ISO).getTime() - 9 * 86_400_000
  await db.tasks.update(novel, { _clock: { title: { ts: old, device: 'story' } } })
  await db.projects.update(reading, { _clock: { name: { ts: old, device: 'story' } } })
  // Health (from seedBase) has nothing open; Garden and Trip 2026 are archived.
  const garden = await createProject({ name: 'Garden', color: HEX.green, parent_id: seeded.home })
  await createTask({ title: 'Prune the roses', project_id: garden })
  await archiveProject(garden)
  await archiveProject(await createProject({ name: 'Trip 2026', color: HEX.blue }))
}

/** Late, Overdue, Quiet, On track and Nothing open, with the note under the table; at 375 px the columns at the end give way. */
export const Default: StoryObj = { ...withSeed(seedProjects), render: () => <ProjectsView /> }

/** A narrow table taps the health word (briefing-links D5): Home's "Late" shows its reason, the passport, under the word. */
function NarrowWhy() {
  const frame = useRef<HTMLDivElement>(null)
  const [pending, setPending] = useState(true)
  useEffect(() => {
    let tries = 0
    const timer = setInterval(() => {
      const why = frame.current?.querySelector<HTMLElement>(`[data-projects-row="${seeded.home}"] [data-health-why]`)
      if (why || ++tries > 100) {
        clearInterval(timer)
        why?.click()
        requestAnimationFrame(() => setPending(false))
      }
    }, 20)
    return () => clearInterval(timer)
  }, [])
  // data-story-pending: the visual check waits until the reason shows.
  return <div ref={frame} className="w-[22rem]" data-story-pending={pending || undefined}><ProjectsView /></div>
}
export const NarrowHealthReason: StoryObj = { ...withSeed(seedProjects), render: () => <NarrowWhy /> }

/** Opened from Settings → Data (`/projects#archived`): the Archived tab is selected. */
export const ArchivedOpen: StoryObj = { ...withSeed(seedProjects), render: () => <ProjectsView archived /> }

const project = (id: string, name: string, color: string) => ({ id, name, color, archived: true } as Project)
const rows: ArchivedProject[] = [
  { project: project('a', 'Garden', '#22c55e'), parentName: 'Home', open: 2, canRestore: true },
  { project: project('b', 'Trip 2026 with a rather long name that wraps on phones', '#3b82f6'), parentName: null, open: 1, canRestore: true },
  { project: project('c', 'Shared launch', '#8b5cf6'), parentName: null, open: 0, canRestore: false },
] as never

/** The archived list on its own: parent, open tasks, and a restore the user may not make. */
export const ArchivedList: StoryObj = { decorators: [withClock], render: () => <div className="max-w-xl p-4"><ArchivedProjectsList rows={rows} onRestore={() => {}} bare /></div> }

/** Nothing archived: the list says so. */
export const ArchivedEmpty: StoryObj = { decorators: [withClock], render: () => <div className="max-w-xl p-4"><ArchivedProjectsList rows={[]} onRestore={() => {}} bare /></div> }
