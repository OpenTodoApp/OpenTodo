import type { Meta, StoryObj } from '@storybook/react-vite'
import { task, TODAY, withClock } from '../stories/fixtures'
import { SectorGroups } from './SectorGroups'

// The planning list's Time sectors source (OpenSpec change time-sectors, design
// D5) on the frozen Wednesday 14 October 2026 (2026-W42, Monday weeks): the groups
// in order with counts and estimates, a blocked task counted as waiting, Do today
// on each row. Laid out at the panel's width.
const meta: Meta = { title: 'Calendar/Time sectors', decorators: [withClock] }
export default meta

const tasks = [
  task({ id: 'c1', title: 'Sort the holiday photos', sector: '2026-W40' }),
  task({ id: 'w1', title: 'Draft the budget', sector: '2026-W42', estimate_minutes: 90 }),
  task({ id: 'w2', title: 'Reply to the landlord', sector: '2026-W42', estimate_minutes: 15, position: 1 }),
  task({ id: 'b0', title: 'Get the quote' }),
  task({ id: 'w3', title: 'Sign the contract', sector: '2026-W42', blocked_by: ['b0'], position: 2 }),
  task({ id: 'n1', title: 'Book the venue for the offsite', sector: '2026-W43' }),
  task({ id: 'm1', title: 'Renew the car insurance', sector: '2026-10' }),
  task({ id: 'q1', title: 'Plan next year’s goals', sector: '2027-Q1', estimate_minutes: 120 }),
]

export const Groups: StoryObj = {
  render: () => (
    <div className="w-full max-w-sm rounded-card border border-default bg-surface p-3">
      <SectorGroups tasks={tasks} projects={[]} sections={[]} today={TODAY} actions={() => null} />
    </div>
  ),
}
