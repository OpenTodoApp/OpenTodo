import type { Meta, StoryObj } from '@storybook/react-vite'
import type { Task } from '../../lib/types'
import { PhoneFrame } from '../stories/frame'
import { RowPreview } from './RowPreview'

// The task at the head of its actions sheet (phone-delight D4): its priority ring and the facts its row shows.
const meta: Meta = { title: 'Phone/Components/Row preview' }
export default meta

const task = { id: 'p', title: 'Call the plumber about the leak', priority: 1, completed_at: null, due: { date: '2026-11-27', time: '09:30' }, recurrence: 'every monday' } as unknown as Task

export const Preview: StoryObj = {
  name: 'One task',
  render: () => <PhoneFrame height={80}><div className="pt-3"><RowPreview task={task} /></div></PhoneFrame>,
}
