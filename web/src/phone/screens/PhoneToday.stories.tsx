import type { Meta, StoryObj } from '@storybook/react-vite'
import { setTodayLimit } from '../../lib/closedListPrefs'
import { createTask, setTaskCompleted } from '../../lib/ops'
import { navigate } from '../../app/router'
import { seedToday, storyUser, TODAY, withSeed } from '../../app/stories/fixtures'
import { PhoneFrame, StoryChrome, StoryScroller } from '../stories/frame'
import { noop } from '../stories/sample'
import { PhoneToday } from './PhoneToday'

// Today on a phone with the seeded account (phone-ui-trial "Phone Today"): the list the desktop Today computes, in the phone's drawing.
const meta: Meta = { title: 'Phone/Screens/Today' }
export default meta

const screen = () => <PhoneFrame><StoryScroller chrome><PhoneToday userId={storyUser.id} onMenu={noop} /></StoryScroller><StoryChrome /></PhoneFrame>

export const Seeded: StoryObj = {
  name: 'The seeded day',
  ...withSeed(async () => {
    await seedToday()
    navigate({ view: 'today' })
  }),
  render: screen,
}

export const Limit: StoryObj = {
  name: 'With a limit of three',
  ...withSeed(async () => {
    await seedToday()
    await setTodayLimit(3)
    await setTaskCompleted(await createTask({ title: 'Answer Mia about the tiles', due: { date: TODAY } }), true)
    navigate({ view: 'today' })
  }),
  render: screen,
}

export const Empty: StoryObj = {
  name: 'Nothing for today',
  ...withSeed(async () => { navigate({ view: 'today' }) }),
  render: screen,
}
