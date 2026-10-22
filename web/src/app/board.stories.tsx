import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useRef, type ReactNode } from 'react'
import type { Task } from '../lib/types'
import { BoardView, type BoardColumn } from './BoardView'
import { HEX, label, project, seeded, seedProjectWithSections, storyUser, task, TODAY, TOMORROW, withClock, withSeed } from './stories/fixtures'
import { TaskCard } from './TaskRow'
import { TaskListView } from './TaskListView'

// Core screen: the board (OpenSpec change ux-overhaul, task 8.7; sections-and-boards
// "Board columns", "Card content", "Board on a phone"). The project page in board
// layout over a seeded database, and the board component alone with static
// columns. Below 640 px the columns are 88 % of the screen with snapping and a dot
// pager names the current one.
const meta: Meta = { title: 'Screens/Board' }
export default meta

const noop = () => {}

/** The project page opened as a board on this device: header, layout toggle, three sections with cards. */
export const ProjectBoard: StoryObj = {
  ...withSeed(() => seedProjectWithSections(true)),
  render: () => (
    <div className="-m-4 h-[44rem] overflow-y-auto bg-canvas">
      <TaskListView route={{ view: 'project', id: seeded.website }} userId={storyUser.id} userRole={storyUser.role} />
    </div>
  ),
}

const website = project({ id: 'p-web', name: 'Website launch', color: HEX.violet })
const deepWork = label('l-deep', 'deep-work', HEX.violet)
const waiting = label('l-wait', 'waiting', HEX.slate)
const section = (id: string, name: string, position: number) => ({ id, project_id: website.id, name, position, created_at: 0, deleted_at: null, _clock: {} })
const columns: BoardColumn[] = [
  { key: 's1', section: section('s1', 'Backlog', 0), cards: [
    task({ id: 'b1', title: 'Write the launch announcement', project_id: website.id, section_id: 's1', estimate_minutes: 120, labels: [deepWork.id] }),
    task({ id: 'b2', title: 'Set up the status page', project_id: website.id, section_id: 's1', priority: 3 }),
    task({ id: 'b3', title: 'Collect testimonials', project_id: website.id, section_id: 's1', labels: [waiting.id] }),
  ] },
  { key: 's2', section: section('s2', 'In progress', 1), cards: [
    task({ id: 'b4', title: 'Review the homepage copy', project_id: website.id, section_id: 's2', priority: 2, due: { date: TOMORROW, time: '10:00' }, deadline: '2026-10-17' }),
    task({ id: 'b5', title: 'Compress the hero images', project_id: website.id, section_id: 's2', estimate_minutes: 30 }),
  ] },
  { key: 's3', section: section('s3', 'Review', 2), cards: [
    task({ id: 'b6', title: 'Pricing page', project_id: website.id, section_id: 's3', priority: 1, due: { date: TODAY } }),
    task({ id: 'b7', title: 'Publish the pricing page', project_id: website.id, section_id: 's3' }),
  ] },
]
const labels = [deepWork, waiting]
const labelsOf = (t: { labels: string[] }) => labels.filter((l) => t.labels.includes(l.id))

/** The board component with static columns: cards by section, the selected card, a blocked one, Add section at the end. */
export const Columns: StoryObj = {
  decorators: [withClock],
  render: () => (
    <BoardView project={website} columns={columns} editable addingTo={null} setAddingTo={noop} projects={[website]} labels={labels}
      renderCard={(t) => (
        <TaskCard key={t.id} task={t} labels={labelsOf(t)} selected={t.id === 'b4'} showProject={false} blockedBy={t.id === 'b7' ? 1 : 0}
          progress={t.id === 'b6' ? { done: 1, total: 2 } : undefined} onToggle={noop} onOpen={noop} />
      )} />
  ),
}

/** A viewer's board: no quick add, no Add section, cards that open but cannot be completed. */
export const ReadOnlyColumns: StoryObj = {
  decorators: [withClock],
  render: () => (
    <BoardView project={website} columns={columns} editable={false} addingTo={null} setAddingTo={noop} projects={[website]} labels={labels}
      renderCard={(t) => <TaskCard key={t.id} task={t} labels={labelsOf(t)} selected={false} showProject={false} readOnly onToggle={noop} onOpen={noop} />} />
  ),
}

/** Calm cards in one column (calm-rows D9): label dots, the deadline, no project or section, counts at the end of the line. */
export const CalmColumn: StoryObj = {
  decorators: [withClock],
  render: () => (
    <ul className="ui-column w-72 space-y-1.5">
      {columns[1].cards.concat(columns[0].cards).map((t) => (
        <TaskCard key={t.id} task={t} labels={labelsOf(t)} selected={false} showProject={false} progress={t.id === 'b4' ? { done: 1, total: 3 } : undefined} onToggle={noop} onOpen={noop} />
      ))}
    </ul>
  ),
}

// Board surfaces (OpenSpec change surfaces-v2, task 4.4): the column surface, the
// card lift and the drop placeholder.
const styled: BoardColumn[] = [
  { key: 's1', section: { ...section('s1', 'Backlog', 0), color: HEX.teal, icon: 'inbox' }, cards: columns[0].cards },
  columns[1],
  { key: 's4', section: section('s4', 'Done', 3), cards: [] },
]

const card = (t: Task, dragging = false) => (
  <TaskCard key={t.id} task={t} labels={labelsOf(t)} selected={false} showProject={false} dragging={dragging} onToggle={noop} onOpen={noop} />
)

/** Columns with a styled section (icon and colour), a filled one and an empty one with "Add a task" inside its surface. */
export const StyledFilledEmptyColumns: StoryObj = {
  decorators: [withClock],
  render: () => (
    <BoardView project={website} columns={styled} editable addingTo={null} setAddingTo={noop} projects={[website]} labels={labels} renderCard={(t) => card(t)} />
  ),
}

/** Focus inside a card lifts it like a hover does (the shadow step 2). */
function FocusFirstCard({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.querySelector<HTMLElement>('[data-task-id] [data-row-open]')?.focus() }, [])
  return <div ref={ref}>{children}</div>
}

/** A card hovered or focused: lifted to the second elevation step. */
export const CardHovered: StoryObj = {
  decorators: [withClock],
  render: () => (
    <FocusFirstCard>
      <BoardView project={website} columns={[columns[1]]} editable addingTo={null} setAddingTo={noop} projects={[website]} labels={labels} renderCard={(t) => card(t)} />
    </FocusFirstCard>
  ),
}

/** A drag in progress: the origin card faded in "Backlog", the placeholder at the end of "In progress". */
export const DragInProgress: StoryObj = {
  decorators: [withClock],
  render: () => (
    <BoardView project={website} columns={columns} editable addingTo={null} setAddingTo={noop} projects={[website]} labels={labels}
      placeholder={{ key: 's2', height: 56 }} renderCard={(t) => card(t, t.id === 'b2')} />
  ),
}
