import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { DISPLAY_KINDS, defaultListDisplay, isDefaultDisplay, type BuiltinDisplayKind, type ListDisplay } from '../../lib/listDisplay'
import { DisplayOptionsBody } from './DisplayOptionsBody'

// The Display options panel of Today, Upcoming and the Inbox (OpenSpec change
// builtin-view-options D2, D7): each view's own parts, Nest subtasks on Today and
// Upcoming, and Reset while an option differs from the view's default.
const meta: Meta = { title: 'Screens/Built-in view display' }
export default meta

function Panel({ kind, start }: { kind: BuiltinDisplayKind; start: Partial<ListDisplay> }) {
  const [value, setValue] = useState<ListDisplay>({ ...defaultListDisplay(kind), ...start })
  const k = DISPLAY_KINDS[kind]
  return (
    <div className="w-[22rem] rounded-card border border-strong bg-pop">
      <DisplayOptionsBody<ListDisplay> value={value} onChange={(patch) => setValue({ ...value, ...patch })}
        groupOptions={k.groups} sortOptions={k.sorts}
        onReset={isDefaultDisplay(kind, value, 'line') ? undefined : () => setValue(defaultListDisplay(kind))} />
    </div>
  )
}

/** Today grouped by project, by priority, with nested subtasks: Reset at the foot. */
export const Today: StoryObj = { render: () => <Panel kind="today" start={{ groupBy: 'project', sortBy: 'priority', subtasks: true }} /> }

/** Upcoming at its defaults: no Group by, no Reset. */
export const Upcoming: StoryObj = { render: () => <Panel kind="upcoming" start={{}} /> }

/** The Inbox by label: no Nest subtasks, its tasks are always a tree. */
export const Inbox: StoryObj = { render: () => <Panel kind="inbox" start={{ groupBy: 'label' }} /> }
