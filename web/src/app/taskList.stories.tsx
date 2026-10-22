import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { createTask } from '../lib/ops'
import { seedBase, seeded, seedProjectWithSections, seedToday, storyUser, TODAY, withSeed } from './stories/fixtures'
import { TaskListView } from './TaskListView'

// Core screen: the grouped list (OpenSpec change ux-overhaul, task 8.7;
// task-list-presentation "Grouped lists", "Nothing between the header and the
// list", "Empty views"). The real list view over
// a seeded database with a frozen clock: Today with its Earlier and Today groups,
// Upcoming grouped by day, a project grouped by section, and an empty Today. Earlier
// (page-rhythm D5) open with three tasks and folded with eight, with its two actions.
const meta: Meta = { title: 'Screens/Task list' }
export default meta

/** The shell's content column: the header stays while the list scrolls. */
function Column({ children }: { children: ReactNode }) {
  return <div className="-m-4 h-[44rem] overflow-y-auto bg-canvas">{children}</div>
}

/** Today: two tasks from earlier days under Earlier, the day's tasks under Today, the evening task last. */
export const TodayGrouped: StoryObj = {
  ...withSeed(seedToday),
  render: () => <Column><TaskListView route={{ view: 'today' }} userId={storyUser.id} userRole={storyUser.role} /></Column>,
}

/** Earlier tasks planned for the last days of the week before today. */
async function seedEarlier(n: number): Promise<void> {
  await seedBase()
  const titles = ['Send the invoice to Northwind', 'Book the dentist', 'Reply to the landlord', 'Return the library books', 'Fix the bike light', 'Order printer ink', 'Call the plumber', 'Update the budget sheet']
  for (let i = 0; i < n; i++) await createTask({ title: titles[i % titles.length], due: { date: `2026-10-${String(13 - (i % 5)).padStart(2, '0')}` }, project_id: i % 2 ? seeded.home : seeded.work })
  await createTask({ title: 'Write the release notes', due: { date: TODAY, time: '09:30' }, project_id: seeded.website })
  await createTask({ title: 'Water the plants', due: { date: TODAY }, project_id: seeded.home })
}

/** Earlier open (page-rhythm D5): three tasks, their dates in red, the label quiet, both actions visible. */
export const TodayEarlierOpen: StoryObj = {
  ...withSeed(() => seedEarlier(3)),
  render: () => <Column><TaskListView route={{ view: 'today' }} userId={storyUser.id} userRole={storyUser.role} /></Column>,
}

/** Earlier folded by default above five tasks: its label, "8" and both actions, no rows. */
export const TodayEarlierCollapsed: StoryObj = {
  ...withSeed(() => seedEarlier(8)),
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

/** Nothing due today: one sentence, Add a task and the Open Upcoming link. */
export const Empty: StoryObj = {
  ...withSeed(async () => {}),
  render: () => <Column><TaskListView route={{ view: 'today' }} userId={storyUser.id} userRole={storyUser.role} /></Column>,
}
