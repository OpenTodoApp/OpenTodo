import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { IconButton } from '../Button'
import { ListGroupHeader } from './ListGroupHeader'

const meta: Meta = { title: 'UI/Patterns/ListGroupHeader' }
export default meta

const Row = ({ title }: { title: string }) => (
  <div className="flex min-h-9 items-center gap-2 px-2 text-body"><span className="h-4 w-4 rounded-full border border-strong" />{title}</div>
)

/** Date, project and section groups share one header; Overdue keeps the danger tone. */
export const Tones: StoryObj = {
  render: () => (
    <div className="w-[28rem] space-y-4">
      <section><ListGroupHeader title="Overdue" count={2} tone="danger" /><Row title="Renew passport" /><Row title="Call the bank" /></section>
      <section><ListGroupHeader title="Today" count={1} /><Row title="Write the report" /></section>
      <section><ListGroupHeader title="Blocked" count={1} tone="muted" collapsed onToggle={() => {}} /></section>
    </div>
  ),
}

/** Collapsible groups toggle from the heading; trailing actions appear on hover or focus. */
export const Collapsible: StoryObj = {
  render: function CollapsibleStory() {
    const [collapsed, setCollapsed] = useState(false)
    return (
      <div className="w-[28rem]">
        <ListGroupHeader title="Kitchen" count={2} collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)}
          actions={<><IconButton icon="plus" label="Add a task to Kitchen" size="sm" /><IconButton icon="ellipsis" label="Section menu" size="sm" /></>} />
        {!collapsed && <><Row title="Tiles" /><Row title="Taps" /></>}
      </div>
    )
  },
}

/** A section with only completed tasks keeps its header with a note and a reveal. */
export const CompletedOnly: StoryObj = {
  render: function CompletedOnlyStory() {
    const [revealed, setRevealed] = useState(false)
    return (
      <div className="w-[28rem]">
        <ListGroupHeader title="Done" count={0}
          note={<span className="flex items-center gap-1">3 completed<button type="button" className="rounded-chip px-1.5 py-0.5 text-meta text-accent hover:bg-sunken dark:hover:bg-raised" aria-expanded={revealed} onClick={() => setRevealed((v) => !v)}>{revealed ? 'Hide' : 'Show'}</button></span>} />
        {revealed && <><Row title="Order paint" /><Row title="Measure the wall" /><Row title="Pick a colour" /></>}
      </div>
    )
  },
}

/** Sub-projects at the top of a project reuse the header at level 2. */
export const SubProjects: StoryObj = {
  render: () => (
    <div className="w-[28rem]">
      <ListGroupHeader title="Sub-projects" count={2} collapsed={false} onToggle={() => {}} />
      <Row title="Kitchen" />
      <Row title="Garden" />
    </div>
  ),
}
