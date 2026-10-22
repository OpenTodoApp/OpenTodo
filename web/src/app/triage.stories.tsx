import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { createTask } from '../lib/ops'
import { TriageView } from './TriageView'
import { seedBase, seedInbox, withSeed } from './stories/fixtures'

// Core screen: Process the Inbox (inbox-triage), one unplaced task at a time with its
// placement choices (OpenSpec change ux-audit-three-widths task 5.1; the inventory
// marks it weekly).
const meta: Meta = { title: 'Screens/Process the Inbox' }
export default meta

function Column({ children }: { children: ReactNode }) {
  return <div className="-m-4 h-[48rem] overflow-y-auto bg-canvas">{children}</div>
}

/** A task with notes and subtasks first; the rest of the Inbox waits behind it. */
export const TaskWithNotes: StoryObj = {
  ...withSeed(async () => {
    await seedBase()
    await createTask({ title: 'Plan the autumn trip', description: 'Three days, by train if possible. Ask Mara about the dates first.', priority: 3 })
    await createTask({ title: 'Return the library books' })
  }),
  render: () => <Column><TriageView /></Column>,
}

/** The last unplaced task. */
export const LastTask: StoryObj = {
  ...withSeed(async () => { await seedBase(); await createTask({ title: 'Reply to Mara about the workshop' }) }),
  render: () => <Column><TriageView /></Column>,
}

/** Inbox zero: nothing left to place. */
export const InboxZero: StoryObj = {
  ...withSeed(seedBase),
  render: () => <Column><TriageView /></Column>,
}

/** A full Inbox, as the audit's seed has it. */
export const FullInbox: StoryObj = {
  ...withSeed(seedInbox),
  render: () => <Column><TriageView /></Column>,
}
