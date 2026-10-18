import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { Avatar } from './Avatar'
import { Badge, Card } from './Card'
import { Tabs } from './Tabs'
import { HUES } from './tokens/palette'

const PEOPLE = [['u-ada', 'Ada Lovelace'], ['u-bob', 'Bob Okafor'], ['u-sam', 'Sam Rivera'], ['u-mei', 'Mei Chen'], ['u-joe', 'joe@example.com']]

function Surfaces() {
  const [tab, setTab] = useState('comments')
  return (
    <div className="space-y-6">
      <Card>
        <h3 className="text-h3 font-semibold">Card</h3>
        <p className="text-body text-muted">A surface with soft elevation for grouped content.</p>
      </Card>
      <div className="flex flex-wrap gap-2">
        {HUES.map((h) => <Badge key={h.name} hue={h.name}>{h.name}</Badge>)}
      </div>
      <div className="flex flex-wrap gap-2">
        {HUES.slice(0, 6).map((h) => <Badge key={h.name} hue={h.name} tone="solid">{h.name}</Badge>)}
        <Badge color="#a0522d">stored #a0522d</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {PEOPLE.map(([id, name]) => <span key={id} className="inline-flex items-center gap-2 text-sm"><Avatar id={id} name={name} size="md" />{name}</span>)}
        <Avatar id="u-ada" name="Ada Lovelace" size="lg" decorative={false} />
      </div>
      <Tabs label="Task sections" value={tab} onChange={setTab} tabs={[{ id: 'comments', label: 'Comments', count: 3 }, { id: 'activity', label: 'Activity' }, { id: 'history', label: 'History' }]}>
        <p className="text-body">Panel: {tab}</p>
      </Tabs>
    </div>
  )
}

const meta: Meta = { title: 'UI/Surfaces' }
export default meta
export const Default: StoryObj = { render: () => <Surfaces /> }

const PHASED = [
  { id: 'inbox', label: 'Inbox', count: 3, group: 'Get clear' }, { id: 'sweep', label: 'Mind sweep', group: 'Get clear' },
  { id: 'back', label: 'Look back', count: 2, group: 'Get current' }, { id: 'waiting', label: 'Waiting', group: 'Get current' },
  { id: 'projects', label: 'Projects', count: 5, group: 'Get current' }, { id: 'ahead', label: 'Look ahead', group: 'Get current' },
  { id: 'someday', label: 'Someday', group: 'Get creative' },
]

function GroupedTabs() {
  const [tab, setTab] = useState('projects')
  return (
    <div className="max-w-sm">
      <Tabs label="Review steps" value={tab} onChange={setTab} tabs={PHASED}>
        <p className="text-body">Panel: {tab}</p>
      </Tabs>
    </div>
  )
}

/** Tabs in groups (the review's phases), wider than the column: the row scrolls sideways and keeps the selected tab in view. */
export const GroupedTabsAtPhoneWidth: StoryObj = { render: () => <GroupedTabs /> }
