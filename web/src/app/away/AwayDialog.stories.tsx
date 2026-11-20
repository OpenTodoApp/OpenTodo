import type { Meta, StoryObj } from '@storybook/react-vite'
import { createTask, updateTask } from '../../lib/ops'
import { TODAY, withSeed } from '../stories/fixtures'
import AwayDialog from './AwayDialog'

// The Away dialog (OpenSpec change away-periods, design D2): the period, what it
// covers, Pause reminders and the preview line, over two repeating tasks.
const meta: Meta = { title: 'Screens/Away' }
export default meta

const noop = () => {}

async function seed() {
  const stretch = await createTask({ title: 'Stretch', due: { date: TODAY }, recurrence: 'every day' })
  await updateTask(stretch, { habit: true })
  await createTask({ title: 'Take out the bins', due: { date: TODAY }, recurrence: 'every week' })
}

/** Everything over the next week. */
export const Dialog: StoryObj = {
  ...withSeed(seed),
  render: () => <AwayDialog onDone={noop} />,
}
