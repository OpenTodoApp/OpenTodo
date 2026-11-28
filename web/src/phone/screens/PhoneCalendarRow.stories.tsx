import type { Meta, StoryObj } from '@storybook/react-vite'
import type { Project, Task } from '../../lib/types'
import { PhoneFrame } from '../stories/frame'
import { PhoneCalendarRow } from './PhoneCalendarRow'

// A task in one of the calendar's lists on a phone (phone-calendar): what Week, Month's chosen day and Plan say of it.
const meta: Meta = { title: 'Phone/Screens/Calendar row' }
export default meta

const task = (patch: Partial<Task>) => ({ id: 't1', title: 'Get three quotes for the kitchen', priority: 4, labels: [], due: { date: '2026-10-14', time: '10:00' }, ...patch }) as unknown as Task
const home = { id: 'p1', name: 'Home renovation', color: '#d97706' } as unknown as Project
const day = '2026-10-14'

export const Rows: StoryObj = {
  name: 'A day of Week',
  render: () => (
    <PhoneFrame height={400}>
      <div className="px-4 pt-3">
        <ul data-phone-rows>
          <PhoneCalendarRow task={task({ estimate_minutes: 60 })} date={day} today={day} time="10:00" readOnly={false} project={home} />
          <PhoneCalendarRow task={task({ id: 't2', title: 'Renew passport', priority: 2, estimate_minutes: 30, deadline: day })} date={day} today={day} time={null} readOnly={false} />
          <PhoneCalendarRow task={task({ id: 't3', title: 'Paint the fence along the garden path before the neighbours come over', priority: 1 })} date={day} today={day} time={null} note="Day 2 of 3" readOnly={false} />
          <PhoneCalendarRow task={task({ id: 't4', title: 'Water the plants' })} date="2026-10-12" today={day} time={null} readOnly={false} />
          <PhoneCalendarRow task={task({ id: 't5', title: 'A task you may only read' })} date={day} today={day} time="16:00" readOnly />
        </ul>
      </div>
    </PhoneFrame>
  ),
}
