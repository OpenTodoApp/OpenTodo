import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { FeedView } from './FeedView'
import { seedBase, seedProjectWithSections, withSeed } from './stories/fixtures'

// Core screen: Updates (`/updates`), what changed in shared projects (OpenSpec change
// ux-audit-three-widths task 5.3; weekly in the inventory).
const meta: Meta = { title: 'Screens/Updates' }
export default meta

function Column({ children }: { children: ReactNode }) {
  return <div className="-m-4 h-[48rem] overflow-y-auto bg-canvas">{children}</div>
}

/** A project's changes, newest first. */
export const Events: StoryObj = {
  ...withSeed(() => seedProjectWithSections(false)),
  render: () => <Column><FeedView /></Column>,
}

/** Nothing has changed yet. */
export const Empty: StoryObj = {
  ...withSeed(seedBase),
  render: () => <Column><FeedView /></Column>,
}
