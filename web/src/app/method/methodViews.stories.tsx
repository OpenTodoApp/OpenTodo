import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { createTask, updateTask } from '../../lib/ops'
import { TaskListView } from '../TaskListView'
import { NextView, WaitingView } from './MethodListView'
import { seedInbox, seeded, storyUser, withSeed } from '../stories/fixtures'

// Core screens of the method views over one seed: Next, Waiting, Someday and Anytime
// (OpenSpec change ux-audit-three-widths task 5.4; weekly in the inventory).
async function seedMethod() {
  await seedInbox()
  const quotes = await createTask({ title: 'Get three quotes for the kitchen', project_id: seeded.home, priority: 2 })
  const fitters = await createTask({ title: 'Book the kitchen fitters', project_id: seeded.home })
  await updateTask(fitters, { blocked_by: [quotes] })
  await createTask({ title: 'Learn the cello', start: 'someday' })
  await createTask({ title: 'Repaint the garden shed', project_id: seeded.home, start: 'someday' })
  await createTask({ title: 'Sort the photo archive', project_id: seeded.home })
}

const meta: Meta = { title: 'Screens/Method views', ...withSeed(seedMethod) }
export default meta

function Column({ children }: { children: ReactNode }) {
  return <div className="-m-4 h-[48rem] overflow-y-auto bg-canvas">{children}</div>
}

const list = (view: 'someday' | 'anytime') => () => <Column><TaskListView route={{ view }} userId={storyUser.id} userRole={storyUser.role} /></Column>

/** Next: the next actions by project. */
export const Next: StoryObj = { render: () => <Column><NextView /></Column> }
/** Waiting: what someone else holds, then what another task blocks. */
export const Waiting: StoryObj = { render: () => <Column><WaitingView /></Column> }
/** Someday: parked tasks. */
export const Someday: StoryObj = { render: list('someday') }
/** Anytime: undated tasks ready to do. */
export const Anytime: StoryObj = { render: list('anytime') }
