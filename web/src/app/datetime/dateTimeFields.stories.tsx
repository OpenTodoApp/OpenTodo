import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { quickChoices, resolveDateTime } from '../../lib/dates'
import { withClock } from '../stories/fixtures'
import { DatePicker } from './DatePicker'
import { CalendarGrid, DateField } from './DateField'
import { TimeField } from './TimeField'

// Date and time fields of task editing (OpenSpec change date-time-preferences, design D4).
const meta: Meta = { title: 'Task/Date and time fields' }
export default meta

const SYS = { order: 'MD' as const, hour12: true, weekStart: 1 }

function Fields() {
  const [date, setDate] = useState<string | null>('2026-11-03')
  const [time, setTime] = useState<string | null>('15:00')
  return (
    <div className="flex max-w-md flex-wrap items-start gap-2">
      <DateField label="Due date" className="min-w-44 flex-1" value={date} onChange={setDate} />
      <TimeField label="Due time" value={time} onChange={setTime} />
    </div>
  )
}

export const DueDateAndTime: StoryObj = { render: () => <Fields /> }

export const CalendarMondayStart: StoryObj = {
  render: () => (
    <div className="w-72 rounded-lg border border-default bg-surface p-3">
      <CalendarGrid value="2026-10-16" today="2026-10-14" prefs={resolveDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, SYS)} onPick={() => {}} />
    </div>
  ),
}

export const CalendarSundayStart: StoryObj = {
  render: () => (
    <div className="w-72 rounded-lg border border-default bg-surface p-3">
      <CalendarGrid value={null} today="2026-10-14" prefs={resolveDateTime({ date_format: 'month-day', time_format: '12h', week_start: 'sun' }, SYS)} onPick={() => {}} />
    </div>
  ),
}

/** The When popover's date picker (task-panel-polish): quick choices, the date in words, the calendar. */
function Picker({ kind, initial }: { kind: 'due' | 'start' | 'deadline'; initial: string | null }) {
  const [value, setValue] = useState<string | null>(initial)
  return (
    <div className="w-[28rem] max-w-full rounded-lg border border-default bg-surface p-3">
      <DatePicker label="Due date" value={value} onChange={setValue} choices={quickChoices(kind, '2026-10-14')} />
    </div>
  )
}

export const DatePickerDoOn: StoryObj = { decorators: [withClock], render: () => <Picker kind="due" initial="2026-10-15" /> }
export const DatePickerDeadlineEmpty: StoryObj = { decorators: [withClock], render: () => <Picker kind="deadline" initial={null} /> }
