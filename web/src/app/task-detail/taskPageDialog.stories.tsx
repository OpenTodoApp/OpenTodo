import type { Meta, StoryObj } from '@storybook/react-vite'
import type { Task } from '../../lib/types'
import { TaskPageDialog } from './TaskPageDialog'

// Publishing a task page from the task panel (OpenSpec task-pages, "Publishing from
// the task panel"): the first publish, and the status of an active page.
const task = { id: 't1', title: 'Paint the fence', project_id: null, parent_id: null, location: { name: 'Garden', lat: 45.07, lon: 7.69 } } as unknown as Task

const meta: Meta<typeof TaskPageDialog> = {
  title: 'Task panel/Task page dialog',
  component: TaskPageDialog,
  args: { task, onClose: () => {} },
}
export default meta
type Story = StoryObj<typeof TaskPageDialog>

export const Publish: Story = { args: { status: null } }
export const ActivePage: Story = {
  args: {
    status: { id: 'p1', taskId: 't1', rights: 'tick', label: 'paint-the-fence', includeMap: true, createdBy: 'u1', publishedAt: Date.parse('2026-10-12T09:30:00'),
      expiresAt: null, lastOpenedAt: Date.parse('2026-10-14T08:10:00'), replies: 2, ticks: 1, encrypted: false, snapshotAt: null, pendingReplies: 0 },
  },
}
