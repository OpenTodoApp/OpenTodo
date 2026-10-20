import type { Meta, StoryObj } from '@storybook/react-vite'
import { createProject, createTask, mutate } from '../../lib/ops'
import { setCurrentUserId } from '../../lib/sharing'
import { FOCUS_DEFAULTS } from '../../lib/focus/prefs'
import { writeFocus } from '../../lib/focus/state'
import { finish, idleState, start } from '../../lib/focus/timer'
import { HEX, seeded, storyUser, TODAY, withSeed } from '../stories/fixtures'
import { FocusView } from './FocusView'

// Core screen: Focus (OpenSpec change focus-mode, design D14): one task with its
// notes and subtasks and a large timer; light and dark at 375 px and 1280 px,
// checked by the a11y and visual gates. The clock is frozen, so the digits hold.
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

/** A Pomodoro work session ten minutes in: 15:00 left, session 1 of 4. */
export const Running: StoryObj = {
  ...withSeed(async () => {
    const id = await seedTask()
    await writeFocus(start(idleState(id, 'pomodoro', Date.now()), Date.now() - 10 * MIN, FOCUS_DEFAULTS))
  }),
  render: () => <FocusView />,
}

/** The session ended: 25:00 worked, the break, completing the task or the next task offered. */
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
