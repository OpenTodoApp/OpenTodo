import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { PhoneFrame } from '../stories/frame'
import { BLUE, Dot, noop } from '../stories/sample'
import { PhoneRow, type PhoneRowModel } from './PhoneRow'

// One task on a phone list (phone-ui-trial "Phone task rows"): every state a row has.
const meta: Meta = { title: 'Phone/Components/Row' }
export default meta

const base: PhoneRowModel = { id: 'r', title: 'Water the plants', priority: 4 }
const states: PhoneRowModel[] = [
  base,
  { ...base, id: 'two', title: 'Call the bank about the card limit before the trip to Lisbon next week', facts: [{ id: 'due', text: '15:00', tone: 'accent' }] },
  { ...base, id: 'four', title: 'Send the invoice to Northwind', priority: 1, facts: [
    { id: 'due', text: 'Tomorrow 09:30' }, { id: 'subtasks', text: '1/3', icon: 'list-checks' }, { id: 'repeat', text: 'every month', icon: 'repeat' },
    { id: 'project', text: 'Work and everything that belongs to the office', mark: <Dot c={BLUE} /> },
  ] },
  { ...base, id: 'late', title: 'Book the dentist', priority: 2, facts: [{ id: 'due', text: '13 Oct', tone: 'danger' }] },
  { ...base, id: 'p3', title: 'Stretch for ten minutes', priority: 3 },
  { ...base, id: 'done', title: 'Answer Mia about the tiles', done: true, facts: [{ id: 'due', text: '11:00' }] },
]

/** The rows as a list shows them: one card (the list's own frame, index.css). */
const Rows = ({ children }: { children: ReactNode }) => <div data-phone-list className="px-4 pt-3"><ul>{children}</ul></div>

export const States: StoryObj = {
  name: 'States',
  render: () => (
    <PhoneFrame height={470}>
      <Rows>{states.map((row) => <PhoneRow key={row.id} row={row} onToggle={noop} onOpen={noop} />)}</Rows>
    </PhoneFrame>
  ),
}

export const ReadOnly: StoryObj = {
  name: 'A reader\'s row',
  render: () => <PhoneFrame height={110}><Rows><PhoneRow row={states[3]} readOnly onToggle={noop} onOpen={noop} /></Rows></PhoneFrame>,
}

export const Subtasks: StoryObj = {
  name: 'Subtasks under their task',
  render: () => (
    <PhoneFrame height={260}>
      <Rows>
        <PhoneRow row={{ ...base, id: 'parent', title: 'Plan the launch day', facts: [{ id: 'subtasks', text: '0/2', icon: 'list-checks' }] }} fold={{ open: true, onToggle: noop }} onToggle={noop} onOpen={noop} />
        <PhoneRow row={{ ...base, id: 'c1', title: 'Book the room' }} depth={1} onToggle={noop} onOpen={noop} />
        <PhoneRow row={{ ...base, id: 'c2', title: 'Order the cake' }} depth={1} onToggle={noop} onOpen={noop} />
        <PhoneRow row={{ ...base, id: 'folded', title: 'Pricing page', priority: 1 }} fold={{ open: false, onToggle: noop }} onToggle={noop} onOpen={noop} />
      </Rows>
    </PhoneFrame>
  ),
}

export const Selecting: StoryObj = {
  name: 'In selection',
  render: () => (
    <PhoneFrame height={210}>
      <Rows>
        <PhoneRow row={states[0]} selecting ticked onTick={noop} onToggle={noop} onOpen={noop} />
        <PhoneRow row={states[3]} selecting onTick={noop} onToggle={noop} onOpen={noop} />
        <PhoneRow row={states[4]} selecting readOnly onTick={noop} onToggle={noop} onOpen={noop} />
      </Rows>
    </PhoneFrame>
  ),
}
