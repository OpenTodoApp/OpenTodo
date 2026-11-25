import type { Meta, StoryObj } from '@storybook/react-vite'
import { CHROME_ROOM, PhoneFrame, StoryChrome, StoryScroller } from '../stories/frame'
import { events, groups, lateRows, more, noop, todayRows } from '../stories/sample'
import { PhoneTodayView, type PhoneTodayViewProps } from './PhoneTodayView'

// Today on a phone, drawn with fixed data (phone-ui-trial "Phone Today"): the design each state is to have.
const meta: Meta = { title: 'Phone/Design/Today' }
export default meta

function Today(props: Partial<PhoneTodayViewProps>) {
  return (
    <PhoneFrame>
      <StoryScroller>
        <PhoneTodayView date="Wednesday 14 October" summary="6 tasks · 2 late" groups={groups} events={events} doneCount={3}
          bottomRoom={CHROME_ROOM} menu={more} onMenu={noop} onToggle={noop} onOpen={noop} {...props} />
      </StoryScroller>
      <StoryChrome />
    </PhoneFrame>
  )
}

export const Usual: StoryObj = { name: 'A usual day', render: () => <Today /> }
export const NoEvents: StoryObj = { name: 'Without events', render: () => <Today events={[]} /> }
export const Empty: StoryObj = { name: 'Nothing left', render: () => <Today groups={[]} events={[]} summary="0 tasks" doneCount={6} /> }
export const Limit: StoryObj = {
  name: 'With a Today limit',
  render: () => (
    <Today events={[]} summary="3 tasks" doneCount={1} groups={[
      { id: 'today', title: 'Today', rows: todayRows.slice(0, 3), count: 3 },
      { id: 'waiting', title: 'Waiting for a slot', rows: [], count: 3, folded: true },
      { id: 'blocked', title: 'Blocked', rows: lateRows, count: 2, folded: false },
    ]} />
  ),
}
