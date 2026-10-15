import type { Meta, StoryObj } from '@storybook/react-vite'
import { Shell } from './Shell'
import { openTask } from './signals'
import { seedInbox, seeded, storyUser, withSeed } from './stories/fixtures'

// Core screen: the shell (OpenSpec change ux-overhaul, task 8.7; app-shell "Three
// columns, three scrollers", "The panel slot has an address"). The real shell over
// a seeded Inbox: the sidebar, the content column and, when a task is open, the
// panel. Below 768 px the sidebar is a drawer, the page bar carries the title and
// the tab bar the destinations. The clock is frozen and nothing reaches the network.
const meta: Meta = { title: 'Screens/Shell' }
export default meta

const noop = () => {}

/** The viewport the shell fills: the theme frame's padding is undone so the columns reach the edges. */
function Viewport({ children }: { children: React.ReactNode }) {
  return <div className="-m-4 h-[49rem] overflow-hidden bg-canvas">{children}</div>
}

/** The Inbox with eight tasks, one with subtasks and one deferred to Later; no task open. */
export const ListOnly: StoryObj = {
  ...withSeed(seedInbox),
  render: () => <Viewport><Shell user={storyUser} onLogout={noop} /></Viewport>,
}

/** The same Inbox with a task open in the panel: three columns, three scrollers. */
export const ListWithPanel: StoryObj = {
  ...withSeed(async () => {
    await seedInbox()
    // A pending "open this task" request, as a notification click leaves it: the list
    // takes it when it mounts, selects the row and opens the panel (openTaskInList).
    openTask.set(seeded.inboxTask)
  }),
  render: () => <Viewport><Shell user={storyUser} onLogout={noop} /></Viewport>,
}
