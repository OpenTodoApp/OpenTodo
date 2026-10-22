import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { createTask, deleteTask } from '../lib/ops'
import { TrashView } from './TrashView'
import { seedBase, seeded, withSeed } from './stories/fixtures'

// Core screen: Trash (`/trash`), deleted tasks to restore (OpenSpec change
// ux-audit-three-widths task 5.3; weekly in the inventory).
const meta: Meta = { title: 'Screens/Trash' }
export default meta

function Column({ children }: { children: ReactNode }) {
  return <div className="-m-4 h-[48rem] overflow-y-auto bg-canvas">{children}</div>
}

/** Three deleted tasks, one with a long title. */
export const Items: StoryObj = {
  ...withSeed(async () => {
    await seedBase()
    for (const [title, project] of [
      ['Old shopping list', null],
      ['Draft the newsletter for the community garden about the autumn planting day', seeded.home],
      ['Cancel the gym trial', seeded.health],
    ] as const) await deleteTask(await createTask({ title, project_id: project }))
  }),
  render: () => <Column><TrashView /></Column>,
}

/** An empty Trash. */
export const Empty: StoryObj = {
  ...withSeed(seedBase),
  render: () => <Column><TrashView /></Column>,
}
