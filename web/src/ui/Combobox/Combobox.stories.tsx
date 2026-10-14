import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { Avatar } from '../Avatar'
import { HUES } from '../tokens/palette'
import { Combobox, ComboboxPanel } from './Combobox'

type Person = { id: string; name: string; email: string }
const PEOPLE: Person[] = [
  { id: 'unassigned', name: 'Unassigned', email: '' }, { id: 'me', name: 'You', email: 'ada@example.com' },
  { id: 'u-bob', name: 'Bob Okafor', email: 'bob@example.com' }, { id: 'u-sam', name: 'Sam Rivera', email: 'sam@example.com' },
  { id: 'u-mei', name: 'Mei Chen', email: 'mei@example.com' }, { id: 'u-jose', name: 'José Álvarez', email: 'jose@example.com' },
]
type Label = { id: string; name: string; color: string }
const LABELS: Label[] = ['errands', 'waiting', 'deep-work', 'calls', 'home', 'café'].map((n, i) => ({ id: n, name: n, color: HUES[i].hex }))
type Project = { id: string; name: string; path: string[] }
const PROJECTS: Project[] = [
  { id: 'inbox', name: 'Inbox', path: [] }, { id: 'home', name: 'Home', path: [] }, { id: 'kitchen', name: 'Kitchen renovation', path: ['Home'] },
  { id: 'work', name: 'Work', path: [] }, { id: 'q3', name: 'Q3 plan', path: ['Work'] }, { id: 'hiring', name: 'Hiring', path: ['Work'] },
  { id: 'grocery', name: 'Grocery shopping', path: [] },
]
const TASKS = Array.from({ length: 10_000 }, (_, i) => ({ id: `t${i}`, name: `Task ${i + 1}: follow up on item ${(i * 7919) % 10_000}` }))

function People() {
  const [picked, setPicked] = useState('unassigned')
  return (
    <div className="max-w-sm space-y-2">
      <ComboboxPanel label="Assign task" placeholder="Search people" source={PEOPLE} pinned={['unassigned', 'me']} selected={[picked]}
        getKey={(p) => p.id} getLabel={(p) => p.name} getSecondary={(p) => p.email || undefined}
        renderLeading={(p) => (p.id === 'unassigned' ? <span className="h-6 w-6" /> : <Avatar id={p.id} name={p.name} size="sm" />)}
        rankContext="story:assignee" onPick={(p) => setPicked(p.id)} />
    </div>
  )
}

function Labels() {
  const [labels, setLabels] = useState(LABELS)
  const [on, setOn] = useState<string[]>(['waiting'])
  return (
    <div className="max-w-sm">
      <ComboboxPanel label="Labels for task" placeholder="Search or create a label" source={labels} multiple selected={on}
        getKey={(l) => l.id} getLabel={(l) => l.name} rankContext="story:label"
        renderLeading={(l) => <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.color }} />}
        onPick={(l) => setOn((cur) => (cur.includes(l.id) ? cur.filter((x) => x !== l.id) : [...cur, l.id]))}
        onCreate={(q) => { setLabels((ls) => [...ls, { id: q, name: q, color: HUES[ls.length % 12].hex }]); setOn((c) => [...c, q]) }} />
    </div>
  )
}

function Projects() {
  return (
    <div className="max-w-sm">
      <Combobox label="Project" placeholder="Move to project…" source={PROJECTS} getKey={(p) => p.id} getLabel={(p) => p.name} getPath={(p) => p.path}
        rankContext="story:project" onPick={() => {}} />
    </div>
  )
}

function Async() {
  const source = async (q: string, signal: AbortSignal) => {
    await new Promise((r) => setTimeout(r, 400))
    if (signal.aborted) return { items: [] }
    return { items: TASKS.filter((t) => t.name.toLowerCase().includes(q.toLowerCase())).slice(0, 50) }
  }
  return (
    <div className="max-w-sm">
      <ComboboxPanel label="Parent task" placeholder="Search tasks" source={source} getKey={(t) => t.id} getLabel={(t) => t.name}
        emptyText="No tasks match. Try fewer words." onPick={() => {}} />
    </div>
  )
}

function Large() {
  return (
    <div className="max-w-sm">
      <ComboboxPanel label="Task" placeholder="Search 10,000 tasks" source={TASKS} getKey={(t) => t.id} getLabel={(t) => t.name} onPick={() => {}} />
    </div>
  )
}

const meta: Meta = { title: 'UI/Combobox' }
export default meta
export const PeopleWithAvatars: StoryObj = { render: () => <People /> }
export const LabelsWithCreate: StoryObj = { render: () => <Labels /> }
export const ProjectTree: StoryObj = { render: () => <div style={{ minHeight: 380 }}><Projects /></div> }
export const AsyncSource: StoryObj = { render: () => <Async /> }
export const TenThousandOptions: StoryObj = { render: () => <Large /> }
