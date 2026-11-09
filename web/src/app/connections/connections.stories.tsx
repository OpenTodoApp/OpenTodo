import type { Meta, StoryObj } from '@storybook/react-vite'
import { useRef, useState } from 'react'
import { layout, neighbourhood, NARROW, type GraphItem, type GraphKind } from '../../lib/graphLayout'
import { t } from '../../lib/i18n'
import type { Reference } from '../../lib/noteLinks'
import { useMediaQuery } from '../../ui'
import { ConnectionsFrame, ConnectionsList, useAreaBox, type View } from './ConnectionsDialog'
import { ConnectionsGraph } from './ConnectionsGraph'

// The Connections dialog (OpenSpec change notes-graph): the graph around one item in
// its states (nothing linked yet, one link, a hub over the caps, a cycle) and the List.
const meta: Meta = { title: 'Screens/Connections' }
export default meta

const item = (key: string, title: string, updated = 0, done = false): GraphItem => {
  const [kind, id] = key.split(':') as [GraphKind, string]
  return { key, kind, id, title, updated, done }
}

const ref = (kind: GraphKind, id: string, title: string, before: string, link: string, after: string): Reference => ({ kind, id, title, projectId: null, updated: 0, snippet: { before, link, after } })
const refsOf = (items: GraphItem[]): Reference[] => items.map((i) => ref(i.kind, i.id, i.title, '', i.title, ''))

function Scene({ items, pairs, centre }: { items: GraphItem[]; pairs: [string, string][]; centre: string }) {
  const byKey = new Map(items.map((i) => [i.key, i]))
  const neighbours = (k: string) => pairs.filter((p) => p.includes(k)).map(([a, b]) => byKey.get(a === k ? b : a)!)
  const n = neighbourhood(byKey.get(centre)!, neighbours)
  const area = useRef<HTMLDivElement>(null)
  const phone = useMediaQuery(`(max-width: ${NARROW - 0.02}px)`)
  const box = useAreaBox(area, phone)
  const picture = layout(n, box, phone)
  // As the dialog: the List first when the picture does not fit.
  const [chosen, setView] = useState<View | null>(null)
  const view = chosen ?? (picture.fits ? 'graph' : 'list')
  const title = n.centre.title
  const label = t('Connections of {title}', { title })
  return (
    <ConnectionsFrame kind={n.centre.kind} title={title} label={label} view={view} onView={setView} onClose={() => {}}>
      {view === 'graph'
        ? (
          <div ref={area} className="connections-area">
            <ConnectionsGraph layout={picture} label={label} moved={false} focusKey={null} onFocused={() => {}} onCentre={() => {}} onOpen={() => {}} />
          </div>
        )
        : <ConnectionsList focus={false} onFocused={() => {}} onCentre={() => {}} onClose={() => {}} links={refsOf(n.ring1.slice(0, Math.ceil(n.ring1.length / 2)))} from={refsOf(n.ring1.slice(Math.ceil(n.ring1.length / 2)))} />}
    </ConnectionsFrame>
  )
}

const TRIP = [
  item('note:trip', 'Trip to Lisbon'), item('task:ferry', 'Book the ferry to Cacilhas'), item('note:packing', 'Packing list'),
  item('note:times', 'Ferry times'), item('project:holidays', 'Holidays'), item('task:tickets', 'Buy museum tickets', 0, true),
  item('note:food', 'Places to eat'), item('task:pastel', 'Try a pastel de nata in Belém'),
]
const TRIP_LINKS: [string, string][] = [
  ['note:trip', 'task:ferry'], ['note:packing', 'note:trip'], ['task:ferry', 'note:times'], ['project:holidays', 'note:trip'],
  ['note:trip', 'task:tickets'], ['note:food', 'note:trip'], ['note:food', 'task:pastel'], ['project:holidays', 'note:packing'],
]

/** A note whose only link was just removed: the centre alone. */
export const Empty: StoryObj = {
  render: () => <Scene items={[item('note:trip', 'Trip to Lisbon')]} pairs={[]} centre="note:trip" />,
}

/** One link: the centre and one item. */
export const OneLink: StoryObj = {
  render: () => <Scene items={TRIP.slice(0, 2)} pairs={[['note:trip', 'task:ferry']]} centre="note:trip" />,
}

/** Two steps: notes, tasks and a project on the inner ring, their links on the outer; a done task struck through. */
export const TwoSteps: StoryObj = {
  render: () => <Scene items={TRIP} pairs={TRIP_LINKS} centre="note:trip" />,
}

/** A cycle: each pair is drawn once, and a direct link never repeats on the outer ring. */
export const Cycle: StoryObj = {
  render: () => (
    <Scene items={[item('note:a', 'Reading list'), item('note:b', 'Book notes: Deep Work'), item('note:c', 'Focus rituals'), item('task:d', 'Block mornings for writing')]}
      pairs={[['note:a', 'note:b'], ['note:b', 'note:c'], ['note:c', 'note:a'], ['note:c', 'task:d'], ['task:d', 'note:b']]} centre="note:a" />
  ),
}

const HUB = [item('note:index', 'Index'), ...Array.from({ length: 40 }, (_, i) => item(`note:n${i}`, `Meeting ${i + 1}`, i)), ...Array.from({ length: 10 }, (_, i) => item(`task:t${i}`, `Follow-up ${i + 1}`, i))]
const HUB_LINKS: [string, string][] = [...Array.from({ length: 40 }, (_, i): [string, string] => [`note:n${i}`, 'note:index']), ...Array.from({ length: 10 }, (_, i): [string, string] => [`note:n${39 - i}`, `task:t${i}`])]

/** A hub note: 40 notes link to it; 24 are drawn with a marker for the rest (the List lists them all). */
export const Many: StoryObj = {
  render: () => <Scene items={HUB} pairs={HUB_LINKS} centre="note:index" />,
}



/** The List view: Links and Linked from, each row opening the item, with Centre on at its end. */
function ListScene() {
  const [view, setView] = useState<View>('list')
  return (
    <ConnectionsFrame kind="note" title="Trip to Lisbon" label={t('Connections of {title}', { title: 'Trip to Lisbon' })} view={view} onView={setView} onClose={() => {}}>
      <ConnectionsList focus={false} onFocused={() => {}} onCentre={() => {}} onClose={() => {}}
        links={[ref('task', 'ferry', 'Book the ferry to Cacilhas', 'Next: ', 'Book the ferry to Cacilhas', ' before Friday.'), ref('task', 'tickets', 'Buy museum tickets', '', 'Buy museum tickets', ' for the Gulbenkian')]}
        from={[ref('note', 'packing', 'Packing list', 'For the ', 'Trip to Lisbon', ': light jacket, sandals.'), ref('project', 'holidays', 'Holidays', 'This year: ', 'Trip to Lisbon', ' in May.')]} />
    </ConnectionsFrame>
  )
}

export const List: StoryObj = { render: () => <ListScene /> }
