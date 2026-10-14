import type { Meta, StoryObj } from '@storybook/react-vite'
import { Section } from './tokens'

// Filled in by `ui-primitives` with the vendored icon set.
function Icons() {
  return (
    <Section title="Icons">
      <p className="text-meta text-muted">The icon set arrives with the ui-primitives change.</p>
    </Section>
  )
}

const meta: Meta<typeof Icons> = { title: 'Foundations/Icons', component: Icons }
export default meta
export const Default: StoryObj<typeof Icons> = {}
