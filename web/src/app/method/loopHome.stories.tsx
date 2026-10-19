import type { Meta, StoryObj } from '@storybook/react-vite'
import { db } from '../../lib/db'
import { createLabel } from '../../lib/labels'
import { createProject, createTask, REVIEW_DEFAULTS, setTaskCompleted } from '../../lib/ops'
import { setMethodMode } from '../../lib/method/mode'
import { HEX, seeded, withClock, withSeed } from '../stories/fixtures'
import { LoopHome, LoopSkeleton } from './LoopHome'

// The Loop home (OpenSpec change loop-home-refresh; open-loops "Loop home" and
// "Loop pulse"): the capture field, the five moves on one rail with the next move
// lit, today's focus with its progress and the Loop pulse, over seeded local rows.
// Light and dark, 375 and 1280 px, through the a11y and visual gates.
const meta: Meta = { title: 'Screens/Loop home' }
export default meta

const at = (daysAgo: number, hour = 10) => new Date(2026, 9, 14 - daysAgo, hour).getTime()

/** A task created `createdAgo` days ago, in a project or the Inbox, done `doneAgo` days ago when given. */
async function seedTask(title: string, createdAgo: number, project: string | null = null, doneAgo: number | null = null, labels: string[] = []) {
  const id = await createTask({ title, project_id: project, labels })
  await db.tasks.update(id, { created_at: at(createdAgo) })
  if (doneAgo !== null) { await setTaskCompleted(id, true); await db.tasks.update(id, { completed_at: at(doneAgo, 16) }) }
  return id
}

async function seedBusy() {
  await setMethodMode('first')
  seeded.home = await createProject({ name: 'Home renovation', color: HEX.orange })
  seeded.work = await createProject({ name: 'Work', color: HEX.blue })
  await createProject({ name: 'Side project', color: HEX.violet })
  seeded.calls = await createLabel({ name: '@calls', color: HEX.teal })
  for (let i = 0; i < 8; i++) await seedTask(['Renew passport', 'Idea for the garden', 'Call back the insurance', 'Read the contract', 'Birthday present for Mara', 'Fix the bike light', 'Ask Ana about the launch date', 'Book the dentist'][i], [6, 5, 4, 3, 2, 1, 0, 0][i])
  const quotes = await seedTask('Get three quotes for the kitchen', 12, seeded.home)
  const reply = await seedTask('Reply to Ana about the launch date', 3, seeded.work, null, [seeded.calls])
  await seedTask('Draft the Q4 plan outline', 2, seeded.work)
  for (let i = 0; i < 9; i++) await seedTask(`Done ${i}`, 13, seeded.work, [13, 12, 12, 10, 9, 9, 6, 3, 1][i])
  for (let i = 0; i < 4; i++) await seedTask(`Finished ${i}`, 5, null, [3, 2, 1, 0][i])
  await db.review.put({ ...REVIEW_DEFAULTS, id: 'me', completed_at: at(9), monthly_at: at(20), focus_date: '2026-10-14', focus: `${quotes},${reply}`, _clock: {} })
  await setTaskCompleted(quotes, true)
}

async function seedClosed() {
  await setMethodMode('first')
  seeded.home = await createProject({ name: 'Home renovation', color: HEX.orange })
  seeded.work = await createProject({ name: 'Work', color: HEX.blue })
  const plan = await seedTask('Draft the Q4 plan outline', 2, seeded.work)
  const plumber = await seedTask('Call the plumber back', 1, seeded.home)
  for (let i = 0; i < 12; i++) await seedTask(`Done ${i}`, 13, i % 2 ? seeded.work : seeded.home, [13, 12, 11, 10, 9, 8, 7, 5, 4, 3, 1, 0][i])
  await db.review.put({ ...REVIEW_DEFAULTS, id: 'me', completed_at: at(2), daily_at: at(0, 8), monthly_at: at(20), focus_date: '2026-10-14', focus: `${plan},${plumber}`, _clock: {} })
}

/** A busy morning: eight in the Inbox, Clarify lit, one project stalled, a focus of two with one done, the pulse. */
export const BusyMorning: StoryObj = {
  ...withSeed(seedBusy),
  render: () => <LoopHome />,
}

/** A closed loop: done marks on Catch, Clarify and Place, Do lit, nothing due, the closed line. */
export const LoopClosed: StoryObj = {
  ...withSeed(seedClosed),
  render: () => <LoopHome />,
}

/** The loading state has the final layout's shape, so nothing shifts when the rows arrive. */
export const Loading: StoryObj = {
  decorators: [withClock],
  render: () => <LoopSkeleton />,
}
