import type { Meta, StoryObj } from '@storybook/react-vite'
import { createTask, updateTask } from '../lib/ops'
import { LabelsView } from '../app/LabelsView'
import { NextView } from '../app/method/MethodListView'
import { navigate } from '../app/router'
import { seedInbox, seeded, withSeed } from '../app/stories/fixtures'
import { PhoneChrome } from './PhoneChrome'
import { PhoneFrame, StoryChrome, StoryScroller } from './stories/frame'
import { noop } from './stories/sample'

// The phone UI around a screen that is not written for it (phone-all-screens): the page's
// header is the phone's, and its task rows are the phone row. The screen's own content is its own.
const meta: Meta = { title: 'Phone/Chrome' }
export default meta

async function seedNext() {
  await seedInbox()
  const quotes = await createTask({ title: 'Get three quotes for the kitchen', project_id: seeded.home, priority: 2 })
  const fitters = await createTask({ title: 'Book the kitchen fitters', project_id: seeded.home })
  await updateTask(fitters, { blocked_by: [quotes] })
  await createTask({ title: 'Sort the photo archive', project_id: seeded.home })
}

export const Next: StoryObj = {
  name: 'Next, with phone rows',
  ...withSeed(async () => { await seedNext(); navigate({ view: 'next' }) }),
  render: () => <PhoneFrame><StoryScroller chrome><PhoneChrome onMenu={noop}><NextView /></PhoneChrome></StoryScroller><StoryChrome /></PhoneFrame>,
}

export const Labels: StoryObj = {
  name: 'Labels, under the phone header',
  ...withSeed(async () => { await seedInbox(); navigate({ view: 'labels' }) }),
  render: () => <PhoneFrame><StoryScroller chrome><PhoneChrome onMenu={noop}><LabelsView route={{ view: 'labels' }} /></PhoneChrome></StoryScroller><StoryChrome /></PhoneFrame>,
}
