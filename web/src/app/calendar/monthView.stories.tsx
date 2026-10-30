import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { MonthView } from '../MonthView'
import { seedCalendarClarity, seedCalendarWeek, withSeed } from '../stories/fixtures'

// Core screen: Month (`/month`), timed and all-day tasks in a month grid (OpenSpec
// change ux-audit-three-widths task 5.5; weekly in the inventory). Day, Week and Plan
// are Screens/Calendar.
const meta: Meta = { title: 'Screens/Month', ...withSeed(seedCalendarWeek) }
export default meta

function Column({ children }: { children: ReactNode }) {
  return <div className="-m-4 h-[48rem] overflow-y-auto bg-canvas">{children}</div>
}

/** October 2026 from the frozen Wednesday. */
export const October: StoryObj = {
  render: () => <Column><MonthView /></Column>,
}

/** Deadlines in the Month (calendar-clarity D1): Friday the 16th lists "Submit the grant" with the diamond; the 15th's "Pay the rent" carries it on its own row. */
export const Deadlines: StoryObj = {
  ...withSeed(seedCalendarClarity('project')),
  render: () => <Column><MonthView /></Column>,
}
