import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { seeded, seedProjectWithSections, seedToday, storyUser, withSeed } from './stories/fixtures'
import { TaskListView } from './TaskListView'

// Core screen: the grouped list (OpenSpec change ux-overhaul, task 8.7;
// task-list-presentation "Grouped lists", "Nothing between the header and the
// list"; first-run "Empty states name the action first"). The real list view over
// a seeded database with a frozen clock: Today with its Overdue and Today groups,
// Upcoming grouped by day, a project grouped by section, and an empty Today.
const meta: Meta = { title: 'Screens/Task list' }
export default meta

/** The shell's content column: the header stays while the list scrolls. */
function Column({ children }: { children: ReactNode }) {
  return <div className="-m-4 h-[44rem] overflow-y-auto bg-canvas">{children}</div>
}

/** Today: two overdue tasks under Overdue, the day's tasks under Today, the evening task last. */
export const TodayGrouped: StoryObj = {
  ...withSeed(seedToday),
  render: () => <Column><TaskListView route={{ view: 'today' }} userId={storyUser.id} userRole={storyUser.role} /></Column>,
}

/** Upcoming: the coming days as groups, each with its date heading. */
export const UpcomingByDay: StoryObj = {
  ...withSeed(seedToday),
  render: () => <Column><TaskListView route={{ view: 'upcoming' }} userId={storyUser.id} userRole={storyUser.role} /></Column>,
}

/** A project in list layout: its sections as collapsible groups, a subtask tree inside one. */
export const ProjectBySection: StoryObj = {
  ...withSeed(() => seedProjectWithSections(false)),
  render: () => <Column><TaskListView route={{ view: 'project', id: seeded.website }} userId={storyUser.id} userRole={storyUser.role} /></Column>,
}

/** Nothing due today: the empty state names the action first. */
export const Empty: StoryObj = {
  ...withSeed(async () => {}),
  render: () => <Column><TaskListView route={{ view: 'today' }} userId={storyUser.id} userRole={storyUser.role} /></Column>,
}
