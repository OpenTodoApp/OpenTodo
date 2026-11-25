import type { Meta, StoryObj } from '@storybook/react-vite'
import { PhoneFrame } from '../stories/frame'
import { details, noop, schedule, unset } from '../stories/sample'
import { FactCard, FactChips, FactRow } from './FactRow'

// A task's facts on its phone page (phone-ui-trial "Phone task page"): what it has as rows in cards, what it could have as buttons.
const meta: Meta = { title: 'Phone/Components/Facts' }
export default meta

export const Cards: StoryObj = {
  name: 'Cards and buttons',
  render: () => (
    <PhoneFrame height={470}>
      <div className="flex flex-col gap-5 p-4">
        <FactCard label="Schedule">{schedule.map((f) => <FactRow key={f.id} fact={f} onOpen={noop} />)}</FactCard>
        <FactCard label="Details">{details.map((f) => <FactRow key={f.id} fact={f} onOpen={noop} />)}</FactCard>
        <FactChips label="Add" facts={unset} onOpen={noop} />
      </div>
    </PhoneFrame>
  ),
}

export const Fixed: StoryObj = {
  name: 'Read, not edited',
  render: () => (
    <PhoneFrame height={240}>
      <div className="p-4">
        <FactCard label="Schedule">
          <FactRow fact={{ ...schedule[0], value: 'Overdue, 12 Oct', tone: 'text-danger', fixed: true }} onOpen={noop} />
          <FactRow fact={{ ...schedule[1], fixed: true }} onOpen={noop} />
          <FactRow fact={{ id: 'origin', label: 'Origin', icon: 'link', value: 'Email from Ana', fixed: true }} onOpen={noop} />
        </FactCard>
      </div>
    </PhoneFrame>
  ),
}
