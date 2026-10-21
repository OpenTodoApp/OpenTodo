import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useState } from 'react'
import { CatalogueIcon } from './CatalogueIcon'
import { loadCatalogue } from './icons/catalogue'

// A stored icon name (OpenSpec change icons-and-section-style, design D3): an interface
// icon draws at once, a catalogue icon once its chunk loads, and an unknown name keeps
// the fallback (here the project's colour dot).
const dot = <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: 'var(--color-success)' }} />

function Marks() {
  const [ready, setReady] = useState(false)
  useEffect(() => { void loadCatalogue().then(() => setReady(true)) }, [])
  if (!ready) return <span data-story-pending />
  return (
    <ul className="space-y-2 text-body text-default">
      {[['briefcase', 'Interface icon'], ['paw-print', 'Catalogue icon'], ['from-a-newer-release', 'Unknown name: the fallback']].map(([name, note]) => (
        <li key={name} className="flex items-center gap-2" style={{ color: 'var(--color-success)' }}>
          <CatalogueIcon name={name} fallback={dot} />
          <span className="text-default">{note}</span>
        </li>
      ))}
    </ul>
  )
}

const meta: Meta = { title: 'UI/Catalogue icon' }
export default meta

export const Marks_: StoryObj = { name: 'Marks', render: () => <Marks /> }
