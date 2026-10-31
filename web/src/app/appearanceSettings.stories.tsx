import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { FIXED_DESTINATIONS, PROMOTABLE, type Appearance, type DestinationId, type Promotable, type SidebarCounts } from '../lib/appearance'
import { AppearanceView, SidebarView } from './AppearanceSection'

function Panel({ initial }: { initial: Appearance }) {
  const [v, setV] = useState(initial)
  return <AppearanceView value={v} onMode={(mode) => setV({ ...v, mode })} onAccent={(accent) => setV({ ...v, accent })} />
}

// OpenSpec theming D9: checked by the a11y gate in light and dark; no screenshot
// baselines (tag no-visual), so CI keeps one baseline set.
const meta: Meta = { title: 'Settings/App/Appearance', tags: ['no-visual'] }
export default meta
export const Default: StoryObj = { render: () => <Panel initial={{ mode: 'system', accent: 'emerald' }} /> }
export const VioletDark: StoryObj = { render: () => <Panel initial={{ mode: 'dark', accent: 'violet' }} /> }

/** The sidebar card (sidebar-polish D1, D3): the counts choice, then the ordered destinations with handles, menus and switches. */
function Sidebar({ arranged = false }: { arranged?: boolean }) {
  const [promoted, setPromoted] = useState<Promotable[]>(['someday'])
  const [counts, setCounts] = useState<SidebarCounts>('all')
  const [order, setOrder] = useState<DestinationId[]>(['today', 'inbox', 'someday', ...FIXED_DESTINATIONS.slice(2), ...PROMOTABLE.filter((p) => p !== 'someday')])
  return <SidebarView promoted={promoted} arranged={arranged} counts={counts} onCounts={setCounts} order={order}
    onPromote={(id, on) => setPromoted((p) => (on ? [...p, id] : p.filter((x) => x !== id)))}
    onMove={async (id, delta) => setOrder((o) => { const n = [...o]; const i = n.indexOf(id); n.splice(i + delta, 0, ...n.splice(i, 1)); return n })} />
}
export const SidebarCard: StoryObj = { render: () => <Sidebar /> }
export const SidebarCardArranged: StoryObj = { render: () => <Sidebar arranged /> }
