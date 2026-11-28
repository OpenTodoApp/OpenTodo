import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import type { Task } from '../../lib/types'
import { PhoneFrame } from '../stories/frame'
import { noop } from '../stories/sample'
import { TodayGlance } from './TodayGlance'
import { WeekStrip } from './WeekStrip'

// Today at a glance and Upcoming's week (phone-modern-look D2), at a fixed day and time.
const meta: Meta = { title: 'Phone/Components/Glance' }
export default meta

const DAY = '2026-11-27'
const at = (hhmm: string) => new Date(`${DAY}T${hhmm}:00`).getTime()
const task = (id: string, title: string, more: Partial<Task> = {}) => ({ id, title, completed_at: null, due: { date: DAY }, ...more }) as unknown as Task
const listed = [
  task('a', 'Get three quotes for the kitchen', { due: { date: DAY, time: '10:00' } }),
  task('b', 'Review pull request #42', { due: { date: DAY, time: '14:00' } }),
  task('c', 'Pick up groceries', { due: { date: DAY, time: '18:00' } }),
  task('d', 'Status page'),
]
const done = [task('e', 'Book the dentist', { completed_at: at('09:10') }), task('f', 'Pay the electricity bill', { completed_at: at('09:40') })]

const box = (children: ReactNode) => <PhoneFrame height={300}><div className="px-4 pt-4">{children}</div></PhoneFrame>

export const Day: StoryObj = {
  name: 'Today, a day in progress',
  render: () => box(<TodayGlance listed={listed} all={[...listed, ...done]} late={3} today={DAY} at={at('12:30')} onLate={noop} />),
}

export const NothingLate: StoryObj = {
  name: 'Today, nothing late',
  render: () => box(<TodayGlance listed={listed} all={listed} late={0} today={DAY} at={at('12:30')} onLate={noop} />),
}

export const Week: StoryObj = {
  name: 'Upcoming, the week',
  render: () => box(<WeekStrip today={DAY} counts={new Map([['2026-11-28', 5], ['2026-11-29', 3], ['2026-11-30', 2], ['2026-12-02', 1]])} onDay={noop} />),
}
