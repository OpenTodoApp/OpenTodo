import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { AskScreen } from './AskEntry'
import { seedInbox, withSeed } from '../stories/fixtures'

// Core screen: the Assistant page (`/ask`), OpenSpec change ux-audit-three-widths task 5.6; weekly in
// the inventory. The workbench has no assistant server, so the screen shows the state
// it has when the assistant is off or unreachable.
const meta: Meta = { title: 'Screens/Ask', ...withSeed(seedInbox) }
export default meta

function Column({ children }: { children: ReactNode }) {
  return <div className="-m-4 h-[48rem] overflow-y-auto bg-canvas">{children}</div>
}

/** The owner's view with the assistant not set up. */
export const ProviderOff: StoryObj = {
  render: () => <Column><AskScreen role="owner" /></Column>,
}

/** A member's view with the assistant not set up. */
export const ProviderOffMember: StoryObj = {
  render: () => <Column><AskScreen role="member" /></Column>,
}
