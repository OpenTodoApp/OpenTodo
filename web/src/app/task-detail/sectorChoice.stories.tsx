import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { task, withClock } from '../stories/fixtures'
import { SectorChoice } from './SectorChoice'

// The When popover's Sector segment (OpenSpec change time-sectors, design D6),
// on a frozen clock (Wednesday 14 October 2026, Monday weeks): the quick choices
// with their periods, the current one checked, a carried and a dated sector, a repeating
// task and a viewer. Laid out as the popover's body at its width.
const meta: Meta = { title: 'Task/Sector choice', decorators: [withClock] }
export default meta

function Popover({ children }: { children: ReactNode }) {
  return <div className="w-full max-w-[28rem] rounded-card border border-default bg-surface p-3 shadow-2">{children}</div>
}

/** No sector yet: the six quick choices, each with its period and dates. */
export const Choices: StoryObj = {
  render: () => <Popover><SectorChoice task={task({ id: 't1', title: 'Draft the budget' })} readOnly={false} /></Popover>,
}

/** This week chosen: the choice is checked; Clear is the popover's footer. */
export const Chosen: StoryObj = {
  render: () => <Popover><SectorChoice task={task({ id: 't2', title: 'Draft the budget', sector: '2026-W42' })} readOnly={false} /></Popover>,
}

/** A carried-over week, and a sector beside a date (written by a script): ignored while dated. */
export const CarriedAndDated: StoryObj = {
  render: () => (
    <div className="space-y-3">
      <Popover><SectorChoice task={task({ id: 't3', title: 'Book the venue', sector: '2026-W40' })} readOnly={false} /></Popover>
      <Popover><SectorChoice task={task({ id: 't4', title: 'Plan the offsite', sector: '2026-11', due: { date: '2026-10-16' } })} readOnly={false} /></Popover>
    </div>
  ),
}

/** A repeating task keeps a date; a viewer reads the sector as text. */
export const RepeatingAndViewer: StoryObj = {
  render: () => (
    <div className="space-y-3">
      <Popover><SectorChoice task={task({ id: 't5', title: 'Stretch', recurrence: 'every monday', due: { date: '2026-10-19' } })} readOnly={false} /></Popover>
      <Popover><SectorChoice task={task({ id: 't6', title: 'Shared plan', sector: '2026-W43' })} readOnly /></Popover>
    </div>
  ),
}
