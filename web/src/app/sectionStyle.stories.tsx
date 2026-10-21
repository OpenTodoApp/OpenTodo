import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useState, type ReactNode } from 'react'
import type { Section } from '../lib/types'
import { loadCatalogue } from '../ui'
import { SectionHeader } from './Sections'

// Section colour and icon before the title (OpenSpec change icons-and-section-style,
// sections-and-boards "Section colour and icon"), in a list heading and a board column.
const base: Section = { id: 's', name: 'Doing', project_id: 'p', position: 0, created_at: 0, deleted_at: null, _clock: {} }
const s = (patch: Partial<Section>): Section => ({ ...base, ...patch })

function Loaded({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  useEffect(() => { void loadCatalogue().then(() => setReady(true)) }, [])
  return ready ? <>{children}</> : <span data-story-pending />
}

const meta: Meta = { title: 'Screens/Section style' }
export default meta

/** Default, colour only, icon only (an interface icon and a catalogue icon), both. */
export const ListHeadings: StoryObj = {
  render: () => (
    <Loaded>
      <div className="w-full max-w-xl space-y-1">
        <SectionHeader section={s({ name: 'Backlog' })} count={4} layout="list" editable first last={false} />
        <SectionHeader section={s({ name: 'This week', color: '#22c55e' })} count={3} layout="list" editable first={false} last={false} />
        <SectionHeader section={s({ name: 'Waiting', icon: 'hourglass' })} count={2} layout="list" editable first={false} last={false} />
        <SectionHeader section={s({ name: 'Pets', icon: 'paw-print', color: '#f97316' })} count={1} layout="list" editable first={false} last={false} />
        <SectionHeader section={s({ name: 'From a newer client', icon: 'not-in-this-catalogue', color: '#3b82f6' })} count={0} layout="list" editable first={false} last />
        <SectionHeader section={null} count={5} layout="list" editable first last />
      </div>
    </Loaded>
  ),
}

/** Board column headers, the same marks; a long title truncates after the mark on a phone. */
export const BoardColumns: StoryObj = {
  render: () => (
    <Loaded>
      <div className="flex flex-wrap gap-3">
        {[
          s({ name: 'Ideas', icon: 'lightbulb', color: '#eab308' }),
          s({ name: 'Review', color: '#8b5cf6' }),
          s({ name: 'A very long section title that does not fit on one line of a phone', icon: 'rocket', color: '#ef4444' }),
        ].map((sec, i) => (
          <div key={i} className="w-72 max-w-full rounded-card bg-sunken p-1 dark:bg-raised">
            <SectionHeader section={sec} count={i + 1} layout="board" editable first={i === 0} last={i === 2} />
          </div>
        ))}
      </div>
    </Loaded>
  ),
}
