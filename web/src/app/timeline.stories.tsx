import type { Meta, StoryObj } from '@storybook/react-vite'
import { seeded, seedProjectTimeline, storyUser, withSeed } from './stories/fixtures'
import { TaskListView } from './TaskListView'

// Core screen: a project's timeline (project-timeline "Timeline bars", OpenSpec
// changes surfaces-v2 task 3.2 and precision-boards-timeline). The frozen Wednesday
// 14 October: bars filled in the project's hue and titled when they are long enough,
// the part of a bar before today dimmed, an overdue bar and a bar past its deadline in
// the overdue tone with "n days late", a deadline diamond, a short bar followed by its
// length, a bar that only started in the past dimmed whole, and the accent today line.
const meta: Meta = { title: 'Screens/Timeline' }
export default meta

/** A bar across today, late bars, a short bar, one that only started and an unscheduled task. */
export const AcrossTodayAndLate: StoryObj = {
  ...withSeed(seedProjectTimeline),
  render: () => (
    <div className="-m-4 h-[40rem] overflow-y-auto bg-canvas">
      <TaskListView route={{ view: 'project', id: seeded.website }} userId={storyUser.id} userRole={storyUser.role} />
    </div>
  ),
}
