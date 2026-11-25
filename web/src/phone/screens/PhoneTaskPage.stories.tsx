import type { Meta, StoryObj } from '@storybook/react-vite'
import { createTask } from '../../lib/ops'
import { useTask } from '../../lib/localData'
import { TaskPage } from '../../app/TaskPage'
import { seeded, seedInbox, storyUser, withSeed } from '../../app/stories/fixtures'
import { PhoneFrame, StoryScroller } from '../stories/frame'
import { noop } from '../stories/sample'
import { PhoneTaskPage } from './PhoneTaskPage'
import { TaskDateSheet } from './TaskDateSheet'

// The task page on a phone with the seeded account (phone-ui-trial "Phone task page"), and the date sheet it opens.
const meta: Meta = { title: 'Phone/Screens/Task page' }
export default meta

let bare = ''
const page = (id: () => string) => () => <PhoneFrame><StoryScroller><TaskPage id={id()} user={storyUser} View={PhoneTaskPage} /></StoryScroller></PhoneFrame>

export const Seeded: StoryObj = {
  name: 'A task with facts',
  ...withSeed(async () => { await seedInbox() }),
  render: page(() => seeded.inboxTask),
}

export const Bare: StoryObj = {
  name: 'A bare task',
  ...withSeed(async () => { bare = await createTask({ title: 'Renew passport' }) }),
  render: page(() => bare),
}

function Sheet({ id }: { id: string }) {
  const task = useTask(id)
  return task ? <TaskDateSheet task={task} someday onClose={noop} /> : null
}

export const DateSheet: StoryObj = {
  name: 'The date sheet',
  ...withSeed(async () => { await seedInbox() }),
  render: () => <Sheet id={seeded.inboxTask} />,
}
