import type { Meta, StoryObj } from '@storybook/react-vite'
import { navigate } from '../../app/router'
import { TaskPage } from '../../app/TaskPage'
import { seeded, seedToday, storyUser, withSeed } from '../../app/stories/fixtures'
import { PhoneTaskPage } from '../screens/PhoneTaskPage'
import { PhoneList } from '../screens/PhoneList'
import { StoryScroller } from './frame'
import { noop } from './sample'

// Two phone screens side by side in a 1,024 px frame (phone-ui-trial D9): the check that a
// screen is a pane, which fills its container and pins its bar to it. Not a tablet design.
const meta: Meta = { title: 'Phone/Panes' }
export default meta

export const TwoPanes: StoryObj = {
  name: 'Two panes',
  ...withSeed(async () => {
    await seedToday()
    navigate({ view: 'today' })
  }),
  render: () => (
    <div data-phone-panes className="grid h-[680px] w-[1024px] max-w-none grid-cols-[22rem_minmax(0,1fr)] overflow-hidden rounded-card border border-default bg-canvas" style={{ transform: 'translateZ(0)' }}>
      <div className="min-w-0 border-r border-default" data-pane="list"><StoryScroller><PhoneList route={{ view: 'today' }} userId={storyUser.id} onMenu={noop} /></StoryScroller></div>
      <div className="min-w-0" data-pane="task"><StoryScroller><TaskPage id={seeded.todayTask} user={storyUser} View={PhoneTaskPage} /></StoryScroller></div>
    </div>
  ),
}
