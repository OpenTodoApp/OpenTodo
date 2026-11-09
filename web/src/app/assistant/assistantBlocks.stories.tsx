import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { reviewChangeSet, type Review } from '../../lib/assistant'
import type { AssistantStatus } from '../../lib/assistantStatus'
import type { AssistantMessage } from '../../lib/db'
import { createPlace } from '../../lib/locations'
import { createNote } from '../../lib/noteOps'
import { createProject, createTask } from '../../lib/ops'
import { createSection } from '../../lib/sections'
import { addDaysISO } from '../../lib/dates'
import { HEX, seeded, seedBase, TODAY, withSeed } from '../stories/fixtures'
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
  onSend: noop, onStop: noop, onAccept: noop, onPickThread: noop, onChoose: noop, onRegenerate: noop, onEditLast: noop, canRedo: true,
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
