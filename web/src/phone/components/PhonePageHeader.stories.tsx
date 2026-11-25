import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button, MenuItem } from '../../ui'
import { PhoneFrame } from '../stories/frame'
import { noop } from '../stories/sample'
import { PhonePageHeader } from './PhonePageHeader'

// A page's header on a phone (phone-lists D3): the bar with the page's controls and menu, then the title large with its lead line.
const meta: Meta = { title: 'Phone/Components/Page header' }
export default meta

export const Day: StoryObj = {
  name: 'A day page with a briefing',
  render: () => (
    <PhoneFrame height={230}>
      <PhonePageHeader title="Today" meta="Wednesday 14 October · 3 of 5" briefing="One thing matters today. Send the invoice to Northwind." onMenu={noop}
        overflow={<MenuItem label="Select tasks" icon="list-checks" onSelect={noop} />} />
    </PhoneFrame>
  ),
}

export const WithControls: StoryObj = {
  name: 'With a control in the bar',
  render: () => (
    <PhoneFrame height={170}>
      <PhonePageHeader title="Inbox" meta="4 to sort" onMenu={noop} actions={<Button variant="secondary" size="sm" icon="inbox" onClick={noop}>Process 4</Button>}
        overflow={<MenuItem label="Select tasks" icon="list-checks" onSelect={noop} />} />
    </PhoneFrame>
  ),
}
