import type { Meta, StoryObj } from '@storybook/react-vite'
import { dayLoad } from '../../lib/calendar'
import type { Task } from '../../lib/types'
import { CapacityLine } from './CapacityLine'

// The capacity line of a Day or Week header and a Month cell (time-blocking "Overlap
// and capacity", OpenSpec change meeting-aware-capacity D3): at rest in the muted tone,
// over by tasks in the danger pair, over only with meetings in the warning pair. The
// workbench captures it in light and dark.
const meta: Meta = { title: 'Screens/Capacity line' }
export default meta

const DAY = '2026-10-14'
const tasks = (minutes: number) => [{ due: { date: DAY }, estimate_minutes: minutes, completed_at: null, deleted_at: null }] as Pick<Task, 'due' | 'estimate_minutes' | 'completed_at' | 'deleted_at'>[]

const states = [
  { name: 'At rest, with meetings', load: dayLoad(tasks(255), DAY, 480, 150) },
  { name: 'Over by tasks', load: dayLoad(tasks(540), DAY, 480, 60) },
  { name: 'Over with meetings', load: dayLoad(tasks(360), DAY, 480, 180) },
]

export const States: StoryObj = {
  render: () => (
    <dl className="grid w-fit grid-cols-[auto_auto] items-center gap-x-6 gap-y-2 bg-surface p-3 text-meta">
      {states.map((s) => (
        <div key={s.name} className="contents">
          <dt className="text-muted">{s.name}</dt>
          <dd><CapacityLine load={s.load} dayLength={480} /></dd>
        </div>
      ))}
    </dl>
  ),
}
