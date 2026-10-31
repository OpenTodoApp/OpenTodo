import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { AccentPicker } from './AccentPicker'

// The custom accent picker (OpenSpec change accent-colour, design D5): swatches, the
// hex field, the light and dark preview and the note when the colour was adjusted.
// Shown as the popover panel it is from 640 px (a bottom sheet below).
function Picker({ value }: { value?: string }) {
  const [v, setV] = useState(value)
  return (
    <div className="w-80 max-w-full rounded-card border border-default bg-surface p-3">
      <AccentPicker value={v} onPick={setV} onDone={() => {}} />
    </div>
  )
}

const meta: Meta = { title: 'UI/Accent picker' }
export default meta

/** No custom colour yet: the preview shows the default accent. */
export const Empty: StoryObj = { render: () => <Picker /> }
/** A curated swatch, applied exactly as shown. */
export const Swatch: StoryObj = { render: () => <Picker value="#3263c3" /> } // token-lint-allow: a picked colour is data, not styling
/** A pale yellow: darker in light mode, lighter in dark, and the picker says so. */
export const AdjustedForContrast: StoryObj = { render: () => <Picker value="#ffe066" /> } // token-lint-allow: a picked colour is data, not styling
/** A red pick is turned away from the colour for errors. */
export const TurnedFromRed: StoryObj = { render: () => <Picker value="#d93025" /> } // token-lint-allow: a picked colour is data, not styling
