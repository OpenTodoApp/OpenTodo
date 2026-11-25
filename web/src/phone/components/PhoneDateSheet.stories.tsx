import type { Meta, StoryObj } from '@storybook/react-vite'
import { PhoneFrame, StorySheet } from '../stories/frame'
import { choices, noop, WEEKDAYS } from '../stories/sample'
import { PhoneDatePanel } from './PhoneDateSheet'

// The date sheet's panel (phone-ui-trial "Phone date sheet", D10): quick choices, the month, the time row.
const meta: Meta = { title: 'Phone/Components/Date sheet' }
export default meta

const month = (anchor: string) => new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date(`${anchor}T12:00:00`))
const time = <div className="flex min-h-11 items-center px-3 text-prose text-strong">Time<span className="ml-auto text-muted">None</span></div>
const clear = <span className="px-2 text-body text-danger">Clear</span>

function Sheet({ value, someday = false, width, height }: { value: string | null; someday?: boolean; width?: number; height?: number }) {
  const list = someday ? [...choices, { id: 'someday', label: 'Someday', icon: 'moon' as const, hint: '', date: 'someday' as const }] : choices
  return (
    <PhoneFrame width={width} height={height}>
      <StorySheet title="Do on" action={value ? clear : undefined}>
        <div className="px-4 pb-4">
          <PhoneDatePanel value={value} today="2026-10-14" choices={list} weekStart={1} weekdays={WEEKDAYS} monthName={month} onPick={noop} time={time} />
        </div>
      </StorySheet>
    </PhoneFrame>
  )
}

export const NoDate: StoryObj = { name: 'No date', render: () => <Sheet value={null} /> }
export const Chosen: StoryObj = { name: 'A date chosen', render: () => <Sheet value="2026-10-15" /> }
export const SixWeeks: StoryObj = { name: 'A six-week month', render: () => <Sheet value="2026-08-31" /> }
export const WithSomeday: StoryObj = { name: 'From a row, with Someday', render: () => <Sheet value="2026-10-17" someday /> }
export const SmallPhone: StoryObj = { name: 'On a 360 by 640 screen', render: () => <Sheet value="2026-10-15" width={360} height={640} /> }
