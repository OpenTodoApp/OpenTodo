import type { Meta, StoryObj } from '@storybook/react-vite'
import { TokenRow } from './TokenRow'

// A token row of the theme editor's Advanced list (OpenSpec change theme-editor,
// design D6): derived and set, with its worst pair passing or failing.
const meta: Meta = { title: 'UI/Token row' }
export default meta

const noop = () => {}

export const States: StoryObj = {
  render: () => (
    <div className="flex w-[32rem] max-w-full flex-col divide-y divide-(--ot-border-soft) rounded-card border border-default bg-surface px-3">
      <TokenRow name="Muted text" id="muted" value={undefined} resolved="oklch(0.5 0.01 260)" worst={{ ratio: 5.6, min: 4.5, on: 'Canvas' }} onChange={noop} onReset={noop} /> {/* token-lint-allow: a theme colour is data, not styling */}
      <TokenRow name="Faint text" id="faint" value="oklch(0.72 0.01 260)" resolved="oklch(0.72 0.01 260)" worst={{ ratio: 3.9, min: 4.5, on: 'Canvas' }} onChange={noop} onUndo={noop} onReset={noop} /> {/* token-lint-allow: a theme colour is data, not styling */}
      <TokenRow name="Focus ring" id="focus" value="#3263c3" resolved="#3263c3" worst={{ ratio: 4.8, min: 3, on: 'Surface' }} onChange={noop} onReset={noop} /> {/* token-lint-allow: a theme colour is data, not styling */}
    </div>
  ),
}
