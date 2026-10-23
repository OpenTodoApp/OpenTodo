import type { Decorator, Meta, StoryObj } from '@storybook/react-vite'
import { useEffect } from 'react'
import { Shell } from './Shell'
import { openTask } from './signals'
import { forceMinimisedForStory } from './useScrollDirection'
import { seedInbox, seedTracking, seeded, storyUser, withSeed } from './stories/fixtures'

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

/** A task of the same Inbox opened as its page (task-full-page): breadcrumb, 1 / n, content and facts. */
export const TaskPage: StoryObj = {
  ...withSeed(async () => {
    await seedInbox()
    // A pending "open this task" request: the list takes it when it mounts, selects the
    // row and opens the task as its page, remembering the list for 1 / n and Esc.
    openTask.set(seeded.inboxTask)
  }),
  render: () => <Viewport><Shell user={storyUser} onLogout={noop} /></Viewport>,
}

/** An entry running for 1 h 5 min (time-tracking D6): the sidebar footer's indicator, the phone bar's pill below 768 px. */
export const Tracking: StoryObj = {
  ...withSeed(seedTracking),
  render: () => <Viewport><Shell user={storyUser} onLogout={noop} /></Viewport>,
}

/** Below 768 px while the list scrolls down (phone-v2 D6): the tab bar as 40 px of icons, the add button slid out. */
const minimisedSeed = withSeed(async () => { await seedInbox(); forceMinimisedForStory(true) })
export const PhoneScrolling: StoryObj = {
  ...minimisedSeed,
  // The override ends with the story, so the next story shows the full bar.
  decorators: [...(minimisedSeed.decorators as Decorator[]), (Story) => { useEffect(() => () => forceMinimisedForStory(false), []); return <Story /> }],
  render: () => <Viewport><Shell user={storyUser} onLogout={noop} /></Viewport>,
}
