import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { MonthView } from '../MonthView'
import { seedCalendarWeek, withSeed } from '../stories/fixtures'

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
