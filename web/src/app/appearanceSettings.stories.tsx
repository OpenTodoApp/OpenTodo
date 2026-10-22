import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import type { Appearance } from '../lib/appearance'
import { AppearanceView } from './AppearanceSection'

function Panel({ initial }: { initial: Appearance }) {
  const [v, setV] = useState(initial)
  return <AppearanceView value={v} onMode={(mode) => setV({ ...v, mode })} onAccent={(accent) => setV({ ...v, accent })}
    onContrast={(contrast) => setV({ ...v, contrast })} onMotion={(motion) => setV({ ...v, motion })} onDensity={(density) => setV({ ...v, density })} />
}

// OpenSpec theming D9: checked by the a11y gate in light and dark; no screenshot
// baselines (tag no-visual), so CI keeps one baseline set.
const meta: Meta = { title: 'Settings/App/Appearance', tags: ['no-visual'] }
export default meta
export const Default: StoryObj = { render: () => <Panel initial={{ mode: 'system', accent: 'emerald' }} /> }
export const VioletDark: StoryObj = { render: () => <Panel initial={{ mode: 'dark', accent: 'violet' }} /> }
// accessibility-aaa 3.3: the Contrast and Motion rows with the non-default choices.
export const HighContrastNoMotion: StoryObj = { render: () => <Panel initial={{ mode: 'system', accent: 'emerald', contrast: 'high', motion: 'none' }} /> }
