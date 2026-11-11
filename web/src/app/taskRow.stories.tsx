import type { Meta, StoryObj } from '@storybook/react-vite'
import { InlineEditor } from './task-list/InlineEditor'
import { type CSSProperties, type ReactNode, useLayoutEffect } from 'react'
import { setDateTime } from '../lib/dates'
import { applyFullTitles } from '../lib/fullTitles'
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
const workWithIcon = project({ id: 'p-work', name: 'Work', color: HEX.blue, icon: 'briefcase' })
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

/** Spans (multi-day-tasks D5): the range in the date's place; once begun, "until" in the Started chip's place. A deferred task that is not a span keeps both chips. */
export const Spans: StoryObj = {
  render: () => (
    <List>
      <TaskRow {...base} task={task({ id: 't1', title: 'Lisbon trip', start: '2026-10-21', due: { date: '2026-10-23' }, span: true })} />
      <TaskRow {...base} task={task({ id: 't2', title: 'Design conference', start: '2026-10-12', due: { date: '2026-10-16' }, span: true })} />
      <TaskRow {...base} task={task({ id: 't3', title: 'Quarterly report', start: '2026-10-12', due: { date: '2026-10-16' } })} />
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

/** A project icon and the colour dot fallback in each row layout. */
export const ProjectIcons: StoryObj = {
  render: () => (
    <List>
      <TaskRow {...base} layout="line" showProject project={workWithIcon} task={task({ id: 't1', title: 'Prepare the demo', project_id: workWithIcon.id })} />
      <TaskRow {...base} layout="line" showProject project={home} task={task({ id: 't2', title: 'Fix the bike light', project_id: home.id })} />
      <TaskRow {...base} layout="detailed" showProject project={workWithIcon} task={task({ id: 't3', title: 'Review the demo', project_id: workWithIcon.id })} />
      <TaskRow {...base} layout="detailed" showProject project={home} task={task({ id: 't4', title: 'Water the plants', project_id: home.id })} />
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

/** The energy as one muted word after the estimate, only when set (task-energy D6); a task without one shows nothing. */
export const Energy: StoryObj = {
  render: () => (
    <List>
      <TaskRow {...base} task={task({ id: 't1', title: 'Draft the strategy', estimate_minutes: 120, energy: 'deep' })} />
      <TaskRow {...base} task={task({ id: 't2', title: 'Sort the receipts', due: { date: TODAY }, energy: 'low' })} />
      <TaskRow {...base} task={task({ id: 't3', title: 'Reply to Mara', estimate_minutes: 15 })} />
    </List>
  ),
}

/**
 * A time sector in the date slot of an undated task (time-sectors D4): named on the
 * frozen Wednesday 14 October 2026, a later week by its number, a month by name, and
 * a week that has ended carried over in the faint tone, never the overdue colour.
 */
export const Sector: StoryObj = {
  render: () => (
    <List>
      <TaskRow {...base} task={task({ id: 't1', title: 'Draft the budget', sector: '2026-W42', deadline: '2026-10-16' })} />
      <TaskRow {...base} task={task({ id: 't2', title: 'Book the venue', sector: '2026-W43' })} />
      <TaskRow {...base} task={task({ id: 't3', title: 'Plan the offsite', sector: '2026-W46', estimate_minutes: 60 })} />
      <TaskRow {...base} task={task({ id: 't4', title: 'Renew the insurance', sector: '2026-11' })} />
      <TaskRow {...base} task={task({ id: 't5', title: 'Sort the photos', sector: '2026-W40' })} />
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

/** Waiting in sequence (project-flow-modes): dimmed in place with "After <step>"; a long step title truncates. */
export const WaitingInSequence: StoryObj = {
  render: () => (
    <List>
      <TaskRow {...base} task={task({ id: 's1', title: 'Book the van', due: { date: TODAY } })} />
      <TaskRow {...base} waitsFor="Book the van" task={task({ id: 's2', title: 'Pack the kitchen', due: { date: TOMORROW } })} />
      <TaskRow {...base} waitsFor="Renew the passport at the consulate before anything else" task={task({ id: 's3', title: 'Hand over the keys' })} />
      <TaskCard {...base} waitsFor="Book the van" task={task({ id: 's4', title: 'Clean the flat' })} />
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

/** Long titles wrap to two lines beside the column, then end with an ellipsis (task-list-width D1); a phone row keeps one line. */
export const LongTitle: StoryObj = {
  render: () => (
    <List>
      <TaskRow {...base} timeColumn showProject project={work} labels={[errand, call]} progress={{ done: 2, total: 5 }}
        task={task({ id: 't1', title: 'Collect testimonials from the first three customers, pick two quotes and send them to the designer before Friday', project_id: work.id, due: { date: TODAY, time: '09:30' }, estimate_minutes: 45, labels: [errand.id, call.id] })} />
      <TaskRow {...base} timeColumn showProject project={home}
        task={task({ id: 't2', title: 'Compare the three quotes for the kitchen renovation and call the one with the earliest start date', project_id: home.id, deadline: '2026-10-17' })} />
      <TaskRow {...base} timeColumn showProject project={home}
        task={task({ id: 't3', title: 'Email the cutting board company about the warped board, the replacement they promised in September, the refund for the shipping and why the second board never arrived either', project_id: home.id })} />
    </List>
  ),
}

/**
 * A narrow list (under 40 rem, the Inbox beside a medium window; GitHub issue 650): the
 * titles take the row's whole width and two lines, the revealed actions float over the
 * row's end instead of keeping room, and the row's height does not change on hover.
 */
export const LongTitleNarrow: StoryObj = {
  render: () => (
    <div className="max-w-md">
      <List>
        <TaskRow {...base} onMore={noop} task={task({ id: 't1', title: 'Find hottub details from invoice' })} />
        <TaskRow {...base} onMore={noop} forceActions
          task={task({ id: 't2', title: 'Email cutting board company (Babylonian Woodworks) about the warped board and the replacement they promised' })} />
        <TaskRow {...base} onMore={noop} task={task({ id: 't3', title: 'Start organizing and listing Facebook items for sale before the move, starting with the furniture in the garage and the old bikes', estimate_minutes: 90 })} />
      </List>
    </div>
  ),
}

/** Turns full task titles on while the story is shown, as the synced setting does on <html>. */
function FullTitles({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    applyFullTitles(true)
    return () => applyFullTitles(false)
  }, [])
  return <>{children}</>
}

/**
 * Show full task titles (full-task-titles, GitHub issue 998): the LongTitle rows and a
 * long card with the setting on. Every title is whole, wrapped onto as many lines as it
 * takes; the column (and on a phone the date) stays on the title's first line.
 */
export const LongTitleFull: StoryObj = {
  render: () => (
    <FullTitles>
      <List>
        <TaskRow {...base} timeColumn showProject project={work} labels={[errand, call]} progress={{ done: 2, total: 5 }}
          task={task({ id: 't1', title: 'Collect testimonials from the first three customers, pick two quotes and send them to the designer before Friday', project_id: work.id, due: { date: TODAY, time: '09:30' }, estimate_minutes: 45, labels: [errand.id, call.id] })} />
        <TaskRow {...base} timeColumn showProject project={home}
          task={task({ id: 't2', title: 'Compare the three quotes for the kitchen renovation and call the one with the earliest start date', project_id: home.id, deadline: '2026-10-17', due: { date: TOMORROW } })} />
        <TaskRow {...base} timeColumn showProject project={home}
          task={task({ id: 't3', title: 'Email the cutting board company about the warped board, the replacement they promised in September, the refund for the shipping and why the second board never arrived either', project_id: home.id })} />
        <TaskRow {...base} timeColumn task={task({ id: 't4', title: 'Renew passport' })} />
      </List>
      <ul className="mt-3 w-72 space-y-1.5 rounded-card bg-canvas p-1.5 dark:border dark:border-default dark:bg-sunken">
        <TaskCard {...base} task={task({ id: 'c1', title: 'Email the cutting board company about the warped board, the replacement they promised in September and the refund for the shipping' })} labels={[errand]} />
      </ul>
    </FullTitles>
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

/**
 * The row grid (sidebar-brand-and-row-grid D2 to D4) in a 64 rem list: the slots project,
 * labels, estimate, date and assignee line up down the list, an empty slot keeps its
 * width, the unused assignee slot takes none, the dates end the column; the marks sit on
 * the title's first baseline, also on a wrapped title; Evening is an icon in the time column.
 */
export const SlotGrid: StoryObj = {
  render: () => (
    <ul className="max-w-5xl space-y-0.5 rounded-card border border-default bg-surface p-2 shadow-1">
      {[
        <TaskRow key="a" {...base} showProject timeColumn slotsOff="assignee" project={home} labels={[errand]} task={task({ id: 'g1', title: 'Fix the bike light', project_id: home.id, labels: [errand.id], estimate_minutes: 45, due: { date: TOMORROW, time: '09:30' } })} />,
        <TaskRow key="b" {...base} showProject timeColumn slotsOff="assignee" project={home} task={task({ id: 'g2', title: 'Pay the water bill', project_id: home.id, due: { date: '2026-10-20' } })} />,
        <TaskRow key="c" {...base} showProject timeColumn slotsOff="assignee" labels={[deepWork]} task={task({ id: 'g3', title: 'Read the sync protocol draft', labels: [deepWork.id] })} />,
        <TaskRow key="d" {...base} showProject timeColumn slotsOff="assignee" project={home} progress={{ done: 2, total: 3 }}
          task={task({ id: 'g4', title: 'Prepare the quarterly report with the three charts finance asked for, the summary and the appendix of every number that changed since the last quarter', priority: 1, recurrence: 'every week', project_id: home.id, due: { date: TODAY } })} />,
        <TaskRow key="e" {...base} showProject timeColumn slotsOff="assignee" project={home} task={task({ id: 'g5', title: 'Water the plants', evening: true, project_id: home.id, due: { date: '2026-10-16' } })} />,
      ]}
    </ul>
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

/**
 * Tasks imported from Todoist (row-title-first-on-phones, GitHub issue 844): the import's
 * id is not shown in the row, so the title keeps the row's width; the Inbox's source line
 * sits under the title. At 375 px each row is the phone's one line, the Inbox row two.
 */
export const ImportedOrigins: StoryObj = {
  render: () => {
    const todoist = (id: string) => ({ kind: 'import' as const, provider: 'todoist', id })
    const trello = { kind: 'import' as const, provider: 'trello', id: '5f3a9c1e2b7d4a0012345678', url: 'https://trello.com/c/AbCd1234' }
    return (
      <List>
        <TaskRow {...base} onExpand={noop} task={task({ id: 'im-1', title: 'Küche aufräumen und den Kühlschrank abtauen', due: { date: TOMORROW }, recurrence: 'every week', origin: todoist('dfc92cb10aed05a4:1') })} />
        <TaskRow {...base} onExpand={noop} depth={2} task={task({ id: 'im-2', title: 'Geschenke für die Familie besorgen', origin: todoist('32dc159c4ebf721d:1') })} />
        <TaskRow {...base} onExpand={noop} task={task({ id: 'im-3', title: 'Move the onboarding checklist into the new board', origin: trello })} />
        <TaskRow {...base} onExpand={noop} source task={task({ id: 'im-4', title: 'Unterlagen für die Steuererklärung zusammensuchen', created_at: Date.now() - 19 * 3600_000, origin: todoist('b3e8862820356c2e:1') })} />
      </List>
    )
  },
}

/**
 * A project after a Todoist import (GitHub issue 945): the import's id shows nowhere,
 * and the date and label cells line up down the list whether a row ends with an
 * origin (an issue, a page, a Trello card's icon) or with nothing. The list takes the
 * whole width, so at 1280 and 768 px each row has the property column, at 390 px the
 * phone's one line. scripts/ui-check/alignment.mjs measures it at the three widths.
 */
export const ImportedAlignment: StoryObj = {
  render: () => {
    const todoist = (id: string) => ({ kind: 'import' as const, provider: 'todoist', id })
    const trello = { kind: 'import' as const, provider: 'trello', id: '5f3a9c1e2b7d4a0012345678', url: 'https://trello.com/c/AbCd1234' }
    const issue = { kind: 'issue' as const, provider: 'github', id: 'o/r#7', url: 'https://github.com/o/r/issues/7' }
    const page = { kind: 'url' as const, url: 'https://docs.example-company.org/handbook/onboarding', title: 'Onboarding handbook' }
    const row = { ...base, onExpand: noop }
    return (
      <ul data-alignment-list="" className="w-full space-y-0.5 rounded-card border border-default bg-surface p-2 shadow-1">
        <TaskRow {...row} task={task({ id: 'ia-1', title: 'Küche aufräumen', due: { date: TOMORROW }, labels: [errand.id], origin: todoist('dfc92cb10aed05a4:1') })} labels={[errand]} />
        <TaskRow {...row} task={task({ id: 'ia-2', title: 'Fix the login timeout', due: { date: '2026-10-20' }, labels: [deepWork.id], origin: issue })} labels={[deepWork]} />
        <TaskRow {...row} task={task({ id: 'ia-3', title: 'Geschenke für die Familie besorgen', due: { date: TODAY }, labels: [errand.id, deepWork.id], origin: todoist('32dc159c4ebf721d:1') })} labels={[errand, deepWork]} />
        <TaskRow {...row} task={task({ id: 'ia-4', title: 'Read the onboarding handbook', due: { date: '2026-10-22' }, labels: [deepWork.id], origin: page })} labels={[deepWork]} />
        <TaskRow {...row} task={task({ id: 'ia-5', title: 'Plan the autumn trip', due: { date: '2026-10-25' }, labels: [errand.id] })} labels={[errand]} />
        <TaskRow {...row} task={task({ id: 'ia-6', title: 'Move the onboarding checklist into the new board', due: { date: TOMORROW }, labels: [errand.id], origin: trello })} labels={[errand]} />
      </ul>
    )
  },
}

/** A task from an Obsidian note (obsidian-origin): the note's name with a note icon; one titled, one read from its path. */
export const WithObsidianOrigin: StoryObj = {
  render: () => {
    const daily = { kind: 'obsidian' as const, id: 'Daily/2026-10-29.md', url: 'obsidian://open?vault=Notes&file=Daily%2F2026-10-29', title: 'Thursday standup' }
    const meeting = { kind: 'obsidian' as const, id: 'Meetings/Kick-off.md', url: 'obsidian://open?vault=Work%20notes&file=Meetings%2FKick-off' }
    return (
      <List>
        <TaskRow {...base} task={task({ id: 'ob-d', title: 'Send the standup notes to Jo', due: { date: TODAY }, origin: daily })} />
        <TaskRow {...base} task={task({ id: 'ob-m', title: 'Book the kick-off room', priority: 2, origin: meeting })} />
      </List>
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

