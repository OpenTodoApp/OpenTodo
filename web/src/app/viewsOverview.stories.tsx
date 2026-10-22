import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { createView } from '../lib/views'
import { ViewsView } from './ViewsView'
import { seedBase, seedInbox, withSeed } from './stories/fixtures'

// Core screen: Filters (`/views`), every saved filter and board (OpenSpec change
// ux-audit-three-widths task 5.2; weekly in the inventory).
const meta: Meta = { title: 'Screens/Filters overview' }
export default meta

function Column({ children }: { children: ReactNode }) {
  return <div className="-m-4 h-[48rem] overflow-y-auto bg-canvas">{children}</div>
}

/** Pinned and unpinned filters and a board, each with its menu. */
export const SavedFilters: StoryObj = {
  ...withSeed(async () => {
    await seedInbox()
    await createView({ name: 'Errands', query: '@errand', pinned: true })
    await createView({ name: 'Deep work and everything else that matters this week', query: '@deep-work | p1', pinned: false })
    await createView({ name: 'Due soon', query: 'due <= tomorrow', pinned: false })
  }),
  render: () => <Column><ViewsView /></Column>,
}

/** No saved filter yet: the page offers to make one. */
export const Empty: StoryObj = {
  ...withSeed(seedBase),
  render: () => <Column><ViewsView /></Column>,
}
