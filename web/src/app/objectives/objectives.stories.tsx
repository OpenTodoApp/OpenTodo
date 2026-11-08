import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { reviewPlan } from '../../lib/objectives'
import type { Objective } from '../../lib/types'
import { TODAY, withClock } from '../stories/fixtures'
import type { ObjectiveActions } from './ObjectiveCards'
import { ObjectivesStripView, stripGroups } from './ObjectivesStrip'
import { ReviewObjectivesView } from './ReviewObjectives'

// Objectives (OpenSpec change plan-objectives) on the frozen Wednesday 14 October
// 2026 (Q4 2026, week 42, Monday weeks): the Plan's strip expanded with a done,
// struck-through card and a long title, the week at the limit, the phone's
// summary line, and the review's Look ahead section with last week's leftovers.
const meta: Meta = { title: 'Calendar/Objectives', decorators: [withClock] }
export default meta

let n = 0
const o = (title: string, period: string, extra: Partial<Objective> = {}): Objective =>
  ({ id: `o${++n}`, title, period, position: n, done_at: 0, created_at: 0, deleted_at: null, _clock: {}, ...extra })

const rows = [
  o('Ship the 1.0 release', '2026-Q4'),
  o('Hire a designer for the onboarding flow and the new website, before the holidays', '2026-Q4'),
  o('Move the backups to the new server', '2026-Q4', { done_at: 1 }),
  o('Draft the talk', '2026-W42'),
  o('Book the venue for the offsite', '2026-W42', { done_at: 1 }),
]
const full = [...rows, ...['Reply to the landlord', 'Renew the passport', 'Call the accountant', 'Pay the rent'].map((t) => o(t, '2026-W42'))]

const none: ObjectiveActions = { onToggle: () => {}, onRename: () => {}, onDrop: () => {}, onMove: () => {}, onPlace: () => {}, onAdd: () => {} }

function Strip({ list, wide, start = TODAY }: { list: Objective[]; wide: boolean; start?: string }) {
  const [collapsed, setCollapsed] = useState(!wide)
  return <ObjectivesStripView groups={stripGroups(TODAY, start, 1)} rows={list} wide={wide} actions={none} collapsed={collapsed} onCollapsed={setCollapsed} />
}

export const PlanStrip: StoryObj = { render: () => <div className="w-full max-w-5xl"><Strip list={rows} wide /></div> }

export const AtTheLimitWithNextWeek: StoryObj = { render: () => <div className="w-full max-w-5xl"><Strip list={full} wide start="2026-10-19" /></div> }

export const PhoneSummary: StoryObj = { render: () => <div className="w-full max-w-sm"><Strip list={rows} wide={false} /></div> }

export const ReviewSection: StoryObj = {
  render: () => {
    const sunday = '2026-10-18'
    const list = [...rows, o('Clear the inbox', '2026-W42'), o('Plan the sprint', '2026-W43')]
    return (
      <div className="w-full max-w-2xl">
        <ReviewObjectivesView today={sunday} rows={list} plan={reviewPlan(sunday, 1, Date.UTC(2026, 9, 11))} onFlip={() => {}} actions={none}
          onCarry={() => {}} onDone={() => {}} onDrop={() => {}} />
      </div>
    )
  },
}
