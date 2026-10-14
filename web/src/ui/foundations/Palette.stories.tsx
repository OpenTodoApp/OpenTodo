import type { Meta, StoryObj } from '@storybook/react-vite'
import { HUES } from '../tokens/palette'
import { Section } from './tokens'

function Palette() {
  return (
    <Section title="Palette: 12 hues for projects and labels">
      <p className="text-meta text-muted">
        Stored colours render through the nearest hue (data-hue). Solid is for dots and rings, soft and text are for chips.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {HUES.map((h) => (
          <div key={h.name} data-hue={h.name} className="space-y-2 rounded-card border border-default bg-surface p-3">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-hue-solid" aria-hidden="true" />
              <span className="text-body font-medium">{h.name}</span>
              <span className="ml-auto font-mono text-hint text-muted">{h.hex}</span>
            </div>
            <span className="inline-flex rounded-chip bg-hue-soft px-2 py-0.5 text-meta text-hue">#{h.name} label</span>
          </div>
        ))}
      </div>
    </Section>
  )
}

const meta: Meta<typeof Palette> = { title: 'Foundations/Palette', component: Palette }
export default meta
export const Default: StoryObj<typeof Palette> = {}
