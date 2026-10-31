import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { SegmentedControl } from './SegmentedControl'

const meta: Meta = { title: 'UI/Segmented control' }
export default meta

type Scope = 'this' | 'all'

function Scoped({ initial }: { initial: Scope }) {
  const [value, setValue] = useState<Scope>(initial)
  return (
    <SegmentedControl label="Edit scope" value={value} onChange={setValue}
      options={[{ id: 'this', label: 'This occurrence' }, { id: 'all', label: 'All occurrences' }]} />
  )
}

/** The occurrence panel's scope (series-exceptions D5): This occurrence selected, as opened from a projection. */
export const ThisOccurrence: StoryObj = {
  render: () => <div className="w-80 bg-surface p-4"><Scoped initial="this" /></div>,
}

/** Opened from the series row: All occurrences selected; arrow keys move the choice. */
export const AllOccurrences: StoryObj = {
  render: () => <div className="w-80 bg-surface p-4"><Scoped initial="all" /></div>,
}

/** Three options, and disabled (a viewer of the shared project). */
export const ThreeAndDisabled: StoryObj = {
  render: () => (
    <div className="flex w-96 flex-col items-start gap-3 bg-surface p-4">
      <SegmentedControl label="Span" value="week" onChange={() => {}}
        options={[{ id: 'day', label: 'Day' }, { id: 'week', label: 'Week' }, { id: 'month', label: 'Month' }]} />
      <SegmentedControl label="Edit scope" value="this" onChange={() => {}} disabled
        options={[{ id: 'this', label: 'This occurrence' }, { id: 'all', label: 'All occurrences' }]} />
    </div>
  ),
}
