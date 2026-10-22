import type { Meta, StoryObj } from '@storybook/react-vite'
import { seeded, seedProjectTimeline, storyUser, withSeed } from './stories/fixtures'
import { TaskListView } from './TaskListView'

// Core screen: a project's timeline (project-timeline "Timeline bars", OpenSpec
// change surfaces-v2 task 3.2). The frozen Wednesday 14 October: bars filled in the
// project's hue, the part of a bar before today dimmed, a bar that ended dimmed
// whole, and a bar past its deadline with the danger edge.
const meta: Meta = { title: 'Screens/Timeline' }
export default meta

/** A bar across today, one that ended, one past its deadline and an unscheduled task. */
export const AcrossTodayAndLate: StoryObj = {
  ...withSeed(seedProjectTimeline),
  render: () => (
    <div className="-m-4 h-[40rem] overflow-y-auto bg-canvas">
      <TaskListView route={{ view: 'project', id: seeded.website }} userId={storyUser.id} userRole={storyUser.role} />
    </div>
  ),
}
