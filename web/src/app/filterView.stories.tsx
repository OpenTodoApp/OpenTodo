import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { FilterView } from './FilterView'
import { seedInbox, withSeed } from './stories/fixtures'

// Core screen: Filter (`/filter`), a query and its results (OpenSpec change
// ux-audit-three-widths task 5.2; weekly in the inventory, as is a saved filter).
const meta: Meta = { title: 'Screens/Filter', ...withSeed(seedInbox) }
export default meta

function Column({ children }: { children: ReactNode }) {
  return <div className="-m-4 h-[48rem] overflow-y-auto bg-canvas">{children}</div>
}

/** A query with results. */
export const WithResults: StoryObj = {
  render: () => <Column><FilterView initialQuery="@errand | p2" /></Column>,
}

/** A valid query that matches nothing. */
export const NoResults: StoryObj = {
  render: () => <Column><FilterView initialQuery="@nothing-has-this" /></Column>,
}

/** A query the parser rejects, with its message. */
export const InvalidQuery: StoryObj = {
  render: () => <Column><FilterView initialQuery="due <= (" /></Column>,
}
