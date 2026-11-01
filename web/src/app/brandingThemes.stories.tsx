import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { CATALOGUE } from '../lib/theme/builtin/index'
import type { InstanceThemes } from '../lib/theme/choice'
import type { ThemeDocument } from '../lib/theme/format'
import { SettingsSection } from '../ui'
import { cardCopy } from '../lib/settingsCopy'
import { withClock } from './stories/fixtures'
import { BrandingThemesView } from './BrandingThemes'

// The themes of Settings → Server → Branding (OpenSpec change theme-instance-default,
// design D4): the default pickers with their colours, the server themes with one
// carrying contrast warnings, and the same card offline, read-only.
const meta: Meta = { title: 'Settings/Server/Branding themes', decorators: [withClock] }
export default meta

const mod = { CATALOGUE, creditsUrl: '/assets/CREDITS.md' } as never
const doc = (name: string, kind: 'light' | 'dark', seeds: ThemeDocument['seeds']): ThemeDocument => ({ opentodoTheme: 1, id: 'x', name, author: 'Acme design team', licence: 'CC0-1.0', kind, seeds })
const VALUE: InstanceThemes = {
  version: 4, default: { light: 'builtin:solarized-light', dark: 'instance:acme-night' },
  themes: [
    { id: 'acme-night', kind: 'dark', doc: doc('Acme Night', 'dark', { canvas: '#14161f', surface: '#1d2030', text: '#e6e8f2', accent: '#7aa2ff' }) },
    { id: 'acme-paper', kind: 'light', doc: doc('Acme Paper', 'light', { canvas: '#f3efe6', surface: '#fbf8f2', text: '#2d2a26', accent: '#b4522d' }) },
  ],
}
const WARNINGS = { 'acme-paper': [{ theme: 'acme-paper', fg: 'text-muted', bg: 'canvas', kind: 'text' as const, ratio: 3.9, min: 4.5 }] }

function Card({ online }: { online: boolean }) {
  const [value, setValue] = useState(VALUE)
  return (
    <div className="max-w-3xl bg-canvas p-4">
      <SettingsSection {...cardCopy('branding')}>
        <BrandingThemesView value={value} online={online} busy={false} error={null} catalogue={mod} warnings={WARNINGS} own={[]}
          onDefault={(side, choice) => setValue((v) => ({ ...v, default: { ...v.default, [side]: choice } }))}
          onAdd={() => {}} onRemove={(x) => setValue((v) => ({ ...v, themes: v.themes.filter((t) => t.id !== x.id) }))} />
      </SettingsSection>
    </div>
  )
}

/** A default for each side, two server themes, one with a contrast warning. */
export const DefaultAndServerThemes: StoryObj = { render: () => <Card online /> }

/** Offline: the last values read, read-only. */
export const Offline: StoryObj = { render: () => <Card online={false} /> }
