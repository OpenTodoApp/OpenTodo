import type { Meta, StoryObj } from '@storybook/react-vite'
import { InlineEditor } from './task-list/InlineEditor'
import type { CSSProperties, ReactNode } from 'react'
import { setDateTime } from '../lib/dates'
import type { HabitStats } from '../lib/habits'
import { rowTimeWidth } from '../lib/rowTime'
import { HEX, label, project, seedCounts, task, TODAY, TOMORROW, withClock, withSeed } from './stories/fixtures'
import { TaskCard, TaskRow } from './TaskRow'

// Core screen: the task row and the board card (OpenSpec change ux-overhaul, task
// 8.7; task-list-presentation "One row anatomy", "Metadata language", "Bulk
// selection does not shift rows", "Drag feedback"; sections-and-boards "Card
// content"). Static props and a frozen clock, so "Today" and the deadline
// countdowns never change; the counts come from two fixture rows. One row language
// (rows-v2): TimeColumn, ActionsRevealed, LongTitle, EveryMetadata and Labels set
// the list's column and the heading's implied facts explicitly.
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

/** The date phrase on the due ladder (page-rhythm D7); evening as a suffix, repeat as a muted icon with its word. */
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

/**
 * The due ladder (page-rhythm D7): a later date muted, tomorrow in the default
 * text, today in the accent whether timed or not, an earlier day in danger. The
 * deadline countdown keeps its own steps beside it.
 */
export const DueLadder: StoryObj = {
  render: () => (
    <List>
      <TaskRow {...base} task={task({ id: 't1', title: 'Renew the domain', due: { date: '2026-10-20' } })} />
      <TaskRow {...base} task={task({ id: 't2', title: 'Prepare the demo', due: { date: TOMORROW } })} />
      <TaskRow {...base} task={task({ id: 't3', title: 'Water the plants', due: { date: TODAY } })} />
      <TaskRow {...base} task={task({ id: 't4', title: 'Write the release notes', due: { date: TODAY, time: '09:30' } })} />
      <TaskRow {...base} task={task({ id: 't5', title: 'Send the invoice to Northwind', due: { date: '2026-10-12' } })} />
      <TaskRow {...base} task={task({ id: 't6', title: 'Book the venue', due: { date: TOMORROW }, deadline: '2026-10-17' })} />
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

/** Label chips and the project as muted text at the row's end (outside the project; the end of the line below 640 px). */
export const LabelsAndProject: StoryObj = {
  render: () => (
    <List>
      <TaskRow {...base} showProject project={home} task={task({ id: 't1', title: 'Fix the bike light', project_id: home.id, labels: [errand.id] })} labels={[errand]} />
      <TaskRow {...base} showProject project={home} task={task({ id: 't2', title: 'Read the sync protocol draft', project_id: home.id, due: { date: TOMORROW } })} labels={[deepWork, errand]} />
      <TaskRow {...base} showProject task={task({ id: 't3', title: 'Renew passport' })} labels={[errand]} />
    </List>
  ),
}

/** The estimate in the line; subtask progress, notes, comments and attachments in the quiet trailing group. */
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

/** Blocked by open tasks: the title is muted and a lock item counts the blockers. */
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

/** The demo's Today rows: timed tasks, an overdue one, a deadline, an evening repeat, three labels with counts, a P3 (rows-v2 D11). */
function TodayRows({ forceActions = false }: { forceActions?: boolean }) {
  const today = { date: TODAY }
  const row = { ...base, showProject: true, timeColumn: true, onMore: noop }
  return (
    <List>
      <TaskRow {...row} project={work} task={task({ id: 't-late', title: 'Send the invoice to Northwind', project_id: work.id, due: { date: '2026-10-12', time: '18:00' }, priority: 2 })} />
      <TaskRow {...row} implied={today} project={work} task={task({ id: 't-timed', title: 'Stand-up with the design team', project_id: work.id, due: { date: TODAY, time: '10:00' }, estimate_minutes: 15 })} />
      <TaskRow {...row} implied={today} project={home} labels={[errand, call, homeLabel]} progress={{ done: 1, total: 3 }} selected forceActions={forceActions}
        task={task({ id: 't-counts', title: 'Prepare the quarterly report', project_id: home.id, due: { date: TODAY, time: '14:30' }, estimate_minutes: 120, labels: [errand.id, call.id, homeLabel.id], description: 'Three charts.' })} />
      <TaskRow {...row} implied={today} project={home} task={task({ id: 't-p3', title: 'Read the sync protocol draft', project_id: home.id, due: { date: TODAY }, priority: 3, deadline: '2026-10-17' })} />
      <TaskRow {...row} implied={{ date: TODAY, evening: true }} project={home} task={task({ id: 't-eve', title: 'Water the plants', project_id: home.id, due: { date: TODAY }, evening: true, recurrence: 'every day' })} />
      <TaskRow {...row} implied={today} task={task({ id: 't-inbox', title: 'Call mum', due: { date: TODAY }, priority: 1 })} />
    </List>
  )
}

/** The time column (rows-v2 D2), 24-hour: due times stacked in one column, the deadline countdown where there is no time, empty otherwise. */
export const TimeColumn: StoryObj = {
  ...withSeed(() => seedCounts('t-counts')),
  render: () => <TodayRows />,
}

/** The same list in the 12-hour format: the column is as wide as "12:00 PM". */
export const TimeColumn12Hour: StoryObj = {
  ...withSeed(() => seedCounts('t-counts')),
  render: () => {
    setDateTime({ date_format: 'day-month', time_format: '12h', week_start: 'mon' }, { order: 'DM', hour12: true, weekStart: 1 })
    return <div style={{ '--row-time-w': rowTimeWidth(true) } as CSSProperties}><TodayRows /></div>
  },
}

/** The revealed actions (rows-v2 D7) on the selected row, as a hover shows them: Schedule, Priority and More over the trailing group. */
export const ActionsRevealed: StoryObj = {
  ...withSeed(() => seedCounts('t-counts')),
  render: () => <TodayRows forceActions />,
}

/** Long titles truncate beside the column and the trailing group, at every width. */
export const LongTitle: StoryObj = {
  render: () => (
    <List>
      <TaskRow {...base} timeColumn showProject project={work} labels={[errand, call]} progress={{ done: 2, total: 5 }}
        task={task({ id: 't1', title: 'Collect testimonials from the first three customers, pick two quotes and send them to the designer before Friday', project_id: work.id, due: { date: TODAY, time: '09:30' }, estimate_minutes: 45, labels: [errand.id, call.id] })} />
      <TaskRow {...base} timeColumn showProject project={home}
        task={task({ id: 't2', title: 'Compare the three quotes for the kitchen renovation and call the one with the earliest start date', project_id: home.id, deadline: '2026-10-17' })} />
    </List>
  ),
}

/** Every item of the line in its order (date words, repeat, deadline, start, tracked over estimate, blocked, streak, assignee), three labels, and the project, the counts and the origin trailing. */
export const EveryMetadata: StoryObj = {
  ...withSeed(() => seedCounts('t-counts')),
  render: () => (
    <List>
      <TaskRow {...base} showProject project={work} labels={[errand, call, homeLabel]} progress={{ done: 1, total: 3 }} tracked={35} blockedBy={1}
        habit={{ current: 6, best: 9, pending: true, atRisk: false } as HabitStats} assignee="Jo"
        task={task({ id: 't-counts', title: 'Prepare the quarterly report', project_id: work.id, due: { date: TOMORROW }, recurrence: 'every week', deadline: '2026-10-30', start: '2026-10-01', estimate_minutes: 60, labels: [errand.id, call.id, homeLabel.id], description: 'Three charts.', assignee_id: 'u-jo', origin: { kind: 'issue', provider: 'github', id: 'o/r#7', url: 'https://github.com/o/r/issues/7' } })} />
    </List>
  ),
}

/** Label chips (rows-v2 D5): one, two, four (two and "+2"), and a row in the errand label's view, which leaves errand out. */
export const Labels: StoryObj = {
  render: () => (
    <List>
      <TaskRow {...base} task={task({ id: 't1', title: 'Fix the bike light', labels: [errand.id] })} labels={[errand]} />
      <TaskRow {...base} task={task({ id: 't2', title: 'Ring the garage', labels: [errand.id, call.id] })} labels={[errand, call]} />
      <TaskRow {...base} task={task({ id: 't3', title: 'Plan the weekend', labels: [errand.id, call.id, homeLabel.id, deepWork.id] })} labels={[errand, call, homeLabel, deepWork]} />
      <TaskRow {...base} omitLabel={errand.id} task={task({ id: 't4', title: 'Buy stamps on the way home', labels: [errand.id, homeLabel.id] })} labels={[errand, homeLabel]} />
    </List>
  ),
}

/** Where tasks came from (task-origin): an issue, a captured page and a mail, quiet at the row's end; a card with a page in its line. */
export const WithOrigins: StoryObj = {
  render: () => {
    const issue = { kind: 'issue' as const, provider: 'github', id: 'o/r#7', url: 'https://github.com/o/r/issues/7', title: 'Login times out after 30 seconds' }
    const page = { kind: 'url' as const, url: 'https://example.org/post', title: 'Interesting article' }
    const mail = { kind: 'email' as const, id: '<a1@mail.example>' }
    return (
      <div className="space-y-3">
        <List>
          <TaskRow {...base} task={task({ id: 'o-i', title: 'Fix the login timeout', priority: 2, due: { date: TODAY }, origin: issue })} />
          <TaskRow {...base} progress={{ done: 1, total: 2 }} task={task({ id: 'o-p', title: 'Read the article on offline sync', origin: page, description: 'https://example.org/post' })} />
          <TaskRow {...base} task={task({ id: 'o-m', title: 'Invoice 2026-10', origin: mail })} />
        </List>
        <ul className="w-72 rounded-card bg-canvas p-1.5 dark:border dark:border-default dark:bg-sunken">
          <TaskCard {...base} task={task({ id: 'c-page', title: 'Summarise the offline sync article', origin: page })} labels={[deepWork]} />
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

