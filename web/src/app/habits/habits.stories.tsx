import type { Meta, StoryObj } from '@storybook/react-vite'
import type { DayCell, DayState } from '../../lib/habits'
import { completeTask, createTask, mutate, updateTask } from '../../lib/ops'
import { setHabitsOn } from '../../lib/habitPrefs'
import { addDaysISO } from '../../lib/dates'
import { checkIn, setDayNote, setPastDay } from '../../lib/habitActions'
import { occurrenceId } from '../../lib/ids'
import { useEffect } from 'react'
import ReviewHabits from '../review/ReviewHabits'
import { offerNote } from './checkInNoteStore'
import { DayNoteDialog } from './DayNoteDialog'
import { TODAY, withClock, withSeed } from '../stories/fixtures'
import { TaskListView } from '../TaskListView'
import { useLiveTasks } from '../../lib/liveTasks'
import { db } from '../../lib/db'
import { HabitFormDialog } from './HabitForm'
import { HabitPage } from './HabitPage'
import HabitsScreen from './HabitsScreen'
import { Thread } from './Thread'

// Habits (OpenSpec changes habits-home and habits-polish) on the frozen Wednesday 14
// October 2026: the Habits screen by part of the day with a graduated habit, its empty
// state with the starters, Today's habits line, a habit's page, the habit form, and
// the thread in every state; with habit-notes the "How did it go?" line, a page with
// the habit's note and its Check-ins, a day's note asking for the state, and Habits
// in the weekly review (the visual baselines
// render each in every built-in theme, light and dark, and at 360 px).
const meta: Meta = { title: 'Screens/Habits' }
export default meta

async function habit(title: string, rule: string, due: string, extra: Record<string, unknown> = {}): Promise<string> {
  const id = await createTask({ title, due: { date: due }, recurrence: rule })
  await updateTask(id, { habit: true, ...extra })
  return id
}

async function seedHabits(): Promise<void> {
  await mutate('user_prefs', 'me', { habits: 'on' })
  const run = await habit('Run', 'every mon, wed, fri', '2026-10-05', { day_part: 'morning', habit_anchor: 'After coffee', habit_tiny: 'Shoes on, out the door' })
  for (const d of ['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12']) await completeTask(run, { today: d })
  const read = await habit('Read', 'every day', '2026-10-01', { evening: true, habit_anchor: 'After dinner', habit_tiny: 'One page' })
  for (let d = 1; d <= 13; d++) {
    const day = `2026-10-${String(d).padStart(2, '0')}`
    if (d === 9 || d === 10) continue
    await completeTask(read, { today: day })
  }
  await setPastDay(read, '2026-10-11', 'tiny', 1, TODAY)
  const water = await habit('Drink water', 'every day', '2026-10-12', { habit_tiny: 'One glass' })
  await completeTask(water, { today: '2026-10-12' })
  await completeTask(water, { today: '2026-10-13' })
  await checkIn(water, true, { today: TODAY })
  await habit('Stretch', 'every weekday', '2026-10-14', { day_part: 'afternoon' })
  // A long title stays on one line (habits-polish D2); a weekly habit due later still has its button.
  await habit('Practise the Bach cello suite in G major, first movement', 'every day', '2026-10-14', { habit_color: '#8b5cf6' })
  await habit('Call home', 'every sun', '2026-10-18')
  await habit('Floss', 'every day', '2026-09-01', { habit_graduated_at: 1 })
}

/** The screen: Morning, Afternoon, This Evening, Any time, and the folded Graduated group. */
export const Screen: StoryObj = {
  ...withSeed(seedHabits),
  render: () => <div className="-m-4 bg-canvas"><HabitsScreen /></div>,
}

/** No habit yet: three starters, no illustration. */
export const Empty: StoryObj = {
  ...withSeed(async () => { await setHabitsOn(true) }),
  render: () => <div className="-m-4 bg-canvas"><HabitsScreen /></div>,
}

/** Today with Habits on: one quiet line above the tasks, a habit kept today with a filled ring. */
export const TodayStrip: StoryObj = {
  ...withSeed(async () => {
    await seedHabits()
    await createTask({ title: 'Send the invoice', due: { date: TODAY } })
  }),
  render: () => <div className="-m-4 bg-canvas"><TaskListView route={{ view: 'today' }} /></div>,
}

const week = (states: DayState[]): DayCell[] => states.map((state, i) => ({ date: addDaysISO(TODAY, i - 6), state, today: i === 6 }))

/** Every state of the thread: done and joined, tiny, a dotted skip, a miss, two misses (thin), and today's ring and filled mark. */
export const ThreadStates: StoryObj = {
  decorators: [withClock],
  render: () => (
    <div className="space-y-3" data-hue="teal">
      <Thread days={week(['done', 'done', 'skipped', 'missed', 'done', 'tiny', 'pending'])} today={TODAY} label="A week with a skip and a miss" />
      <Thread days={week(['done', 'missed', 'missed', 'done', 'blank', 'done', 'done'])} today={TODAY} label="Two misses, then back on track" />
      <Thread days={week(['blank', 'done', 'blank', 'done', 'blank', 'missed', 'pending'])} today={TODAY} label="Three days a week" />
    </div>
  ),
}

/** Read's own page (habits-polish D3): facts, the tiny version, its numbers, Check in and the month history. */
export const Page: StoryObj = {
  ...withSeed(seedHabits),
  render: () => <div className="-m-4 bg-canvas"><ByTitle title="Read" render={(id) => <HabitPage id={id} />} /></div>,
}

/** Edit habit (habits-polish D4): the lean form with Colour and the "?" after Tiny version and After. */
export const Form: StoryObj = {
  ...withSeed(seedHabits),
  render: () => <ByTitle title="Read" render={(id, task) => <HabitFormDialog req={{ taskId: id }} task={task} />} />,
}

function ByTitle({ title, render }: { title: string; render: (id: string, task: NonNullable<ReturnType<typeof useLiveTasks>>[number]) => React.ReactNode }) {
  const task = useLiveTasks()?.find((x) => x.title === title && !x.series_id)
  return task ? <>{render(task.id, task)}</> : null
}

/** Notes on Run (habit-notes): the habit's own note and three check-in notes, one of them a week back. */
async function seedNotes(): Promise<void> {
  await seedHabits()
  const run = (await db.tasks.filter((x) => x.title === 'Run' && !x.series_id).first())!.id
  await updateTask(run, { description: 'Training for the 10k in March. Easy pace, no watch.' })
  await setDayNote(occurrenceId(run, '2026-10-12'), '5k, knee a bit sore')
  await setDayNote(occurrenceId(run, '2026-10-09'), 'Rain the whole way. **Still went.**')
  await setDayNote(occurrenceId(run, '2026-10-05'), 'First run in a month')
}

/** After a check-in (habit-notes D2): one quiet "How did it go?" line under the row. */
export const CheckInLine: StoryObj = {
  ...withSeed(seedHabits),
  render: () => <div className="-m-4 bg-canvas"><Offer title="Drink water" /><HabitsScreen /></div>,
}

/** Run's page with its own note first, note marks in the grid and Check-ins newest first (habit-notes D3). */
export const PageWithCheckIns: StoryObj = {
  ...withSeed(seedNotes),
  render: () => <div className="-m-4 bg-canvas"><ByTitle title="Run" render={(id) => <HabitPage id={id} />} /></div>,
}

/** Note on a missed day (habit-notes D2): the day's state is asked for first. */
export const DayNoteState: StoryObj = {
  ...withSeed(seedHabits),
  render: () => <ByTitle title="Read" render={(id) => <DayNoteDialog seriesId={id} date="2026-10-10" onClose={() => {}} />} />,
}

/** Look back in the weekly review (habit-notes D6): each habit's week, its measure and the week's notes. */
export const WeeklyReviewHabits: StoryObj = {
  ...withSeed(seedNotes),
  render: () => <div className="max-w-xl"><ReviewHabits today={TODAY} weekStart={1} /></div>,
}

function Offer({ title }: { title: string }) {
  const id = useLiveTasks()?.find((x) => x.title === title && !x.series_id)?.id
  useEffect(() => { if (id) offerNote(id, occurrenceId(id, TODAY)) }, [id])
  return null
}
