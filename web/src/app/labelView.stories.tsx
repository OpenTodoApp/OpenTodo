import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { TaskListView } from './TaskListView'
import { seeded, seedInbox, storyUser, withSeed } from './stories/fixtures'

// Core screen: one label's tasks (`/label/<id>`), OpenSpec change ux-audit-three-widths task 5.1.
const meta: Meta = { title: 'Screens/Label view', ...withSeed(seedInbox) }
export default meta

function Column({ children }: { children: ReactNode }) {
  return <div className="-m-4 h-[48rem] overflow-y-auto bg-canvas">{children}</div>
}

/** The tasks labelled errand, grouped as the list groups them. */
export const Errand: StoryObj = {
  render: () => <Column><TaskListView route={{ view: 'label', id: seeded.errand }} userId={storyUser.id} userRole={storyUser.role} /></Column>,
}
