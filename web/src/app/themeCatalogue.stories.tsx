import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { CATALOGUE } from '../lib/theme/builtin/index'
import { withClock } from './stories/fixtures'
import { Sample } from './stories/themeSample'
import { themeCards, ThemeRow } from './ThemeRow'
import ThemeAbout from './ThemeAbout'

// The built-in catalogue (OpenSpec change theme-catalogue, design D7). The picker's
// states have visual baselines: the Light and Dark lists with a palette chosen, its
// About this theme button and the counterpart offer, and the About dialog; so do the
// sample screens of OpenTodo's two themes. The palettes' sample screens are in
// themeCatalogueSamples.stories.tsx, checked by the a11y gate only (as theming decided).
const meta: Meta = { title: 'Settings/App/Theme catalogue', decorators: [withClock] }
export default meta

const mod = { CATALOGUE, creditsUrl: '/assets/CREDITS.md' } as never
const entry = (id: string) => CATALOGUE.find((c) => c.id === id)!

/** Mode System with Tokyo Night chosen for the dark side: its About button and the offer of Tokyo Night Light by day. */
function Picker() {
    const [light, setLight] = useState('opentodo-light')
    const [dark, setDark] = useState('tokyo-night')
    return (
      <div className="max-w-3xl bg-surface p-4">
        <ThemeRow
          lists={[
            { side: 'light', value: light, status: light.startsWith('opentodo') ? 'default' : 'theme', cards: themeCards('light', mod), ...(light.startsWith('opentodo') ? {} : { about: entry(light) }) },
            { side: 'dark', value: dark, status: 'theme', cards: themeCards('dark', mod), about: entry(dark) },
          ]}
          onChoose={(side, id) => (side === 'light' ? setLight(id) : setDark(id))}
          offer={{ side: 'light', name: 'Tokyo Night Light', onAccept: () => setLight('tokyo-night-light'), onDismiss: () => {} }}
        />
      </div>
    )
}
export const PickerWithOffer: StoryObj = { render: () => <Picker /> }

/** About this theme for Nord: author, licence, copyright, the project as text, the adapted note, the not-affiliated line and the Licence link. */
export const AboutDialog: StoryObj = {
  render: () => <ThemeAbout theme={entry('nord')} creditsUrl="/assets/CREDITS.md" onClose={() => {}} />,
}

export const OpenTodoLight: StoryObj = { render: () => <Sample theme={{ id: 'opentodo-light', name: 'OpenTodo Light' }} /> }
export const OpenTodoDark: StoryObj = { render: () => <Sample theme={{ id: 'opentodo-dark', name: 'OpenTodo Dark' }} /> }
