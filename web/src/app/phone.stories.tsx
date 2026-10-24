import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { HEX, project, seeded, seedInbox, seedToday, storyUser, task, withClock, withSeed } from './stories/fixtures'
import { navigate } from './router'
import { Shell } from './Shell'
import { Sidebar } from './Sidebar'
import { setMethodMode } from '../lib/method/mode'
import { openTask } from './signals'
import { TaskRow } from './TaskRow'

// The phone (OpenSpec changes phone-v2, precision-phone): Today, swipe actions on rows,
// the task page and the drawer, at 375 px in both themes. The gate cannot swipe, so the rows are held at a
// fixed offset through a story-only override.
const meta: Meta = { title: 'Screens/Phone' }
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
  decorators: [withClock],
  render: () => (
    <List>
      <TaskRow {...base} task={task({ id: 's1', title: 'Water the plants' })} forceSwipe={84} />
      <TaskRow {...base} task={task({ id: 's2', title: 'Call the bank about the card limit', priority: 1 })} />
      <TaskRow {...base} task={task({ id: 's3', title: 'Book the dentist', project_id: home.id })} project={home} showProject forceSwipe={-84} />
      <TaskRow {...base} task={task({ id: 's4', title: 'Read the sync protocol draft', priority: 3 })} forceSwipe={40} />
    </List>
  ),
}

/** The viewport the shell fills: the theme frame's padding is undone so the page reaches the edges. */
function Viewport({ children }: { children: ReactNode }) {
  return <div className="-m-4 h-[49rem] overflow-hidden bg-canvas">{children}</div>
}

/**
 * Today on a phone (precision-phone): a bar with the menu and the actions only, the day
 * head in the page (the title, the date and the briefing), one-line 44 px rows that
 * keep one cell, and the tab bar with Inbox, Today, Upcoming and Search.
 */
export const Today: StoryObj = {
  name: 'Today',
  ...withSeed(async () => {
    await seedToday()
    navigate({ view: 'today' })
  }),
  render: () => <Viewport><Shell user={storyUser} onLogout={noop} /></Viewport>,
}

/** A task opened on a phone (task-full-page, precision-phone D4): its page, with Back and the next and previous task in the bar, and the facts as one stacked card. */
export const TaskPage: StoryObj = {
  name: 'Task page',
  ...withSeed(async () => {
    await seedInbox()
    openTask.set(seeded.inboxTask)
  }),
  render: () => <Viewport><Shell user={storyUser} onLogout={noop} /></Viewport>,
}

/** The drawer as the bar's menu button opens it (design D7, precision-phone D3): a 20 rem column of 48 px rows, the footer pinned. */
function Drawer() {
  return (
    <div className="-m-4 flex h-[49rem] bg-canvas">
      <aside className="flex w-80 max-w-[85vw] border-r border-default bg-surface [--sidebar-bg:var(--color-surface)] [&_[data-sidebar-item]]:min-h-12">
        <div className="min-w-0 flex-1"><Sidebar route={{ view: 'inbox' }} user={storyUser} onSignOut={noop} /></div>
      </aside>
    </div>
  )
}

/** Companion (or Lists): Calendar first, since the tab bar holds Today, Inbox and Upcoming. */
export const DrawerCompanion: StoryObj = {
  name: 'Drawer (Companion)',
  ...withSeed(async () => { await seedInbox(); await setMethodMode('companion') }),
  render: () => <Drawer />,
}

/** Open Loops first: Loop home, Next, Waiting and Review. */
export const DrawerOpenLoopsFirst: StoryObj = {
  name: 'Drawer (Open Loops first)',
  ...withSeed(async () => { await seedInbox(); await setMethodMode('first') }),
  render: () => <Drawer />,
}
