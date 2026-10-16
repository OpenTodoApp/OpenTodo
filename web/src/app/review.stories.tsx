import type { Meta, StoryObj } from '@storybook/react-vite'
import { createProject, createTask, setTaskCompleted } from '../lib/ops'
import { db } from '../lib/db'
import type { EmailDigest, Task } from '../lib/types'
import { DigestView, type DigestState } from './DigestCard'
import { Bars } from './review/Bars'
import { ReviewView } from './review/ReviewView'
import { StatsContent } from './review/StatsView'
import { HEX, project, seeded, task, TODAY, withClock, withSeed } from './stories/fixtures'

// Statistics, the weekly review and the digest card (OpenSpec change
// stats-and-review): the screens on design tokens, light and dark, at 375 px and
// 1280 px, checked by the a11y and visual gates. Charts print every value, so
// colour never carries meaning alone.
const meta: Meta = { title: 'Screens/Review and statistics' }
export default meta

const at = (d: number, h = 10) => new Date(2026, 9, d, h).getTime()
const projects = [
  project({ id: 'work', name: 'Work', color: HEX.blue }), project({ id: 'home', name: 'Home', color: HEX.green }),
  project({ id: 'health', name: 'Health', color: HEX.red }),
]
const done = (id: string, day: number, projectId: string | null, due?: number): Task =>
  task({ id, title: `Done ${id}`, project_id: projectId, completed_at: at(day), created_at: at(day - 3), due: due ? { date: `2026-10-${String(due).padStart(2, '0')}` } : null })
const rows: Task[] = [
  done('a', 12, 'work'), done('b', 12, 'home'), done('c', 13, 'work', 12), done('d', 13, 'health'), done('e', 14, 'work'),
  done('f', 6, 'home'), done('g', 7, 'work'), done('h', 8, 'work', 6), done('i', 1, 'home'),
  task({ id: 'o1', title: 'Send the invoice to Northwind', project_id: 'work', due: { date: '2026-10-12' }, created_at: at(10) }),
  task({ id: 'o2', title: 'Book the dentist', project_id: 'health', due: { date: '2026-10-13' }, created_at: at(13) }),
]

/** This week on a Wednesday: numbers, per-day and per-project charts, late and slipped lists. */
export const StatisticsThisWeek: StoryObj = {
  decorators: [withClock],
  render: () => <StatsContent tasks={rows} projects={projects} memberships={[]} me="u-ada" today={TODAY} weekStart={1} period="this-week" onPeriod={() => {}} />,
}

/** The last four weeks: per-week and per-weekday charts join. */
export const StatisticsFourWeeks: StoryObj = {
  decorators: [withClock],
  render: () => <StatsContent tasks={rows} projects={projects} memberships={[]} me="u-ada" today={TODAY} weekStart={1} period="4-weeks" onPeriod={() => {}} />,
}

/** Nothing completed yet: zeros and a hint instead of empty charts. */
export const StatisticsEmpty: StoryObj = {
  decorators: [withClock],
  render: () => <StatsContent tasks={[]} projects={[]} memberships={[]} me="u-ada" today={TODAY} weekStart={1} period="this-week" onPeriod={() => {}} />,
}

/** The bar chart on its own, with a zero bar. */
export const BarChart: StoryObj = {
  render: () => (
    <div className="max-w-md">
      <Bars title="Completed per day" bars={[{ label: 'Mon', value: 3 }, { label: 'Tue', value: 0 }, { label: 'Wed', value: 5 }, { label: 'Thu', value: 1 }]} />
    </div>
  ),
}

async function seedReview() {
  seeded.work = await createProject({ name: 'Work', color: HEX.blue })
  seeded.garage = await createProject({ name: 'Garage', color: HEX.orange })
  await createTask({ title: 'Renew passport', priority: 2 })
  await createTask({ title: 'Reply to Mara about the workshop' })
  await createTask({ title: 'Send the invoice to Northwind', project_id: seeded.work, due: { date: '2026-10-12' }, priority: 1 })
  const sweep = await createTask({ title: 'Sweep the floor', project_id: seeded.garage })
  await setTaskCompleted(sweep, true)
  await db.review.put({ id: 'me', completed_at: new Date('2026-10-05T18:00:00').getTime(), _clock: {} })
}

/** The review on its first unfinished step, Get clear, with two Inbox tasks. */
export const WeeklyReview: StoryObj = {
  ...withSeed(seedReview),
  render: () => <ReviewView userId="u-ada" />,
}

const digest: EmailDigest = {
  available: true, encryption: false, enabled: true, weekday: 5, hour: 7, timeZone: 'Europe/Zurich', language: 'de',
  nextSendAt: new Date('2026-10-16T07:00:00').getTime(), lastOutcome: 'sent', lastSentFor: '2026-10-09', lastAttemptAt: null,
}
const noop = () => {}
const card = (state: DigestState, extra: { editing?: boolean; demo?: boolean } = {}) => (
  <DigestView state={state} demo={!!extra.demo} busy={false} editing={!!extra.editing} draft={{ weekday: 5, hour: 7 }}
    capture={{ timeZone: 'Europe/Zurich', language: 'de' }} error={null}
    onToggle={noop} onEdit={noop} onCancel={noop} onDraft={noop} onSave={noop} />
)

export const DigestOn: StoryObj = { decorators: [withClock], render: () => card({ kind: 'ready', digest }) }
export const DigestChange: StoryObj = { decorators: [withClock], render: () => card({ kind: 'ready', digest: { ...digest, enabled: false, lastOutcome: undefined } }, { editing: true }) }
export const DigestUnavailable: StoryObj = { decorators: [withClock], render: () => card({ kind: 'ready', digest: { ...digest, available: false } }) }
export const DigestEncrypted: StoryObj = { decorators: [withClock], render: () => card({ kind: 'ready', digest: { ...digest, encryption: true } }) }
export const DigestOffline: StoryObj = { decorators: [withClock], render: () => card({ kind: 'offline' }) }
