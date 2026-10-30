import type { Meta, StoryObj } from '@storybook/react-vite'
import { CalendarView } from '../CalendarView'
import { seedCalendarFrames, withSeed } from '../stories/fixtures'

// Core screen: frames (OpenSpec change calendar-frames). The seeded week at the frozen
// Wednesday noon with three frames: "Deep work" on weekdays behind the morning blocks,
// "Admin" Monday to Thursday, and "Calls" on Wednesday overlapping it, so that column
// splits two bands side by side; Monday and Tuesday are past and dimmed. Below 640 px
// the Week is the agenda, where each frame is a heading line among the day's tasks.
const meta: Meta = { title: 'Screens/Frames', ...withSeed(seedCalendarFrames) }
export default meta

const Column = ({ children }: { children: React.ReactNode }) => <div className="-m-4 h-[48rem] overflow-y-auto bg-canvas">{children}</div>

/** Week: bands behind the blocks, an overlap on Wednesday, past days dimmed; the agenda on a phone. */
export const Week: StoryObj = {
  render: () => <Column><CalendarView mode="week" /></Column>,
}

/** Day: today's "Deep work" behind the release notes and the design review. */
export const Day: StoryObj = {
  render: () => <Column><CalendarView mode="day" /></Column>,
}
