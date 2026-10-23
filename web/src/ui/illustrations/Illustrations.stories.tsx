import type { CSSProperties } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { EmptyState } from '../patterns/EmptyState'
import { Illustration } from './Illustration'
import { DayDone } from './DayDone'
import { InboxZero } from './InboxZero'
import { ProjectNew } from './ProjectNew'
import { TodayClear } from './TodayClear'
import { TrashEmpty } from './TrashEmpty'
import { WeekClear } from './WeekClear'

const DRAWINGS = { 'inbox-zero': InboxZero, 'today-clear': TodayClear, 'week-clear': WeekClear, 'project-new': ProjectNew, 'day-done': DayDone, 'trash-empty': TrashEmpty }

// Illustrations (inbox-means-unplaced D9, design-system "Illustrations"; the set from
// moments-and-onboarding D1): the workbench shows each one in light and dark, alone
// and in the empty-state pattern.
const meta: Meta = { title: 'UI/Illustrations' }
export default meta

export const InboxZeroDrawing: StoryObj = {
  name: 'Inbox zero',
  render: () => <div className="flex gap-6 p-4 text-muted"><InboxZero /><Illustration name="inbox-zero" /></div>,
}

export const InboxZeroEmptyState: StoryObj = {
  name: 'Inbox zero empty state',
  render: () => <EmptyState illustration="inbox-zero" title="Inbox zero: every task has a place." action={{ label: 'Back to the Inbox', onClick: () => {} }} />,
}

export const Set: StoryObj = {
  name: 'Illustration set',
  render: () => (
    <div className="flex flex-wrap gap-6 p-4">
      {Object.entries(DRAWINGS).map(([name, Drawing]) => (
        <figure key={name} className="flex flex-col items-center gap-1 text-meta text-muted">
          <Drawing />
          <figcaption>{name}</figcaption>
        </figure>
      ))}
    </div>
  ),
}

const ACCENTS = ['emerald', 'blue', 'indigo', 'violet', 'rose', 'orange', 'teal', 'graphite']
// The colour tokens resolve at the root, so a row with its own accent declares them again.
const ROW_TOKENS = { '--color-accent': 'var(--ot-accent)', '--text-color-accent': 'var(--ot-accent-text)' } as CSSProperties

// illustrations-v2: every drawing in every accent theme, so a change to a drawing or a
// token is seen in all of them at once (the theme toolbar switches light and dark).
export const EveryAccent: StoryObj = {
  name: 'Illustration set in every accent',
  render: () => (
    <div className="flex flex-col gap-2 p-4">
      {ACCENTS.map((accent) => (
        <div key={accent} data-accent={accent} style={ROW_TOKENS} className="flex items-center gap-2 text-meta text-muted">
          <span className="w-16">{accent}</span>
          {Object.entries(DRAWINGS).map(([name, Drawing]) => <Drawing key={name} />)}
        </div>
      ))}
    </div>
  ),
}

export const TodayClearEmptyState: StoryObj = {
  name: 'Today clear empty state',
  render: () => <EmptyState illustration="today-clear" title="Nothing due today." action={{ label: 'Add a task', onClick: () => {} }} />,
}

export const WeekClearEmptyState: StoryObj = {
  name: 'Week clear empty state',
  render: () => <EmptyState illustration="week-clear" title="Nothing scheduled yet." action={{ label: 'Add a task', onClick: () => {} }} />,
}

export const ProjectNewEmptyState: StoryObj = {
  name: 'Project new empty state',
  render: () => <EmptyState illustration="project-new" title="This project has no open tasks." action={{ label: 'Add a task', onClick: () => {} }} />,
}

export const DayDoneEmptyState: StoryObj = {
  name: 'Day done',
  render: () => <EmptyState illustration="day-done" title="Day closed, 18:42" action={{ label: 'Back to Today', onClick: () => {} }} />,
}

export const TrashEmptyEmptyState: StoryObj = {
  name: 'Trash empty empty state',
  render: () => <EmptyState illustration="trash-empty" title="The Trash is empty." action={{ label: 'Open Inbox', onClick: () => {} }} />,
}
