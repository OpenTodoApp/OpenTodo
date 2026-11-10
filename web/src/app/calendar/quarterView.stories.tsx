import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import QuarterView from '../QuarterView'
import { seedCalendarEvents, seedCalendarYear, withSeed } from '../stories/fixtures'

// Core screen: Quarter (`/quarter`, OpenSpec change quarter-view-and-plan-spans),
// the three calendar months of the quarter as compact density grids, three in a
// row on a wide screen and one per touch target below 640 px (the 375 px capture).
// The year's seeded tasks fall in Q4 2026 from the frozen Wednesday 14 October.
const meta: Meta = { title: 'Screens/Quarter', ...withSeed(seedCalendarYear()) }
export default meta

function Column({ children }: { children: ReactNode }) {
  return <div className="-m-4 h-[60rem] overflow-y-auto bg-canvas">{children}</div>
}

/** Q4 2026: the launch week in October, the weekly report, and the density marks on every month. */
export const Quarter2026: StoryObj = {
  render: () => <Column><QuarterView /></Column>,
}

/** A subscribed calendar (calendar-events-all-views): a hollow ring on each day with events, apart from the density bar. */
export const WithEvents: StoryObj = {
  ...withSeed(seedCalendarEvents(seedCalendarYear())),
  render: () => <Column><QuarterView /></Column>,
}
