import type { Meta, StoryObj } from '@storybook/react-vite'
import type { Briefing } from '../lib/briefing'
import { PageBody, PageHeader } from '../ui'
import { BriefingText } from './Briefing'
import { withClock } from './stories/fixtures'

// Core screen: the briefing under a day page's title (OpenSpec change briefing;
// web-app "Day page briefing"). The facts are given directly, so each story shows
// one mode of the sentence: three things in their tones, a calm day, all done with
// tomorrow, and Upcoming.
const meta: Meta = { title: 'Screens/Briefing', decorators: [withClock] }
export default meta

function Day({ title, date, briefing }: { title: string; date: string; briefing: Briefing }) {
  return (
    <div className="-m-4 bg-canvas">
      <PageBody width="list">
        <PageHeader kind="day" title={title} meta={date} sticky={false} briefing={<BriefingText briefing={briefing} />} />
      </PageBody>
    </div>
  )
}

/** Three things: a late task (danger), a full day ahead (warning) and a reply. */
export const ThreeThings: StoryObj = {
  render: () => <Day title="Today" date="Thursday 22 October" briefing={{
    mode: 'today', open: 6, planned: 240,
    facts: [
      { kind: 'late', count: 1, ids: ['p'], task: { id: 'p', title: 'Renew the passport' }, days: 2 },
      { kind: 'full', dates: ['2026-10-26'] },
      { kind: 'replies', count: 1, name: 'Mia', task: { id: 'b', title: 'Call the plumber about the boiler' } },
    ],
  }} />,
}

/** Counts as links (briefing-links D2, D3): the late tasks select themselves in Today, the replies open the notifications. */
export const CountsAsLinks: StoryObj = {
  render: () => <Day title="Today" date="Thursday 22 October" briefing={{
    mode: 'today', open: 7, planned: 0,
    facts: [{ kind: 'late', count: 2, ids: ['a', 'b'] }, { kind: 'replies', count: 3 }],
  }} />,
}

/** Nothing stands out: the open count and the planned time. */
export const Calm: StoryObj = {
  render: () => <Day title="Today" date="Thursday 22 October" briefing={{ mode: 'today', open: 4, planned: 195, facts: [] }} />,
}

/** Empty Today after the last task: all done, then tomorrow's first task with its time. */
export const AllDone: StoryObj = {
  render: () => <Day title="Today" date="Thursday 22 October" briefing={{ mode: 'done', tomorrow: { count: 4, first: { id: 's', title: 'Standup', time: '09:30' } } }} />,
}

/** Upcoming: the week ahead, the full days and tomorrow. */
export const Upcoming: StoryObj = {
  render: () => <Day title="Upcoming" date="Next seven days" briefing={{
    mode: 'upcoming', count: 11, facts: [{ kind: 'full', dates: ['2026-10-23', '2026-10-26'] }],
    tomorrow: { count: 3, first: { id: 'g', title: 'Groceries' } },
  }} />,
}
