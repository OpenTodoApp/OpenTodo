import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { db } from '../../lib/db'
import { useTask } from '../../lib/localData'
import { createProject, createTask, updateTask } from '../../lib/ops'
import { setCurrentUserId } from '../../lib/sharing'
import { AssigneeChip } from '../AssigneePicker'
import { seeded, storyUser, withClock, withSeed } from '../stories/fixtures'
import RotationEditor from './RotationEditor'
import { RotationLine } from './RotationLine'

// Taking turns (OpenSpec change chore-rotation, design D5): the rotation editor in the
// Assignee popover, the "Takes turns" line under the Who facet and the row's
// assignee chip with its rotate mark. Check both themes and the phone width with
// the toolbar (Theme: Side by side, Width: 375).
const meta: Meta = { title: 'Task/Take turns', decorators: [withClock] }
export default meta

/** A household project shared by Ada, Ben and Cleo (Ben and Cleo through the group Adults). */
async function seedHousehold(rotation: string[]) {
  await setCurrentUserId(storyUser.id)
  const house = await createProject({ name: 'House' })
  await db.memberships.put({ projectId: house, role: 'owner', ownerId: storyUser.id, members: [
    { userId: storyUser.id, name: 'Ada', email: storyUser.email, role: 'owner' },
    { userId: 'u-ben', name: 'Ben', email: 'ben@example.com', role: 'editor', via: [{ id: 'g-adults' }] },
    { userId: 'u-cleo', name: 'Cleo', email: 'cleo@example.com', role: 'editor', via: [{ id: 'g-adults' }] },
  ] })
  await db.groups.put({ id: 'g-adults', workspaceId: 'w-home', name: 'Adults', members: ['u-ben', 'u-cleo'] })
  seeded.bins = await createTask({ title: 'Take out the bins', project_id: house, recurrence: 'every monday', due: { date: '2026-10-19' } })
  await updateTask(seeded.bins, { assignee_id: 'u-ben', rotation })
}

function PopoverBody({ children }: { children: ReactNode }) {
  return <div className="w-full max-w-[22rem] rounded-card border border-default bg-surface p-3 shadow-2">{children}</div>
}

function Editor() {
  const task = useTask(seeded.bins)
  return task ? <PopoverBody><RotationEditor task={task} userId={storyUser.id} onBack={() => {}} /></PopoverBody> : null
}

function Line() {
  const task = useTask(seeded.bins)
  return task ? <div className="max-w-md"><RotationLine task={task} userId={storyUser.id} /></div> : null
}

/** Nobody takes turns yet: the people picker and "Add everyone in Adults". */
export const Empty: StoryObj = { ...withSeed(() => seedHousehold([])), render: () => <Editor /> }

/** Ada, Ben and Cleo take turns; Ben holds this week's turn. */
export const Filled: StoryObj = { ...withSeed(() => seedHousehold([storyUser.id, 'u-ben', 'u-cleo'])), render: () => <Editor /> }

/** The panel line, with someone who left the project still in the list. */
export const PanelLine: StoryObj = { ...withSeed(() => seedHousehold([storyUser.id, 'u-ben', 'u-gone', 'u-cleo'])), render: () => <Line /> }

/** The row's assignee chip: plain, and marked as taking turns. */
export const RowChip: StoryObj = {
  render: () => (
    <div className="flex items-center gap-6 text-meta">
      <AssigneeChip id="u-ben" name="Ben" />
      <AssigneeChip id="u-ben" name="Ben" turns />
      <AssigneeChip id={storyUser.id} name="Ada" me turns />
    </div>
  ),
}
