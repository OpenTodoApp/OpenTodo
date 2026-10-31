import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import YearView from '../YearView'
import { seedCalendarYear, withSeed } from '../stories/fixtures'

// Core screen: Year (`/year`, OpenSpec change year-view), twelve compact months with a
// density mark per day and the over-capacity dot, four, three or two months a row by the
// content width; below 640 px each month is one touch target (the 375 px capture).
const meta: Meta = { title: 'Screens/Year', ...withSeed(seedCalendarYear()) }
export default meta

function Column({ children }: { children: ReactNode }) {
  return <div className="-m-4 h-[60rem] overflow-y-auto bg-canvas">{children}</div>
}

/** 2026 from the frozen Wednesday 14 October: a busy launch week in March, a holiday in August, the weekly report from October on. */
export const Year2026: StoryObj = {
  render: () => <Column><YearView /></Column>,
}
