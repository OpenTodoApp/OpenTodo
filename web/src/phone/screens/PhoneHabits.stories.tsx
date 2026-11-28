import type { Meta, StoryObj } from '@storybook/react-vite'
import { completeTask, createTask, mutate, updateTask } from '../../lib/ops'
import { addDaysISO } from '../../lib/dates'
import { setPastDay } from '../../lib/habitActions'
import { setHabitsOn } from '../../lib/habitPrefs'
import { tallyId } from '../../lib/habitAmounts'
import { TODAY, withSeed } from '../../app/stories/fixtures'
import { PhoneChrome } from '../PhoneChrome'
import { PhoneFrame, StoryChrome, StoryScroller } from '../stories/frame'
import { noop } from '../stories/sample'
import { PhoneHabits } from './PhoneHabits'

// The Habits screen on a phone (habits-complete D1 to D3) on the frozen Wednesday 14
// October 2026: the day strip, a ring per habit in every state, the week as small marks.
const meta: Meta = { title: 'Phone/Screens/Habits' }
export default meta

async function habit(title: string, rule: string, due: string, extra: Record<string, unknown> = {}): Promise<string> {
  const id = await createTask({ title, due: { date: due }, recurrence: rule })
  await updateTask(id, { habit: true, ...extra })
  return id
}

const screen = () => <PhoneFrame><StoryScroller chrome><PhoneChrome onMenu={noop}><PhoneHabits /></PhoneChrome></StoryScroller><StoryChrome current="" /></PhoneFrame>

export const Screen: StoryObj = {
  name: 'Habits, halfway through the day',
  ...withSeed(async () => {
    await mutate('user_prefs', 'me', { habits: 'on' })
    const run = await habit('Run', 'every mon, wed, fri', '2026-10-05', { day_part: 'morning', habit_anchor: 'After coffee' })
    for (const d of ['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12', TODAY]) await completeTask(run, { today: d })
    const stretch = await habit('Stretch', 'every day', addDaysISO(TODAY, -7), { day_part: 'morning', habit_tiny: 'One stretch' })
    await completeTask(stretch, { today: addDaysISO(TODAY, -7) })
    await updateTask(stretch, { due: { date: TODAY } })
    for (const [n, c] of [[-6, 'done'], [-5, 'done'], [-3, 'tiny'], [-2, 'done'], [-1, 'skipped']] as const) await setPastDay(stretch, addDaysISO(TODAY, n), c, 1, TODAY)
    const water = await habit('Water', 'every day', TODAY, { habit_amount: 8, habit_unit: 'glasses', day_part: 'afternoon' })
    await mutate('habit_tally', tallyId(water, TODAY, 'story'), { series_id: water, date: TODAY, device: 'story', count: 3, created_at: 1, deleted_at: null })
    const read = await habit('Read', 'every day', addDaysISO(TODAY, -7), { evening: true, habit_anchor: 'After dinner' })
    await completeTask(read, { today: addDaysISO(TODAY, -7) })
    await updateTask(read, { due: { date: TODAY } })
    for (let n = -6; n <= -1; n++) await setPastDay(read, addDaysISO(TODAY, n), 'done', 1, TODAY)
    await habit('Gym', 'every day', TODAY, { habit_target: 3, habit_period: 'week' })
    await habit('Call home', 'every sun', '2026-10-18')
  }),
  render: screen,
}

export const Empty: StoryObj = {
  name: 'Habits with none yet',
  ...withSeed(async () => { await setHabitsOn(true) }),
  render: screen,
}
