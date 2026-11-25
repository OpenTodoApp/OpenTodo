import type { Meta, StoryObj } from '@storybook/react-vite'
import { PhoneFrame } from '../stories/frame'
import { BLUE, Dot, noop } from '../stories/sample'
import { PhoneGroup } from './PhoneGroup'
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

export const States: StoryObj = {
  name: 'States',
  render: () => (
    <PhoneFrame height={560}>
      <div className="pt-3">
        <PhoneGroup title="Rows" count={states.length}>
          {states.map((row) => <PhoneRow key={row.id} row={row} onToggle={noop} onOpen={noop} />)}
        </PhoneGroup>
      </div>
    </PhoneFrame>
  ),
}

export const ReadOnly: StoryObj = {
  name: 'A reader\'s row',
  render: () => (
    <PhoneFrame height={140}>
      <div className="pt-3"><PhoneGroup title="Shared with you" count={1}><PhoneRow row={states[3]} readOnly onToggle={noop} onOpen={noop} /></PhoneGroup></div>
    </PhoneFrame>
  ),
}
