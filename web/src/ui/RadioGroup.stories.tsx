import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { RadioGroup } from './RadioGroup'

function Cards() {
  const [v, setV] = useState<'read' | 'agent' | 'admin'>('read')
  return (
    <div className="max-w-md">
      <RadioGroup label="What the assistant may do" value={v} onChange={setV} options={[
        { value: 'read', label: 'Read only', description: 'Reads your tasks and projects, never changes them.' },
        { value: 'agent', label: 'Can make changes', description: 'Also adds and changes tasks, while you allow it.' },
        { value: 'admin', label: 'Administration', disabled: true, reason: 'Needs a recent sign-in.' },
      ]} />
    </div>
  )
}

function List() {
  const [v, setV] = useState<'bottom' | 'top'>('bottom')
  return (
    <div className="max-w-md">
      <RadioGroup variant="list" label="Add new tasks" value={v} onChange={setV} options={[
        { value: 'bottom', label: 'At the bottom of the list' },
        { value: 'top', label: 'At the top of the list' },
      ]} />
    </div>
  )
}

const meta: Meta = { title: 'UI/Radio group' }
export default meta
export const CardsVariant: StoryObj = { name: 'Cards', render: () => <Cards /> }
export const ListVariant: StoryObj = { name: 'List', render: () => <List /> }
