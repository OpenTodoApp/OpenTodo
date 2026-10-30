import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { CalendarView } from './CalendarView'
import { PlanView } from './PlanView'
import { seedCalendarClarity, seedCalendarPlan, seedCalendarWeek, withSeed } from './stories/fixtures'
import { completeTask, createTask } from '../lib/ops'
import { setCalendarShowCompleted } from '../lib/localData'

// Core screen: the calendar (OpenSpec change ux-overhaul, task 8.7; time-blocking
// "Day and Week calendar views", "Week on a phone"). The real view over a seeded
// week with a frozen clock (Wednesday 14 October, noon): timed blocks, an all-day
// task in the lane, two blocks that overlap at 10:30, and the now line. Below
// 640 px Week lists the days as an agenda instead of a seven-column grid.
const meta: Meta = { title: 'Screens/Calendar', ...withSeed(seedCalendarWeek) }
export default meta

/** The shell's content column: the header stays while the grid scrolls. */
function Column({ children }: { children: ReactNode }) {
  return <div className="-m-4 h-[48rem] overflow-y-auto bg-canvas">{children}</div>
}

/** Day: four timed tasks, one overlap, an all-day task and the capacity line. */
export const Day: StoryObj = {
  render: () => <Column><CalendarView mode="day" /></Column>,
}

/** Week: Monday to Sunday from the frozen Wednesday; an agenda below 640 px. */
export const Week: StoryObj = {
  render: () => <Column><CalendarView mode="week" /></Column>,
}

/** Completed timed and all-day tasks stay visible without increasing the planned load. */
export const Completed: StoryObj = {
  ...withSeed(async () => {
    await seedCalendarWeek()
    const timed = await createTask({ title: 'Send the project update', due: { date: '2026-10-14', time: '08:00' }, estimate_minutes: 30 })
    const allDay = await createTask({ title: 'Book the train tickets', due: { date: '2026-10-14' } })
    await completeTask(timed)
    await completeTask(allDay)
    await setCalendarShowCompleted(true)
  }),
  render: () => <Column><CalendarView mode="week" /></Column>,
}

/**
 * Plan (planner-view): fourteen days from the frozen Wednesday as two rows of seven
 * columns, each with its capacity bar; tomorrow carries tasks, a meeting and a
 * weekly task, and the 26th a dimmed projected "Weekly report". An agenda below 640 px.
 */
export const Plan: StoryObj = {
  ...withSeed(seedCalendarPlan),
  render: () => <Column><PlanView /></Column>,
}

/**
 * Deadlines and Colour by Label (calendar-clarity D1, D3): Friday's strip holds the
 * deadline of a task planned today, Thursday's "Pay the rent" carries the diamond on its
 * lane row, and blocks take their first coloured label's hue (grey without one).
 */
export const WeekByLabel: StoryObj = {
  ...withSeed(seedCalendarClarity('label')),
  render: () => <Column><CalendarView mode="week" /></Column>,
}

/** Colour by Priority (calendar-clarity D3): P1 red, P2 orange, P3 blue, P4 grey. */
export const WeekByPriority: StoryObj = {
  ...withSeed(seedCalendarClarity('priority')),
  render: () => <Column><CalendarView mode="week" /></Column>,
}
