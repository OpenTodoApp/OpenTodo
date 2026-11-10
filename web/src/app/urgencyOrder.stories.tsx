import type { Meta, StoryObj } from '@storybook/react-vite'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { setBlockedBy } from '../lib/dependencies'
import { setListDisplay } from '../lib/listDisplay'
import { createSubtask, createTask } from '../lib/ops'
import { seedBase, seeded, storyUser, TODAY, TOMORROW, withSeed } from './stories/fixtures'
import { TaskListView } from './TaskListView'

// The urgency order (OpenSpec change urgency-sort, design D4): a project ordered by
// urgency, each top-level row with its score in the row's end (none on a phone), and
// the breakdown a score opens.
const meta: Meta = { title: 'Screens/Urgency order' }
export default meta

async function seedUrgency(): Promise<void> {
  await seedBase()
  const p = seeded.website
  const copy = await createTask({ title: 'Finish the homepage copy', due: { date: TODAY }, priority: 1, project_id: p, deadline: '2026-10-17' })
  const review = await createTask({ title: 'Review the pricing page', due: { date: TOMORROW }, priority: 2, project_id: p })
  await createTask({ title: 'Send the launch email', due: { date: '2026-10-21' }, project_id: p })
  const shots = await createTask({ title: 'Take the product screenshots', priority: 3, project_id: p })
  await createSubtask(shots, 'Light theme')
  await createTask({ title: 'Write the changelog', project_id: p })
  await createTask({ title: 'Plan the follow-up post', start: 'someday', project_id: p })
  await setBlockedBy(review, [copy])
  await setListDisplay({ kind: 'project', id: p }, { sortBy: 'urgency', sortDir: 'asc' })
}

function Column({ children }: { children: ReactNode }) {
  return <div className="-m-4 h-[44rem] overflow-y-auto bg-canvas">{children}</div>
}

/** Website launch ordered by urgency: the score at each top-level row's end. */
export const ProjectByUrgency: StoryObj = {
  ...withSeed(seedUrgency),
  render: () => <Column><TaskListView route={{ view: 'project', id: seeded.website }} userId={storyUser.id} userRole={storyUser.role} /></Column>,
}

/** Opens the first row's score as the keyboard does (Enter), once the chips are drawn; on a phone the row has none. */
function OpenFirst({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  const [done, setDone] = useState(false)
  useEffect(() => {
    let stop = false
    const started = Date.now()
    const tick = () => {
      if (stop) return
      if (document.querySelector('[data-urgency-breakdown]')) { setDone(true); return }
      const chip = root.current?.querySelector<HTMLButtonElement>('[data-urgency-chip]')
      if (chip && chip.offsetParent !== null) chip.click()
      // A phone draws no score: the list itself is the picture.
      else if (root.current?.querySelector('[data-task-id]') && (matchMedia('(max-width: 639px)').matches || Date.now() - started > 3000)) { setDone(true); return }
      setTimeout(tick, 50)
    }
    tick()
    return () => { stop = true }
  }, [])
  return <div ref={root}>{children}{!done && <span data-story-pending />}</div>
}

/** The breakdown of "Finish the homepage copy": due today, deadline, priority 1 and the task it blocks. */
export const BreakdownOpen: StoryObj = {
  ...withSeed(seedUrgency),
  render: () => <Column><OpenFirst><TaskListView route={{ view: 'project', id: seeded.website }} userId={storyUser.id} userRole={storyUser.role} /></OpenFirst></Column>,
}
