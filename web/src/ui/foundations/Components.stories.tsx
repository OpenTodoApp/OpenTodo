import type { Meta, StoryObj } from '@storybook/react-vite'
import { Section } from './tokens'

// The legacy component classes after the token remap (design-language decision 8).
function LegacyClasses() {
  return (
    <div className="space-y-8">
      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-primary">Save</button>
          <button type="button" className="btn-secondary">Cancel</button>
          <button type="button" className="btn-ghost">More</button>
          <button type="button" className="btn-danger">Delete</button>
          <button type="button" className="btn-primary" disabled>Disabled</button>
          <button type="button" className="btn-secondary px-2 py-0.5 text-xs">Compact</button>
        </div>
      </Section>
      <Section title="Inputs">
        <div className="grid max-w-md gap-3">
          <input className="input" aria-label="Task title" placeholder="Task title" />
          <select className="input" aria-label="Project" defaultValue="home">
            <option value="home">Home renovation with a rather long name that does not fit</option>
          </select>
          <p className="text-meta text-muted">Press <kbd className="kbd">Ctrl</kbd> + <kbd className="kbd">Enter</kbd> to save.</p>
        </div>
      </Section>
    </div>
  )
}

const meta: Meta<typeof LegacyClasses> = { title: 'Foundations/Legacy classes', component: LegacyClasses }
export default meta
export const Default: StoryObj<typeof LegacyClasses> = {}
