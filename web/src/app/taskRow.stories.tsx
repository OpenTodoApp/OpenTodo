import type { Meta, StoryObj } from '@storybook/react-vite'
import { InlineEditor } from './task-list/InlineEditor'
import type { ReactNode } from 'react'
import { HEX, label, project, seedCounts, task, TODAY, TOMORROW, withClock, withSeed } from './stories/fixtures'
import { TaskCard, TaskRow } from './TaskRow'

// Core screen: the task row and the board card (OpenSpec change ux-overhaul, task
// 8.7; task-list-presentation "One row anatomy", "Metadata language", "Bulk
// selection does not shift rows", "Drag feedback"; sections-and-boards "Card
// content"). Static props and a frozen clock, so "Today" and the deadline
// countdowns never change; the count chips come from two fixture rows. Rows are
// Calm by default (calm-rows); CalmToday, DetailedToday and CalmLabels set the
// detail and the heading's implied facts explicitly.
const meta: Meta = { title: 'Screens/Task row', decorators: [withClock] }
export default meta

const noop = () => {}
const home = project({ id: 'p-home', name: 'Home', color: HEX.green })
const errand = label('l-errand', 'errand', HEX.orange)
const deepWork = label('l-deep', 'deep-work', HEX.violet)
const base = { selected: false, showProject: false, onToggle: noop, onOpen: noop }

function List({ children }: { children: ReactNode }) {
  return <ul className="max-w-2xl space-y-0.5 rounded-card border border-default bg-surface p-2 shadow-1">{children}</ul>
}

/** A bare task: the leading slot, the checkbox in the priority ring, the title, no metadata line. */
export const Plain: StoryObj = {
  render: () => (
    <List>
      <TaskRow {...base} task={task({ id: 't1', title: 'Renew passport' })} />
      <TaskRow {...base} task={task({ id: 't2', title: 'Call the bank about the card limit', priority: 1 })} />
      <TaskRow {...base} task={task({ id: 't3', title: 'Plan the autumn trip', priority: 2 })} />
      <TaskRow {...base} task={task({ id: 't4', title: 'Read the sync protocol draft', priority: 3 })} />
    </List>
  ),
}

/** The row the keyboard or a click selected: a leading accent bar and a faint tint, no ring (inline-task-editing). */
export const Selected: StoryObj = {
  render: () => (
    <List>
      <TaskRow {...base} task={task({ id: 't1', title: 'Renew passport' })} />
      <TaskRow {...base} selected task={task({ id: 't2', title: 'Call the bank about the card limit', estimate_minutes: 15 })} />
      <TaskRow {...base} task={task({ id: 't3', title: 'Plan the autumn trip' })} />
    </List>
  ),
}

/** Completed: a filled check, the title struck through and faint; metadata that no longer matters is dropped. */
export const Completed: StoryObj = {
  render: () => (
    <List>
      <TaskRow {...base} task={task({ id: 't1', title: 'Renew passport', completed_at: 1, due: { date: TODAY }, deadline: '2026-10-10' })} />
      <TaskRow {...base} task={task({ id: 't2', title: 'Water the plants', completed_at: 1, recurrence: 'every 3 days' })} labels={[errand]} />
    </List>
  ),
}

/** The date phrase in Calm rows: muted except overdue and a timed today; evening as a suffix, repeat as a muted icon with its word. */
export const DateEveningRepeat: StoryObj = {
  render: () => (
    <List>
      <TaskRow {...base} task={task({ id: 't1', title: 'Send the invoice to Northwind', due: { date: '2026-10-12' } })} />
      <TaskRow {...base} task={task({ id: 't2', title: 'Write the release notes', due: { date: TODAY, time: '09:30' } })} />
      <TaskRow {...base} task={task({ id: 't3', title: 'Stretch for ten minutes', due: { date: TODAY }, evening: true })} />
      <TaskRow {...base} task={task({ id: 't4', title: 'Water the plants', due: { date: TODAY }, evening: true, recurrence: 'every day' })} />
      <TaskRow {...base} task={task({ id: 't5', title: 'Review the homepage copy', due: { date: TOMORROW, time: '10:00' } })} />
      <TaskRow {...base} task={task({ id: 't6', title: 'Renew the domain', due: { date: '2026-10-20' } })} />
      <TaskRow {...base} task={task({ id: 't7', title: 'Weekly review', recurrence: 'every week' })} />
      <TaskRow {...base} task={task({ id: 't8', title: 'Read a chapter', evening: true })} />
    </List>
  ),
}

/** Deadlines: late in the danger tone, due within days in the warning tone, far away muted. */
export const Deadlines: StoryObj = {
  render: () => (
    <List>
      <TaskRow {...base} task={task({ id: 't1', title: 'File the tax return', deadline: '2026-10-10' })} />
      <TaskRow {...base} task={task({ id: 't2', title: 'Return the library books', deadline: '2026-10-17' })} />
      <TaskRow {...base} task={task({ id: 't3', title: 'Renew the car insurance', deadline: '2026-11-30', due: { date: '2026-11-20' } })} />
    </List>
  ),
}

/** Labels as dots with the first name (Calm) and the project as a neutral chip with its colour (shown outside the project). */
export const LabelsAndProject: StoryObj = {
  render: () => (
    <List>
      <TaskRow {...base} showProject project={home} task={task({ id: 't1', title: 'Fix the bike light', project_id: home.id, labels: [errand.id] })} labels={[errand]} />
      <TaskRow {...base} showProject project={home} task={task({ id: 't2', title: 'Read the sync protocol draft', project_id: home.id, due: { date: TOMORROW } })} labels={[deepWork, errand]} />
      <TaskRow {...base} showProject task={task({ id: 't3', title: 'Renew passport' })} labels={[errand]} />
    </List>
  ),
}

/** The estimate in the line; subtask progress, notes, comments and attachments in the quiet trailing group (Calm). */
export const Chips: StoryObj = {
  ...withSeed(() => seedCounts('t-counts')),
  render: () => (
    <List>
      <TaskRow {...base} task={task({ id: 't-counts', title: 'Prepare the quarterly report', estimate_minutes: 120, description: 'Three charts and a one-page summary.' })} progress={{ done: 1, total: 3 }} />
      <TaskRow {...base} task={task({ id: 't2', title: 'Compress the hero images', estimate_minutes: 30 })} />
      <TaskRow {...base} task={task({ id: 't3', title: 'Pricing page', priority: 1 })} progress={{ done: 0, total: 2 }} />
    </List>
  ),
}

/** Blocked by open tasks: the title is muted and a lock chip counts the blockers. */
export const Blocked: StoryObj = {
  render: () => (
    <List>
      <TaskRow {...base} task={task({ id: 't1', title: 'Pricing page', priority: 1, due: { date: TODAY } })} />
      <TaskRow {...base} blockedBy={1} task={task({ id: 't2', title: 'Publish the pricing page', due: { date: TOMORROW } })} />
      <TaskRow {...base} blockedBy={2} task={task({ id: 't3', title: 'Announce the launch' })} />
    </List>
  ),
}

/** A subtask tree: the chevron only on rows with children, indented children, a collapsed parent, and a breadcrumb outside the tree. */
export const SubtaskTree: StoryObj = {
  render: () => (
    <List>
      <TaskRow {...base} hasChildren onToggleCollapse={noop} task={task({ id: 't1', title: 'Plan the autumn trip', priority: 3 })} progress={{ done: 1, total: 2 }} />
      <TaskRow {...base} depth={1} task={task({ id: 't2', title: 'Compare train times', completed_at: 1, parent_id: 't1' })} />
      <TaskRow {...base} depth={1} hasChildren onToggleCollapse={noop} task={task({ id: 't3', title: 'Book the hotel', parent_id: 't1' })} />
      <TaskRow {...base} depth={2} task={task({ id: 't4', title: 'Ask about late check-in', parent_id: 't3' })} />
      <TaskRow {...base} hasChildren collapsed onToggleCollapse={noop} task={task({ id: 't5', title: 'Prepare the quarterly report' })} progress={{ done: 0, total: 3 }} />
      <TaskRow {...base} breadcrumb="Plan the autumn trip" task={task({ id: 't6', title: 'Renew passport', parent_id: 't1', due: { date: TODAY } })} />
    </List>
  ),
}

/** A drag in progress: the lifted row, a drop line after a row, and a row that would receive the drop as a subtask. */
export const Dragging: StoryObj = {
  render: () => (
    <List>
      <TaskRow {...base} task={task({ id: 't1', title: 'Renew passport' })} />
      <TaskRow {...base} dragging onPointerDown={noop} task={task({ id: 't2', title: 'Call the bank about the card limit', estimate_minutes: 15 })} />
      <TaskRow {...base} dropIndicator="after" task={task({ id: 't3', title: 'Plan the autumn trip' })} />
      <TaskRow {...base} dropIndicator="inside" task={task({ id: 't4', title: 'Read the sync protocol draft' })} />
    </List>
  ),
}

/** Bulk selection: the selection box takes the task checkbox's slot, so the titles never move; hover a row to see it swap. */
export const Selecting: StoryObj = {
  render: () => (
    <List>
      <TaskRow {...base} onTick={noop} showCheckbox ticked task={task({ id: 't1', title: 'Renew passport' })} />
      <TaskRow {...base} onTick={noop} showCheckbox ticked task={task({ id: 't2', title: 'Return the library books', deadline: '2026-10-17' })} />
      <TaskRow {...base} onTick={noop} showCheckbox task={task({ id: 't3', title: 'Plan the autumn trip' })} />
      <TaskRow {...base} onTick={noop} task={task({ id: 't4', title: 'Read the sync protocol draft (hover to select)' })} />
    </List>
  ),
}

/** A viewer of a shared project: the row opens but cannot be completed or selected. */
export const ReadOnly: StoryObj = {
  render: () => (
    <List>
      <TaskRow {...base} readOnly onTick={noop} assignee="Jo" task={task({ id: 't1', title: 'Book the venue', priority: 3, due: { date: '2026-10-21' }, assignee_id: 'u-jo' })} />
      <TaskRow {...base} readOnly task={task({ id: 't2', title: 'Order the catering' })} />
    </List>
  ),
}

/** The board card: the same data as a card, with the title wrapping and the metadata beneath. */
export const Cards: StoryObj = {
  render: () => (
    <ul className="w-72 space-y-1.5 rounded-card bg-canvas p-1.5 dark:border dark:border-default dark:bg-sunken">
      <TaskCard {...base} task={task({ id: 'c1', title: 'Write the launch announcement', estimate_minutes: 120 })} labels={[deepWork]} />
      <TaskCard {...base} selected task={task({ id: 'c2', title: 'Review the homepage copy', priority: 2, due: { date: TOMORROW, time: '10:00' }, deadline: '2026-10-17' })} />
      <TaskCard {...base} task={task({ id: 'c3', title: 'Pricing page', priority: 1, due: { date: TODAY } })} progress={{ done: 1, total: 2 }} />
      <TaskCard {...base} blockedBy={1} task={task({ id: 'c4', title: 'Publish the pricing page' })} />
      <TaskCard {...base} task={task({ id: 'c5', title: 'Collect testimonials from the first three customers and pick two quotes' })} labels={[errand]} />
    </ul>
  ),
}

const call = label('l-call', 'call', HEX.blue)
const homeLabel = label('l-home', 'home', HEX.green)
const work = project({ id: 'p-work', name: 'Work', color: HEX.blue })

/** The demo's Today rows: a timed task, an overdue one, an evening repeat, three labels with counts, a P3 (calm-rows D9). */
function TodayRows({ detail }: { detail: 'calm' | 'detailed' }) {
  const today = { date: TODAY }
  const row = { ...base, detail, showProject: true }
  return (
    <List>
      <TaskRow {...row} project={work} task={task({ id: 't-late', title: 'Send the invoice to Northwind', project_id: work.id, due: { date: '2026-10-12' }, priority: 2 })} />
      <TaskRow {...row} implied={today} project={work} task={task({ id: 't-timed', title: 'Stand-up with the design team', project_id: work.id, due: { date: TODAY, time: '10:00' }, estimate_minutes: 15 })} />
      <TaskRow {...row} implied={today} project={home} labels={[errand, call, homeLabel]} progress={{ done: 1, total: 3 }}
        task={task({ id: 't-counts', title: 'Prepare the quarterly report', project_id: home.id, due: { date: TODAY }, estimate_minutes: 120, labels: [errand.id, call.id, homeLabel.id], description: 'Three charts.' })} />
      <TaskRow {...row} implied={today} project={home} task={task({ id: 't-p3', title: 'Read the sync protocol draft', project_id: home.id, due: { date: TODAY }, priority: 3 })} />
      <TaskRow {...row} implied={{ date: TODAY, evening: true }} project={home} task={task({ id: 't-eve', title: 'Water the plants', project_id: home.id, due: { date: TODAY }, evening: true, recurrence: 'every day' })} />
      <TaskRow {...row} implied={today} task={task({ id: 't-inbox', title: 'Call mum', due: { date: TODAY }, priority: 1 })} />
    </List>
  )
}

/** Calm rows in Today: no "Today" under its heading, colour only for overdue, the timed task and P1/P2, labels as dots, counts quiet at the end. */
export const CalmToday: StoryObj = {
  ...withSeed(() => seedCounts('t-counts')),
  render: () => <TodayRows detail="calm" />,
}

/** The same rows in Detailed: every chip and colour, the counts in the line, as before calm-rows. */
export const DetailedToday: StoryObj = {
  ...withSeed(() => seedCounts('t-counts')),
  render: () => <TodayRows detail="detailed" />,
}

/** Label dots in Calm rows: one, two and four labels, and a row in the errand label's view, which leaves errand out. */
export const CalmLabels: StoryObj = {
  render: () => (
    <List>
      <TaskRow {...base} detail="calm" task={task({ id: 't1', title: 'Fix the bike light', labels: [errand.id] })} labels={[errand]} />
      <TaskRow {...base} detail="calm" task={task({ id: 't2', title: 'Ring the garage', labels: [errand.id, call.id] })} labels={[errand, call]} />
      <TaskRow {...base} detail="calm" task={task({ id: 't3', title: 'Plan the weekend', labels: [errand.id, call.id, homeLabel.id, deepWork.id] })} labels={[errand, call, homeLabel, deepWork]} />
      <TaskRow {...base} detail="calm" omitLabel={errand.id} task={task({ id: 't4', title: 'Buy stamps on the way home', labels: [errand.id, homeLabel.id] })} labels={[errand, homeLabel]} />
    </List>
  ),
}

/** Where tasks came from (task-origin): an issue, a captured page and a mail, in Calm (quiet, trailing) and Detailed (a neutral chip); a card with a page. */
export const WithOrigins: StoryObj = {
  render: () => {
    const issue = { kind: 'issue' as const, provider: 'github', id: 'o/r#7', url: 'https://github.com/o/r/issues/7', title: 'Login times out after 30 seconds' }
    const page = { kind: 'url' as const, url: 'https://example.org/post', title: 'Interesting article' }
    const mail = { kind: 'email' as const, id: '<a1@mail.example>' }
    return (
      <div className="space-y-3">
        {(['calm', 'detailed'] as const).map((detail) => (
          <List key={detail}>
            <TaskRow {...base} detail={detail} task={task({ id: `${detail}-i`, title: 'Fix the login timeout', priority: 2, due: { date: TODAY }, origin: issue })} />
            <TaskRow {...base} detail={detail} progress={{ done: 1, total: 2 }} task={task({ id: `${detail}-p`, title: 'Read the article on offline sync', origin: page, description: 'https://example.org/post' })} />
            <TaskRow {...base} detail={detail} task={task({ id: `${detail}-m`, title: 'Invoice 2026-10', origin: mail })} />
          </List>
        ))}
        <ul className="w-72 rounded-card bg-canvas p-1.5 dark:border dark:border-default dark:bg-sunken">
          <TaskCard {...base} detail="detailed" task={task({ id: 'c-page', title: 'Summarise the offline sync article', origin: page })} labels={[deepWork]} />
        </ul>
      </div>
    )
  },
}

/** A row edited in place (inline-task-editing): the title field and, under it, Date, Priority, Labels, Project and Open details. */
export const EditingInline: StoryObj = {
  render: () => {
    const t2 = task({ id: 't2', title: 'Call the bank about the card limit', priority: 2, due: { date: TOMORROW } })
    return (
      <List>
        <TaskRow {...base} task={task({ id: 't1', title: 'Renew passport' })} />
        <TaskRow {...base} selected task={t2} inline={<InlineEditor task={t2} projects={[]} labelMap={new Map()} onDone={() => {}} />} />
        <TaskRow {...base} task={task({ id: 't3', title: 'Plan the autumn trip' })} />
      </List>
    )
  },
}

