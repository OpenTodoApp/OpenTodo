import type { Meta, StoryObj } from '@storybook/react-vite'
import { useLabels, useProjects, useTask } from '../../lib/localData'
import { seedInbox, seeded, withSeed } from '../stories/fixtures'
import { TaskFacts } from './TaskFacts'

// The task page's facts column (task-full-page D1, D7): Schedule, Details, Labels and
// Project, unset facts as quiet actions. From the local data a seed writes.
const meta: Meta = { title: 'Task/Facts' }
export default meta

function SeededFacts({ readOnly = false }: { readOnly?: boolean }) {
  const task = useTask(seeded.inboxTask)
  const projects = useProjects()
  const labels = useLabels()
  if (!task) return null
  return (
    <div className="w-80 rounded-card border border-default bg-surface p-4">
      <TaskFacts task={task} userId="u-ada" readOnly={readOnly} projects={projects} labelMap={new Map(labels.map((l) => [l.id, l]))} childCount={0} />
    </div>
  )
}

export const Facts: StoryObj = { ...withSeed(seedInbox), render: () => <SeededFacts /> }
export const Viewer: StoryObj = { ...withSeed(seedInbox), render: () => <SeededFacts readOnly /> }
