import type { Meta, StoryObj } from '@storybook/react-vite'
import { setTodayLimit } from '../../lib/closedListPrefs'
import { createSubtask, createTask, setTaskCompleted } from '../../lib/ops'
import { navigate } from '../../app/router'
import type { ListRoute } from '../../app/task-list/useListModel'
import { seeded, seedInbox, seedProjectWithSections, seedToday, storyUser, TODAY, withSeed } from '../../app/stories/fixtures'
import { PhoneFrame, StoryChrome, StoryScroller } from '../stories/frame'
import { noop } from '../stories/sample'
import { PhoneList } from './PhoneList'

// The task lists on a phone with the seeded account (phone-lists): the list the desktop
// screen wires, in the phone's drawing. One story per list and state.
const meta: Meta = { title: 'Phone/Screens/List' }
export default meta

const screen = (route: () => ListRoute) => () => <PhoneFrame><StoryScroller chrome><PhoneList route={route()} userId={storyUser.id} onMenu={noop} /></StoryScroller><StoryChrome /></PhoneFrame>
const today = screen(() => ({ view: 'today' }))

export const Today: StoryObj = {
  name: 'Today, the seeded day',
  ...withSeed(async () => {
    await seedToday()
    navigate({ view: 'today' })
  }),
  render: today,
}

export const TodayLimit: StoryObj = {
  name: 'Today with a limit of three',
  ...withSeed(async () => {
    await seedToday()
    await setTodayLimit(3)
    await setTaskCompleted(await createTask({ title: 'Answer Mia about the tiles', due: { date: TODAY } }), true)
    navigate({ view: 'today' })
  }),
  render: today,
}

export const TodayEmpty: StoryObj = {
  name: 'Today with nothing',
  ...withSeed(async () => { navigate({ view: 'today' }) }),
  render: today,
}

export const Inbox: StoryObj = {
  name: 'The Inbox',
  ...withSeed(async () => {
    await seedInbox()
    navigate({ view: 'inbox' })
  }),
  render: screen(() => ({ view: 'inbox' })),
}

export const Upcoming: StoryObj = {
  name: 'Upcoming',
  ...withSeed(async () => {
    await seedToday()
    navigate({ view: 'upcoming' })
  }),
  render: screen(() => ({ view: 'upcoming' })),
}

export const Project: StoryObj = {
  name: 'A project with sections and subtasks',
  ...withSeed(async () => {
    await seedProjectWithSections(false)
    const parent = await createTask({ title: 'Plan the launch day', project_id: seeded.website })
    await createSubtask(parent, 'Book the room')
    await createSubtask(parent, 'Order the cake')
    navigate({ view: 'project', id: seeded.website })
  }),
  render: screen(() => ({ view: 'project', id: seeded.website })),
}

export const Someday: StoryObj = {
  name: 'An empty list',
  ...withSeed(async () => { navigate({ view: 'someday' }) }),
  render: screen(() => ({ view: 'someday' })),
}
