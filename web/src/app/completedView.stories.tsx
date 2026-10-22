import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { createTask, updateTask } from '../lib/ops'
import { TaskListView } from './TaskListView'
import { seedBase, seeded, storyUser, withSeed } from './stories/fixtures'

// Core screen: Completed (`/completed`), the logbook by day (OpenSpec change
// ux-audit-three-widths task 5.3; weekly in the inventory).
const meta: Meta = { title: 'Screens/Completed' }
export default meta

function Column({ children }: { children: ReactNode }) {
  return <div className="-m-4 h-[48rem] overflow-y-auto bg-canvas">{children}</div>
}

/** Two days of completed tasks, newest first. */
export const TwoDays: StoryObj = {
  ...withSeed(async () => {
    await seedBase()
    const at = (iso: string) => Date.parse(iso)
    for (const [title, when, project] of [
      ['Send the invoice to Northwind', '2026-10-14T09:20:00', seeded.work],
      ['Book the dentist', '2026-10-14T11:05:00', seeded.health],
      ['Water the plants', '2026-10-13T18:40:00', seeded.home],
      ['Write the release notes', '2026-10-13T16:10:00', seeded.website],
    ] as const) {
      const id = await createTask({ title, project_id: project })
      await updateTask(id, { completed_at: at(when) })
    }
  }),
  render: () => <Column><TaskListView route={{ view: 'completed' }} userId={storyUser.id} userRole={storyUser.role} /></Column>,
}
