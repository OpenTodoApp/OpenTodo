import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { Button, IconButton } from '../Button'
import { ListGroupHeader } from './ListGroupHeader'

const meta: Meta = { title: 'UI/Patterns/ListGroupHeader' }
export default meta

const Row = ({ title }: { title: string }) => (
  <div className="flex min-h-9 items-center gap-2 px-2 text-body"><span className="h-4 w-4 rounded-full border border-strong" />{title}</div>
)

/**
 * Group headers are small labels (page-rhythm D2): a group the view generated is
 * uppercase with wide tracking; a name the user wrote keeps its case. None is red.
 */
export const Kinds: StoryObj = {
  render: () => (
    <div className="w-[28rem] space-y-4">
      <section><ListGroupHeader title="Earlier" count={2} /><Row title="Renew passport" /><Row title="Call the bank" /></section>
      <section><ListGroupHeader title="Today" count={1} /><Row title="Write the report" /></section>
      <section><ListGroupHeader title="Blocked" count={1} collapsed onToggle={() => {}} /></section>
      <section><ListGroupHeader title="Planning" kind="named" count={2} /><Row title="Draft the brief" /><Row title="Book the room" /></section>
    </div>
  ),
}

/** Today's Earlier group keeps its two actions visible, collapsed or open; on a phone they wrap under the label. */
export const AlwaysVisibleActions: StoryObj = {
  render: () => (
    <div className="w-full max-w-[28rem] space-y-4">
      <ListGroupHeader title="Earlier" count={8} collapsed onToggle={() => {}} actionsAlwaysVisible
        actions={<><Button variant="ghost" size="sm" className="text-meta">Move all to today</Button><Button variant="ghost" size="sm" className="text-meta">Reschedule…</Button></>} />
    </div>
  ),
}

/** Collapsible groups toggle from the heading; trailing actions appear on hover or focus. */
export const Collapsible: StoryObj = {
  render: function CollapsibleStory() {
    const [collapsed, setCollapsed] = useState(false)
    return (
      <div className="w-[28rem]">
        <ListGroupHeader title="Kitchen" kind="named" count={2} collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)}
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
        <ListGroupHeader title="Done" kind="named" count={0}
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
