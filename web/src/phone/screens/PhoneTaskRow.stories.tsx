import type { Meta, StoryObj } from '@storybook/react-vite'
import type { Project, Task } from '../../lib/types'
import { PhoneFrame } from '../stories/frame'
import { noop } from '../stories/sample'
import { PhoneTaskRow } from './PhoneTaskRow'

// The app's task row drawn for a phone (phone-all-screens D3): what a screen gives its rows, in the phone row.
const meta: Meta = { title: 'Phone/Screens/Task row' }
export default meta

const task = (patch: Partial<Task>) => ({ id: 't1', title: 'Send the invoice to Northwind', priority: 2, labels: [], due: { date: '2026-10-12' }, recurrence: 'every month', ...patch }) as unknown as Task
const work = { id: 'p1', name: 'Work', color: '#3b82c4' } as unknown as Project

export const Rows: StoryObj = {
  name: 'As a screen gives them',
  render: () => (
    <PhoneFrame height={300}>
      <div data-phone-list className="px-4 pt-3">
        <ul>
          <PhoneTaskRow selected={false} task={task({})} project={work} showProject progress={{ done: 1, total: 3 }} onToggle={noop} onOpen={noop} />
          <PhoneTaskRow selected={false} showProject={false} task={task({ id: 't2', title: 'Plan the launch day', due: undefined, recurrence: undefined, priority: 4 })} hasChildren collapsed={false} onToggleCollapse={noop} onToggle={noop} onOpen={noop} />
          <PhoneTaskRow selected={false} showProject={false} task={task({ id: 't3', title: 'Book the room', due: undefined, recurrence: undefined, priority: 4 })} depth={1} onToggle={noop} onOpen={noop} />
          <PhoneTaskRow selected={false} showProject={false} task={task({ id: 't4', title: 'A task you may only read', due: undefined, recurrence: undefined, priority: 4 })} readOnly onToggle={noop} onOpen={noop} />
        </ul>
      </div>
    </PhoneFrame>
  ),
}
