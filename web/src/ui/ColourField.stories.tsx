import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { ColourField, ColourPicker } from './ColourField'

// The theme editor's colour field (OpenSpec change theme-editor, design D5): a
// swatch that opens swatches, a hex field and three OKLCH sliders, announced in
// words, with the note when a colour was clamped to the screen's range.
const meta: Meta = { title: 'UI/Colour field' }
export default meta

function Seeds() {
  const [accent, setAccent] = useState<string | undefined>('oklch(0.55 0.14 250)')
  const [danger, setDanger] = useState<string | undefined>(undefined)
  return (
    <div className="flex w-96 max-w-full flex-col rounded-card border border-default bg-surface p-3">
      <ColourField label="Accent" value={accent} onChange={(v) => setAccent(v)} />
      <ColourField label="Danger" value={danger} derived="#c62828" onChange={(v) => setDanger(v)} onReset={() => setDanger(undefined)} /> {/* token-lint-allow: a theme colour is data, not styling */}
    </div>
  )
}

/** Two seed rows: a set accent, and an optional status colour still derived. */
export const Rows: StoryObj = { render: () => <Seeds /> }

function Picker({ value }: { value?: string }) {
  const [v, setV] = useState(value)
  return (
    <div className="w-80 max-w-full rounded-card border border-default bg-surface p-3">
      <ColourPicker label="Accent" value={v} derived="#3263c3" onChange={(x) => setV(x)} onReset={() => setV(undefined)} /> {/* token-lint-allow: a theme colour is data, not styling */}
    </div>
  )
}

/** The picker open on a set colour: swatches, hex, the three sliders and Reset. */
export const PickerSet: StoryObj = { render: () => <Picker value="oklch(0.62 0.15 160)" /> }
/** The picker on a derived colour: no Reset. */
export const PickerDerived: StoryObj = { render: () => <Picker /> }
