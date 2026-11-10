import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { reviewChangeSet, type Review } from '../../lib/assistant'
import type { AssistantStatus } from '../../lib/assistantStatus'
import { db, setMeta, type AssistantMessage } from '../../lib/db'
import { createPlace } from '../../lib/locations'
import { createNote } from '../../lib/noteOps'
import { createProject, createTask, updateTask } from '../../lib/ops'
import { createSection } from '../../lib/sections'
import { setCurrentUserId } from '../../lib/sharing'
import { logTime } from '../../lib/timeEntries'
import { addDaysISO } from '../../lib/dates'
import { createComment } from '../../lib/comments'
import { occurrenceId } from '../../lib/ids'
import { HEX, seeded, seedBase, seedProjectWithSections, storyUser, TODAY, TOMORROW, withSeed } from '../stories/fixtures'
import { AssistantPanelBody, type PanelViewProps } from './AssistantPanelBody'

// Blocks in the assistant's answers (OpenSpec change assistant-generative-ui): the
// app's own view of what an answer talks about, read from the seeded device. Maps
// are off in the workbench, so the map block shows its list.
const meta: Meta = { title: 'Screens/Assistant blocks' }
export default meta

const noop = () => {}
const status: AssistantStatus = {
  available: true, enabled: true, reason: '', provider: 'anthropic', provider_label: 'Anthropic (Claude)', model: 'claude-sonnet-5-5', consented: true,
  disclosure_version: 4, fields: [], allow_member_keys: false, own_key_set: false, operator_key_set: true,
}
const base: PanelViewProps = {
  status, connected: true, messages: [], streaming: null, announce: '', statusAnnounce: '', review: null, result: null, reviewBusy: false, error: null,
  draft: '', consentBusy: false, consentError: null, threads: null, onToggle: noop, onApply: noop, onDiscard: noop, onUndo: noop, onDraft: noop,
  onSend: noop, onStop: noop, onAccept: noop, onPickThread: noop, onChoose: noop, onFollowUp: noop, onRegenerate: noop, onEditLast: noop, canRedo: true,
}

/** Whether every block and proposal shape under `root` has loaded: no skeleton, no empty frame. */
function settled(root: HTMLElement): boolean {
  if (root.querySelector('[data-skeleton]')) return false
  const blocks = [...root.querySelectorAll('[data-assistant-block]')]
  const shapes = [...root.querySelectorAll('[data-proposal-calendar]')]
  return [...blocks, ...shapes].every((el) => el.childElementCount > 0)
}

/**
 * The page around a story. data-story-pending: the visual check waits until the
 * lazily loaded blocks have rendered from the seeded rows, so it never captures skeletons.
 */
function Page({ children, min = 'min-h-[48rem]' }: { children: ReactNode; min?: string }) {
  const root = useRef<HTMLDivElement>(null)
  const [pending, setPending] = useState(true)
  useEffect(() => {
    let tries = 0
    const timer = setInterval(() => {
      if ((root.current && settled(root.current)) || ++tries > 200) {
        clearInterval(timer)
        requestAnimationFrame(() => setPending(false))
      }
    }, 20)
    return () => clearInterval(timer)
  }, [])
  return <div ref={root} className={`-m-4 ${min} bg-surface px-4 py-6`} data-story-pending={pending || undefined}><div className="mx-auto w-full max-w-[46rem]">{children}</div></div>
}

function Conversation({ messages }: { messages: () => AssistantMessage[] }) {
  return <Page><AssistantPanelBody {...base} layout="page" messages={messages()} /></Page>
}

/** Planning a day: the tasks it talks about, the day as planned, and a choice for what does not fit. */
export const PlanADay: StoryObj = {
  ...withSeed(async () => {
    await seedBase()
    seeded.report = await createTask({ title: 'Write the Q4 report', project_id: seeded.work, due: { date: TODAY, time: '09:00' }, estimate_minutes: 120, priority: 1 })
    seeded.pr = await createTask({ title: 'Review the landing page copy', project_id: seeded.website, due: { date: TODAY, time: '11:30' }, estimate_minutes: 45 })
    seeded.ink = await createTask({ title: 'Buy printer ink', due: { date: TODAY }, labels: [seeded.errand], estimate_minutes: 20 })
  }),
  render: () => (
    <Conversation messages={() => [
      { role: 'user', text: 'Plan my day, I am at the office until 3.', at: 1 },
      {
        role: 'assistant', at: 2, status: ['Looking at Today…', 'Searching tasks…'],
        text: 'These three are on today:\n\nHere is the day as it stands:\n\nThe garage does not fit before Saturday.',
        blocks: [
          { at: 'These three are on today:\n'.length, block: { kind: 'tasks', ids: [seeded.report, seeded.pr, seeded.ink] } },
          { at: 'These three are on today:\n\nHere is the day as it stands:\n'.length, block: { kind: 'calendar', date: TODAY, span: 'day' } },
          { at: 999, block: { kind: 'choice', question: 'Move “Clean the garage” to the weekend?', options: ['Saturday', 'Sunday', 'Leave it'] } },
        ],
      },
    ]} />
  ),
}

/** A project outline, a note and places (maps off: the list). */
export const ProjectNoteAndPlaces: StoryObj = {
  ...withSeed(async () => {
    await seedBase()
    seeded.flat = await createProject({ name: 'Move flat', color: HEX.teal })
    const pack = await createSection(seeded.flat, 'Pack')
    await createSection(seeded.flat, 'Paperwork')
    await createTask({ title: 'Buy boxes', project_id: seeded.flat, section_id: pack })
    await createTask({ title: 'Label the kitchen boxes', project_id: seeded.flat, section_id: pack })
    seeded.note = await createNote({ title: 'Moving checklist', description: '- Read the **meters** on the last day\n- Forward the post\n- Return the keys' })
    seeded.parcel = await createTask({ title: 'Pick up the parcel', location: { name: 'Post office', address: 'Station Road 4', lat: 52.5, lon: 13.4 } })
    seeded.shop = await createPlace({ name: 'Stationer', address: 'Main Street 1', geo: { lat: 52.51, lon: 13.41 } })
  }),
  render: () => (
    <Conversation messages={() => [
      { role: 'user', text: 'Where am I with the move?', at: 1 },
      {
        role: 'assistant', at: 2, text: 'The project so far:\n\nYour checklist:\n\nTwo errands are close to each other:',
        blocks: [
          { at: 'The project so far:\n'.length, block: { kind: 'project', id: seeded.flat } },
          { at: 'The project so far:\n\nYour checklist:\n'.length, block: { kind: 'note', id: seeded.note } },
          { at: 999, block: { kind: 'map', task_ids: [seeded.parcel], place_ids: [seeded.shop] } },
        ],
      },
    ]} />
  ),
}

/** A proposal that moves work across the week, in its calendar shape (the list one switch away). */
function WeekProposal() {
  const [review, setReview] = useState<Review | null>(null)
  useEffect(() => {
    const plan = [[seeded.a, 1], [seeded.b, 1], [seeded.c, 2], [seeded.d, 3]] as const
    void reviewChangeSet(plan.map(([id, days]) => ({ entity: 'task', entityId: id, patch: { due: { date: addDaysISO(TODAY, days) } }, base: { due: { date: TODAY } } }))).then(setReview)
  }, [])
  if (!review) return null
  return (
    <Page min="min-h-[40rem]">
      <AssistantPanelBody {...base} layout="page" review={review} onEdit={noop}
        messages={[{ role: 'user', text: 'Today is too full, spread it over the next days.', at: 1 }, { role: 'assistant', text: 'I moved four tasks to the next three days; review it below.', at: 2 }]} />
    </Page>
  )
}

export const WeekPlanProposal: StoryObj = {
  ...withSeed(async () => {
    await seedBase()
    await createTask({ title: 'Team sync', due: { date: addDaysISO(TODAY, 1), time: '10:00' }, estimate_minutes: 30 })
    seeded.a = await createTask({ title: 'Draft the roadmap', due: { date: TODAY }, estimate_minutes: 90 })
    seeded.b = await createTask({ title: 'Reply to the agency', due: { date: TODAY }, estimate_minutes: 20 })
    seeded.c = await createTask({ title: 'Review the budget', due: { date: TODAY }, estimate_minutes: 60 })
    seeded.d = await createTask({ title: 'Book the venue', due: { date: TODAY } })
  }),
  render: () => <WeekProposal />,
}

/** Where the week's time went, tomorrow's free time between meetings, and what is due by Friday (assistant-time-blocks). */
export const TimeFreeTimeAndDeadlines: StoryObj = {
  ...withSeed(async () => {
    await seedBase()
    await setCurrentUserId(storyUser.id)
    await setMeta('calendar.grid', { startHour: 8, endHour: 18, dayLength: 480 })
    const at = (date: string, h: number, m = 0) => { const [y, mo, d] = date.split('-').map(Number); return new Date(y, mo - 1, d, h, m).getTime() }
    const copy = await createTask({ title: 'Landing page copy', project_id: seeded.website })
    const report = await createTask({ title: 'Q4 report', project_id: seeded.work })
    const tap = await createTask({ title: 'Fix the kitchen tap', project_id: seeded.home })
    const monday = addDaysISO(TODAY, -2)
    await logTime(copy, at(monday, 9), at(monday, 12, 30))
    await logTime(report, at(monday, 14), at(monday, 16))
    await logTime(copy, at(addDaysISO(TODAY, -1), 9), at(addDaysISO(TODAY, -1), 11))
    await logTime(tap, at(addDaysISO(TODAY, -1), 18), at(addDaysISO(TODAY, -1), 19, 15))
    await logTime(report, at(TODAY, 8, 30), at(TODAY, 11))
    await db.calendarEvents.bulkPut([
      { id: 'standup', subscriptionId: 'work', uid: 'a', summary: 'Standup', location: '', start: { date: TOMORROW, time: '09:00' }, end: { date: TOMORROW, time: '09:30' }, allDay: false, free: false },
      { id: 'review', subscriptionId: 'work', uid: 'b', summary: 'Design review', location: '', start: { date: TOMORROW, time: '13:00' }, end: { date: TOMORROW, time: '14:30' }, allDay: false, free: false },
    ])
    await createTask({ title: 'Call the plumber', due: { date: TOMORROW, time: '16:00' }, estimate_minutes: 30, project_id: seeded.home })
    await createTask({ title: 'Send the Q4 report', deadline: addDaysISO(TODAY, 2), project_id: seeded.work })
    await createTask({ title: 'Approve the launch copy', deadline: TOMORROW, project_id: seeded.website })
    await createTask({ title: 'Renew the parking permit', deadline: TODAY })
  }),
  render: () => (
    <Conversation messages={() => [
      { role: 'user', text: 'Where did my time go this week, and when can I fit two hours of focus before Friday?', at: 1 },
      {
        role: 'assistant', at: 2, status: ['Looking for free time…'],
        text: 'This week so far:\n\nTomorrow has room between meetings:\n\nAnd what is due by Friday:',
        blocks: [
          { at: 'This week so far:\n'.length, block: { kind: 'time', from: addDaysISO(TODAY, -2), to: addDaysISO(TODAY, 4), group_by: 'project' } },
          { at: 'This week so far:\n\nTomorrow has room between meetings:\n'.length, block: { kind: 'free_time', date: TOMORROW, span: 'day', min_minutes: 60 } },
          { at: 999, block: { kind: 'deadlines', from: TODAY, to: addDaysISO(TODAY, 2) } },
        ],
      },
    ]} />
  ),
}

/** What is in progress on the website, whether the renovation is on track, and what happened on it (assistant-project-blocks). */
export const BoardTimelineAndActivity: StoryObj = {
  ...withSeed(async () => {
    await seedProjectWithSections(false)
    await setCurrentUserId(storyUser.id)
    seeded.doing = (await db.sections.where('project_id').equals(seeded.website).filter((x) => x.name === 'In progress').first())!.id
    seeded.reno = await createProject({ name: 'Renovation', color: HEX.teal })
    await createTask({ title: 'Order the tiles', project_id: seeded.reno, start: '2026-10-06', deadline: '2026-10-12' })
    await createTask({ title: 'Strip the old wallpaper', project_id: seeded.reno, start: '2026-10-10', due: { date: '2026-10-16' } })
    await createTask({ title: 'Paint the living room', project_id: seeded.reno, start: '2026-10-17', due: { date: '2026-10-21' }, deadline: '2026-10-23' })
    await createTask({ title: 'Fit the new lights', project_id: seeded.reno, due: { date: '2026-10-27' } })
    await createTask({ title: 'Choose a sofa', project_id: seeded.reno })
  }),
  render: () => (
    <Conversation messages={() => [
      { role: 'user', text: 'What is in progress on the website, and is the renovation on track?', at: 1 },
      {
        role: 'assistant', at: 2, status: ['Looking at your projects…'],
        text: 'In progress on Website launch:\n\nThe renovation, with the tiles already late:\n\nAnd the latest on it:',
        blocks: [
          { at: 'In progress on Website launch:\n'.length, block: { kind: 'board', id: seeded.website, section_id: seeded.doing } },
          { at: 'In progress on Website launch:\n\nThe renovation, with the tiles already late:\n'.length, block: { kind: 'timeline', id: seeded.reno } },
          { at: 999, block: { kind: 'activity', of: 'project', id: seeded.reno } },
        ],
      },
    ]} />
  ),
}

/** How the week went, one task in full and a habit's streak (assistant-project-blocks). */
export const StatsTaskAndHabit: StoryObj = {
  ...withSeed(async () => {
    await seedBase()
    await setCurrentUserId(storyUser.id)
    await db.userPrefs.put({ id: 'me', today_limit: 5, _clock: {} } as never)
    for (const [title, date] of [['Send the invoice', '2026-10-12'], ['Book the venue', '2026-10-13'], ['Reply to the agency', TODAY]] as const) {
      await createTask({ title, due: { date }, completed: true })
    }
    await createTask({ title: 'File the expenses', due: { date: '2026-10-09' } })
    seeded.brief = await createTask({ title: 'Write the launch brief', project_id: seeded.website, due: { date: TOMORROW }, deadline: '2026-10-17', priority: 2,
      description: 'One page for the agency: **goal**, audience, the three messages and the dates.' })
    await createTask({ title: 'Collect the numbers', parent_id: seeded.brief, completed: true })
    await createTask({ title: 'Draft the three messages', parent_id: seeded.brief })
    await createComment({ taskId: seeded.brief, body: 'The agency needs it by Friday.' })
    await createComment({ taskId: seeded.brief, body: 'Use the Q3 numbers, not the forecast.' })
    seeded.run = await createTask({ title: 'Run', recurrence: 'every day', due: { date: TODAY }, project_id: seeded.health })
    await updateTask(seeded.run, { habit: true })
    const days = [1, 2, 3, 4, 5, 7, 8, 9, 11, 12].map((n) => addDaysISO(TODAY, -n))
    await db.tasks.bulkPut(days.map((date) => ({
      id: occurrenceId(seeded.run, date), title: 'Run', description: '', project_id: seeded.health, parent_id: null, priority: 4, due: { date }, labels: [], position: 0,
      created_at: 1, completed_at: 1, deleted_at: null, series_id: seeded.run, occurrence_date: date, _clock: {},
    })) as never)
  }),
  render: () => (
    <Conversation messages={() => [
      { role: 'user', text: 'How am I doing this week? And where is the launch brief?', at: 1 },
      {
        role: 'assistant', at: 2, status: ['Looking at Today…'],
        text: 'This week so far:\n\nThe brief is half done:\n\nAnd running is on a roll:',
        blocks: [
          { at: 'This week so far:\n'.length, block: { kind: 'stats', from: '2026-10-12', to: '2026-10-18' } },
          { at: 'This week so far:\n\nThe brief is half done:\n'.length, block: { kind: 'task', id: seeded.brief } },
          { at: 999, block: { kind: 'habit', id: seeded.run } },
        ],
      },
    ]} />
  ),
}

/** Follow-up suggestions under the latest answer only (assistant-followups). */
export const FollowUps: StoryObj = {
  ...withSeed(async () => {
    await seedBase()
    seeded.invoice = await createTask({ title: 'Send the invoice', due: { date: addDaysISO(TODAY, -3) }, priority: 2 })
    seeded.dentist = await createTask({ title: 'Call the dentist', due: { date: addDaysISO(TODAY, -2) } })
    seeded.expenses = await createTask({ title: 'File the expenses', due: { date: addDaysISO(TODAY, -1) }, project_id: seeded.work })
  }),
  render: () => (
    <Conversation messages={() => [
      { role: 'user', text: 'Anything with a deadline this week?', at: 1 },
      { role: 'assistant', at: 2, text: 'Nothing has a deadline this week.', followups: ['Show next week'] },
      { role: 'user', text: 'What is overdue?', at: 3 },
      {
        role: 'assistant', at: 4, status: ['Looking at Today…'],
        text: 'Three tasks are overdue:\n\nThe invoice is the oldest, so I would start there.',
        blocks: [{ at: 'Three tasks are overdue:\n'.length, block: { kind: 'tasks', ids: [seeded.invoice, seeded.dentist, seeded.expenses] } }],
        followups: ['Move them to Friday', 'Break down Send the invoice', 'Plan tomorrow'],
      },
    ]} />
  ),
}
