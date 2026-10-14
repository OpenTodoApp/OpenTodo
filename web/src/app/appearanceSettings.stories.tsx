import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import type { Appearance } from '../lib/appearance'
import { AppearanceView } from './AppearanceSection'

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
