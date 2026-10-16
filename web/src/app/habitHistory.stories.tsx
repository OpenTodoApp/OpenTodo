import type { Meta, StoryObj } from '@storybook/react-vite'
import { occurrenceId } from '../lib/ids'
import type { Task } from '../lib/types'
import { HabitHistory } from './HabitHistory'
import { TODAY, withClock } from './stories/fixtures'

// Habit month history (OpenSpec change habits, design D4): the read-only grid in the
// detail panel's repeat field, with every state on design tokens and a glyph or
// border besides colour. Checked in light and dark by the a11y and visual gates,
// at 375 px (the panel on a phone) and 1280 px.
const meta: Meta = { title: 'Screens/Habit history', decorators: [withClock] }
export default meta

function task(over: Partial<Task>): Task {
  return {
    id: 'x', title: 'Stretch', description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [], position: 0,
    created_at: 1, completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null,
    assignee_id: null, section_id: null, ical_extra: null, _clock: {}, ...over,
  }
}

function history(rule: string, due: string, records: Record<string, 'done' | 'skipped'>) {
  const series = task({ id: 'habit-story', recurrence: rule, due: { date: due }, habit: true })
  const rows = Object.entries(records).map(([date, state]) => task({
    id: occurrenceId(series.id, date), series_id: series.id, due: { date }, completed_at: 1, skipped: state === 'skipped',
  }))
  return { series, rows }
}

/** Every weekday in October: done, a skipped Tuesday, a missed Thursday, today pending, the rest upcoming. */
export const Weekdays: StoryObj = {
  render: () => {
    const { series, rows } = history('every weekday', TODAY, {
      '2026-10-01': 'done', '2026-10-02': 'done', '2026-10-05': 'done', '2026-10-06': 'skipped', '2026-10-07': 'done',
      '2026-10-09': 'done', '2026-10-12': 'done', '2026-10-13': 'done',
    })
    return <div className="max-w-sm"><HabitHistory series={series} records={rows} today={TODAY} /></div>
  },
}

/** Mondays, Wednesdays and Fridays: unscheduled days stay blank. */
export const ThreeDaysAWeek: StoryObj = {
  render: () => {
    const { series, rows } = history('every mon, wed, fri', '2026-10-16', {
      '2026-10-02': 'done', '2026-10-05': 'done', '2026-10-07': 'done', '2026-10-09': 'skipped', '2026-10-12': 'done', '2026-10-14': 'done',
    })
    return <div className="max-w-sm"><HabitHistory series={series} records={rows} today={TODAY} /></div>
  },
}
