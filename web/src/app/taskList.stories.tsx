import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { createTask } from '../lib/ops'
import { seedBase, seeded, seedProjectWithSections, seedToday, storyUser, TODAY, withSeed } from './stories/fixtures'
import { db } from '../lib/db'
import { setTaskOpen } from '../lib/userPrefs'
import { PANEL_WIDTH_KEY, SIDE_PANEL_CLOSED_KEY } from './panel'
import { PanelHost } from './PanelHost'
import { selectTask } from './signals'
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

/** An Inbox with two undecided tasks and three planned ones without a project (inbox-planned-group). */
async function seedInboxPlanned(open: boolean): Promise<void> {
  await seedBase()
  try { localStorage.setItem('opentodo.collapsed', JSON.stringify(open ? ['inbox:planned:open'] : [])) } catch { /* stories only */ }
  await createTask({ title: 'Look into a new phone plan' })
  await createTask({ title: 'Idea: a shared shopping list' })
  await createTask({ title: 'Renew the passport', due: { date: '2026-10-16' } })
  await createTask({ title: 'Pick up the parcel', due: { date: '2026-10-15' } })
  await createTask({ title: 'Learn to make bread', start: 'someday' })
}

/** The Inbox's planned tasks folded at the end: the group's label and "3", no rows (inbox-planned-group D1). */
export const InboxPlannedFolded: StoryObj = {
  ...withSeed(() => seedInboxPlanned(false)),
  render: () => <Column><TaskListView route={{ view: 'inbox' }} userId={storyUser.id} userRole={storyUser.role} /></Column>,
}

/** Opened: the three planned tasks in place, by date, Someday last, with Open as filter in the header. */
export const InboxPlannedOpen: StoryObj = {
  ...withSeed(() => seedInboxPlanned(true)),
  render: () => <Column><TaskListView route={{ view: 'inbox' }} userId={storyUser.id} userRole={storyUser.role} /></Column>,
}

/** Nothing due today: one sentence, Add a task and the Open Upcoming link. */
export const Empty: StoryObj = {
  ...withSeed(async () => {}),
  render: () => <Column><TaskListView route={{ view: 'today' }} userId={storyUser.id} userRole={storyUser.role} /></Column>,
}

/** The shell's content column with the panel slot beside it, for the Inbox's split (inbox-split). */
function Split({ children }: { children: ReactNode }) {
  return (
    <div className="-m-4 flex h-[44rem] bg-canvas">
      <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
      <PanelHost user={storyUser} />
    </div>
  )
}

const HOUR = 3_600_000

/** Four Inbox tasks from four sources (inbox-split D4): a page, this app, a calendar app and the API. */
async function seedInboxSources(select: boolean): Promise<void> {
  await seedBase()
  const now = Date.now()
  const desk = await createTask({ title: 'Look into a standing desk for the study', origin: { kind: 'url', url: 'https://www.example.org/desks', title: 'Standing desks' } })
  const dentist = await createTask({ title: 'Book the dentist for a check-up' })
  const birthday = await createTask({ title: "Ideas for Mia's birthday" })
  const attic = await createTask({ title: 'Re: offer for the attic insulation', origin: { kind: 'email', id: '<offer@example.org>' } })
  // Stories only: the creation times and creating devices other writers would have left.
  const stamp = async (id: string, ago: number, device?: string) => {
    const row = (await db.tasks.get(id))!
    await db.tasks.update(id, { created_at: now - ago, _clock: device ? { ...row._clock, created_at: { ts: now - ago, device } } : row._clock })
  }
  await stamp(desk, 2 * HOUR)
  await stamp(dentist, 5 * HOUR)
  await stamp(birthday, 26 * HOUR, 'caldav:ada-phone')
  await stamp(attic, 30 * HOUR, 'server')
  if (select) selectTask.set(dentist)
}

/** The Inbox from 1024 px with nothing selected: the source lines, Process as the primary action, "No task selected" (inbox-split D1 to D4). */
export const InboxSplitEmpty: StoryObj = {
  ...withSeed(() => seedInboxSources(false)),
  render: () => <Split><TaskListView route={{ view: 'inbox' }} userId={storyUser.id} userRole={storyUser.role} /></Split>,
}

/** The Inbox with a task selected: it shows beside the list, as the docked task (inbox-split D1). */
export const InboxSplitSelected: StoryObj = {
  ...withSeed(() => seedInboxSources(true)),
  render: () => <Split><TaskListView route={{ view: 'inbox' }} userId={storyUser.id} userRole={storyUser.role} /></Split>,
}

/** "Open tasks: In a side panel" (task-side-panel D1, D4): the account's choice, and the panel open on this device. */
async function seedSidePanel(seed: () => Promise<void>, select: string | null): Promise<void> {
  await seed()
  try { localStorage.removeItem(SIDE_PANEL_CLOSED_KEY); localStorage.removeItem(PANEL_WIDTH_KEY) } catch { /* stories only */ }
  await setTaskOpen('panel')
  if (select) {
    const task = (await db.tasks.toArray()).find((tk) => tk.title === select)
    if (task) selectTask.set(task.id)
  }
}

/** Today with the side panel and nothing selected: "No task selected" with its Close (task-side-panel D8). */
export const TodaySidePanelEmpty: StoryObj = {
  ...withSeed(() => seedSidePanel(seedToday, null)),
  render: () => <Split><TaskListView route={{ view: 'today' }} userId={storyUser.id} userRole={storyUser.role} /></Split>,
}

/** A project with the side panel: the selected task beside the list, the rows dropping cells as the list narrows (task-side-panel D2). */
export const ProjectSidePanelSelected: StoryObj = {
  ...withSeed(() => seedSidePanel(() => seedProjectWithSections(false), 'Review the homepage copy')),
  render: () => <Split><TaskListView route={{ view: 'project', id: seeded.website }} userId={storyUser.id} userRole={storyUser.role} /></Split>,
}
