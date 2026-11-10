import type { Meta, StoryObj } from '@storybook/react-vite'
import { createProject, createTask, mutate } from '../../lib/ops'
import { setCurrentUserId } from '../../lib/sharing'
import { FOCUS_DEFAULTS } from '../../lib/focus/prefs'
import { writeFocus } from '../../lib/focus/state'
import { finish, idleState, start, takeBreak } from '../../lib/focus/timer'
import { planEntry } from '../../lib/timeEntries'
import { mutateMany } from '../../lib/ops'
import { HEX, seeded, storyUser, TODAY, withSeed } from '../stories/fixtures'
import { FocusView } from './FocusView'
import { LengthDialog } from './FocusParts'
import FocusSessions from './FocusSessions'

// Core screen: Focus (OpenSpec changes focus-mode, design D14, and focus-redesign):
// the stage with one task, its next subtask and a large timer; a break; the done
// state; Today's sessions. Light and dark at 375 px and 1280 px, checked by the a11y
// and visual gates. The clock is frozen, so the digits hold.
const meta: Meta = { title: 'Screens/Focus' }
export default meta

const MIN = 60_000

async function seedTask(): Promise<string> {
  await setCurrentUserId(storyUser.id)
  const work = await createProject({ name: 'Work', color: HEX.blue })
  const id = await createTask({
    title: 'Write the quarterly report', project_id: work, due: { date: TODAY },
    description: 'Start from last quarter\'s numbers.\n\n- Revenue by region\n- The two hiring decisions',
  })
  await createTask({ title: 'Collect the numbers', parent_id: id })
  const done = await createTask({ title: 'Book the review meeting', parent_id: id })
  await mutate('task', done, { completed_at: Date.now() - 3600_000 })
  await mutate('review', 'me', { focus_date: TODAY, focus: id })
  seeded.focusTask = id
  return id
}

/** A Pomodoro work session ten minutes in: 15:00 left, Pomodoro · Work · 1 of 4, the next subtask on the stage. */
export const Running: StoryObj = {
  ...withSeed(async () => {
    const id = await seedTask()
    await writeFocus(start(idleState(id, 'pomodoro', Date.now()), Date.now() - 10 * MIN, FOCUS_DEFAULTS))
  }),
  render: () => <FocusView />,
}

/** The short break after the first session, two minutes in: the same stage, the title dimmed, End the break. */
export const Break: StoryObj = {
  ...withSeed(async () => {
    const id = await seedTask()
    const worked = finish(start(idleState(id, 'pomodoro', Date.now()), Date.now() - 27 * MIN, FOCUS_DEFAULTS), FOCUS_DEFAULTS)
    await writeFocus(takeBreak(worked, Date.now() - 2 * MIN, FOCUS_DEFAULTS))
  }),
  render: () => <FocusView />,
}

/** The session ended a minute ago: 25:00 worked, the break, completing the task, the next task, and +5 or +15 min (focus-everywhere D4). */
export const Done: StoryObj = {
  ...withSeed(async () => {
    const id = await seedTask()
    await writeFocus(finish(start(idleState(id, 'pomodoro', Date.now()), Date.now() - 26 * MIN, FOCUS_DEFAULTS), FOCUS_DEFAULTS))
  }),
  render: () => <FocusView />,
}

/** No focus chosen today: the picker is offered. */
export const ChooseATask: StoryObj = {
  ...withSeed(async () => {
    await setCurrentUserId(storyUser.id)
    await createTask({ title: 'Plan the week' })
  }),
  render: () => <FocusView />,
}

/** Countdown asks for its length: the presets as chips above the field (focus-everywhere D5). */
export const CountdownPresets: StoryObj = {
  render: () => <LengthDialog initial={25} presets={[10, 20, 40]} onStart={() => {}} onClose={() => {}} />,
}

/** Today's sessions from the menu: two Pomodoro sessions and a Flowtime one, newest first, with the count and the total. */
export const TodaysSessions: StoryObj = {
  ...withSeed(async () => {
    const id = await seedTask()
    const other = await createTask({ title: 'Inbox zero' })
    const start0 = new Date(`${TODAY}T09:00:00`).getTime()
    const entry = (n: number, task: string, mode: string, startAt: number, minutes: number) =>
      planEntry(`story-entry-${n}`, task, storyUser.id, 'story', startAt, startAt + minutes * MIN, '', Date.now(), { mode, session: 1, plannedEndAt: null })
    await mutateMany([
      entry(1, id, 'pomodoro', start0, 25),
      entry(2, id, 'pomodoro', start0 + 30 * MIN, 25),
      entry(3, other, 'flowtime', start0 + 90 * MIN, 40),
    ])
  }),
  render: () => <FocusSessions onClose={() => {}} />,
}
