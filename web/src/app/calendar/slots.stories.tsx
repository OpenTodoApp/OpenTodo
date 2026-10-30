import type { Meta, StoryObj } from '@storybook/react-vite'
import { CalendarView } from '../CalendarView'
import { seedCalendarSlots, withSeed } from '../stories/fixtures'

// Core screen: slots (OpenSpec change calendar-slots). The seeded week at the frozen
// Wednesday noon with "Admin" today from 14:00 for two hours holding six small tasks
// (one done), drawn as one block with two checklist rows and "+4", and Monday's
// "Errands" slot, overfull ("50m in 45m") and dimmed as a past day. Below 640 px the
// Week is the agenda, where each slot is one row that expands to its checklist.
const meta: Meta = { title: 'Screens/Slots', ...withSeed(seedCalendarSlots) }
export default meta

const Column = ({ children }: { children: React.ReactNode }) => <div className="-m-4 h-[48rem] overflow-y-auto bg-canvas">{children}</div>

/** Week: today's "Admin" slot among the blocks, Monday's overfull slot dimmed; the agenda on a phone. */
export const Week: StoryObj = {
  render: () => <Column><CalendarView mode="week" /></Column>,
}

/** Day: today's "Admin" slot with its checklist and the count. */
export const Day: StoryObj = {
  render: () => <Column><CalendarView mode="day" /></Column>,
}
