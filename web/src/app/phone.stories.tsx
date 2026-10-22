import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { HEX, project, task, withClock } from './stories/fixtures'
import { TaskRow } from './TaskRow'

// The phone (OpenSpec change phone-v2): swipe actions on rows, the task sheet and the
// drawer, at 375 px in both themes. The gate cannot swipe, so the rows are held at a
// fixed offset through a story-only override.
const meta: Meta = { title: 'Screens/Phone', decorators: [withClock] }
export default meta

const noop = () => {}
const home = project({ id: 'p-home', name: 'Home', color: HEX.green })
const base = { selected: false, showProject: false, onToggle: noop, onOpen: noop, swipe: true }

function List({ children }: { children: ReactNode }) {
  return <ul className="space-y-0.5 rounded-card border border-default bg-surface p-2 shadow-1">{children}</ul>
}

/** Mid-swipe (design D3): right uncovers the complete edge past the reveal, left the schedule edge. */
export const RowMidSwipe: StoryObj = {
  name: 'Row mid-swipe',
  render: () => (
    <List>
      <TaskRow {...base} task={task({ id: 's1', title: 'Water the plants' })} forceSwipe={84} />
      <TaskRow {...base} task={task({ id: 's2', title: 'Call the bank about the card limit', priority: 1 })} />
      <TaskRow {...base} task={task({ id: 's3', title: 'Book the dentist', project_id: home.id })} project={home} showProject forceSwipe={-84} />
      <TaskRow {...base} task={task({ id: 's4', title: 'Read the sync protocol draft', priority: 3 })} forceSwipe={40} />
    </List>
  ),
}
