import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { NoteEntry } from '../../lib/noteList'
import { buildGraph } from '../../lib/notesGraph'
import { hueFor, type HueName } from '../../ui'
import { NotesModeSwitch } from '../notes/NotesPage'
import { HEX } from '../stories/fixtures'
import { GraphView } from './GraphView'

// The Notes page's Graph mode (OpenSpec change notes-graph-page): the whole graph of
// a small workspace, coloured by project and shaped by kind, with a project as the
// topic, and the List | Graph switch of the header. The canvas is drawn after the
// layout runs: the story stays data-story-pending until it is.
const meta: Meta = { title: 'Screens/Notes graph' }
export default meta

const PROJECTS: Record<string, string> = { home: HEX.green, trip: HEX.blue, work: HEX.violet, reading: HEX.orange }
const hueOf = (id: string | null): HueName | null => (id && PROJECTS[id] ? hueFor(PROJECTS[id]) : null)

const TITLES: Record<string, string[]> = {
  home: ['Wi-Fi and router', 'Boiler service', 'Kitchen shelves', 'Paint colours', 'Moving checklist', 'Recycling days'],
  trip: ['Trip to Lisbon', 'Packing list', 'Ferry times', 'Places to eat', 'Day trip to Sintra', 'Phrasebook', 'Budget'],
  work: ['Launch plan', 'Pricing page', 'Press kit', 'Beta feedback', 'Release checklist', 'Weekly sync', 'Risks'],
  reading: ['Reading list', 'Deep Work', 'Thinking in Systems', 'Quotes', 'Book club'],
}
const ENTRIES: NoteEntry[] = Object.entries(TITLES).flatMap(([p, titles]) => titles.map((title, i) => ({
  key: `${i % 4 === 3 ? 'task' : 'note'}:${p}-${i}`, source: i % 4 === 3 ? 'task' as const : 'note' as const, id: `${p}-${i}`, title, text: '', projectId: p, labels: [], updated: 0,
})))
ENTRIES.push({ key: 'note:index', source: 'note', id: 'index', title: 'Index', text: '', projectId: null, labels: [], updated: 0 })
// Each note links to the next two of its project, the first of each project to the Index, and a few across.
const LINKS: [string, string][] = []
for (const titles of Object.keys(TITLES)) {
  const keys = ENTRIES.filter((e) => e.projectId === titles).map((e) => e.key)
  keys.forEach((k, i) => { LINKS.push([k, keys[(i + 1) % keys.length]]); if (i % 2 === 0) LINKS.push([k, keys[(i + 2) % keys.length]]) })
  LINKS.push(['note:index', keys[0]])
}
LINKS.push(['note:trip-1', 'note:home-4'], ['note:work-2', 'note:reading-1'], ['note:trip-6', 'task:secondary'], ['note:trip-0', 'task:secondary'])
const GRAPH = buildGraph(ENTRIES, (fn) => { for (const [a, b] of LINKS) fn(a, b) }, (kind, id) => (kind === 'task' && id === 'secondary' ? { title: 'Book the ferry', projectId: 'trip', done: false } : null))

/** Waits for the canvas's first frame before the visual check captures it. */
function Drawn({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  const [drawn, setDrawn] = useState(false)
  useEffect(() => {
    let frame = 0
    const check = () => {
      if (root.current?.querySelector('[data-notes-graph][data-ready]')) frame = requestAnimationFrame(() => requestAnimationFrame(() => setDrawn(true)))
      else frame = requestAnimationFrame(check)
    }
    check()
    return () => cancelAnimationFrame(frame)
  }, [])
  return <div ref={root} className="flex h-[36rem] flex-col bg-surface px-4 md:px-8">{children}{!drawn && <span data-story-pending />}</div>
}

function Graph({ topic = null }: { topic?: ReadonlySet<string> | null }) {
  return (
    <Drawn>
      <GraphView graph={GRAPH} topic={topic} topicKey={topic ? 'topic' : ''} matches={null} hueOf={hueOf} onOpen={() => {}} onClosePane={() => false} persist={false} />
    </Drawn>
  )
}

/** Every linked note of the workspace, coloured by project; tasks are squares, a task without a note hollow. */
export const Overview: StoryObj = { render: () => <Graph /> }

/** A project as the topic: its notes stay lit, the rest dims in place. */
export const Topic: StoryObj = { render: () => <Graph topic={new Set(ENTRIES.filter((e) => e.projectId === 'trip').map((e) => e.key))} /> }

function Switches() {
  const [mode, setMode] = useState<'list' | 'graph'>('graph')
  return (
    <div className="flex items-center gap-4 bg-surface p-4">
      <NotesModeSwitch mode={mode} onChange={setMode} compact={false} />
      <NotesModeSwitch mode={mode} onChange={setMode} compact />
    </div>
  )
}

/** The header's List | Graph switch, and the phone's one button. */
export const ModeSwitch: StoryObj = { render: () => <Switches /> }
