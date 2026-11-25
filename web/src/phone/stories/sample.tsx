// Fixed data for the phone UI's stories (OpenSpec change phone-ui-trial, design D7):
// one day's tasks, events and a task's facts, in the words the app would show, so a
// story draws a component without the database.
import { IconButton } from '../../ui'
import type { FactModel } from '../components/FactRow'
import type { DateChoice } from '../components/PhoneDateSheet'
import type { PhoneRowModel } from '../components/PhoneRow'
import type { PhoneEvent, PhoneTodayGroup } from '../screens/PhoneTodayView'

export const noop = () => {}

/** Project colours as the stored hex values are. */
export const GREEN = '#2f9e6b', VIOLET = '#7c5cdb', RED = '#d9534f', BLUE = '#3b82c4'
export const Dot = ({ c }: { c: string }) => <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: c }} />

export const lateRows: PhoneRowModel[] = [
  { id: 't1', title: 'Send the invoice to Northwind', priority: 1, facts: [{ id: 'due', text: '12 Oct', tone: 'danger' }, { id: 'project', text: 'Work', mark: <Dot c={BLUE} /> }] },
  { id: 't2', title: 'Book the dentist', priority: 4, facts: [{ id: 'due', text: '13 Oct', tone: 'danger' }] },
]
export const todayRows: PhoneRowModel[] = [
  { id: 't3', title: 'Write the release notes', priority: 2, facts: [{ id: 'due', text: '09:30', tone: 'accent' }, { id: 'project', text: 'OpenTodo', mark: <Dot c={VIOLET} /> }] },
  { id: 't4', title: 'Call the bank about the card limit before the trip', priority: 4, facts: [{ id: 'due', text: '15:00', tone: 'accent' }, { id: 'subtasks', text: '1/3', icon: 'list-checks' }] },
  { id: 't5', title: 'Water the plants', priority: 4, facts: [{ id: 'repeat', text: 'every 3 days', icon: 'repeat' }, { id: 'project', text: 'Home', mark: <Dot c={GREEN} /> }] },
  { id: 't6', title: 'Stretch for ten minutes', priority: 3, facts: [{ id: 'project', text: 'Health', mark: <Dot c={RED} /> }] },
]
export const more = <IconButton icon="ellipsis" label="More actions" onClick={noop} className="touch-target" />
export const groups: PhoneTodayGroup[] = [
  { id: 'earlier', title: 'Earlier', tone: 'danger', rows: lateRows, count: lateRows.length, action: more },
  { id: 'today', title: 'Today', rows: todayRows, count: todayRows.length },
]
export const events: PhoneEvent[] = [
  { id: 'e1', title: 'Team stand-up', time: '10:00', color: BLUE },
  { id: 'e2', title: 'Lunch with Ana', time: '12:30', color: GREEN },
]

export const schedule: FactModel[] = [
  { id: 'due', label: 'Do', icon: 'sun', value: 'Tomorrow', tone: 'text-accent' },
  { id: 'deadline', label: 'Deadline', icon: 'hourglass', value: 'Fri 23 Oct' },
  { id: 'reminders', label: 'Reminder', icon: 'alarm-clock', value: '1 reminder' },
]
export const details: FactModel[] = [
  { id: 'project', label: 'Project', icon: 'folder', value: <span className="inline-flex items-center gap-1.5"><Dot c={GREEN} />Home</span> },
  { id: 'priority', label: 'Priority', icon: 'flag', value: 'Priority 2' },
  { id: 'labels', label: 'Labels', icon: 'tag', value: 'errand, papers' },
]
export const unset: Pick<FactModel, 'id' | 'label' | 'icon'>[] = [
  { id: 'repeat', label: 'Repeat', icon: 'repeat' },
  { id: 'estimate', label: 'Estimate', icon: 'clock' },
  { id: 'location', label: 'Location', icon: 'map-pin' },
  { id: 'assignee', label: 'Assignee', icon: 'user-check' },
]

export const choices: DateChoice[] = [
  { id: 'today', label: 'Today', icon: 'sun', hint: 'Wed 14 Oct', date: '2026-10-14' },
  { id: 'tomorrow', label: 'Tomorrow', icon: 'sunrise', hint: 'Thu 15 Oct', date: '2026-10-15' },
  { id: 'weekend', label: 'This weekend', icon: 'coffee', hint: 'Sat 17 Oct', date: '2026-10-17' },
  { id: 'next-week', label: 'Next week', icon: 'calendar-range', hint: 'Mon 19 Oct', date: '2026-10-19' },
]
export const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
