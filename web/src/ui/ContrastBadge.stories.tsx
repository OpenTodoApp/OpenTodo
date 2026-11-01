import type { Meta, StoryObj } from '@storybook/react-vite'
import { ContrastBadge } from './ContrastBadge'

// A pair's measured contrast (OpenSpec change theme-editor, design D6, D8): passing
// and below its minimum, marked by an icon and announced with the minimum.
const meta: Meta = { title: 'UI/Contrast badge' }
export default meta

export const PassAndFail: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-2 bg-surface p-3">
      <ContrastBadge ratio={7.12} min={4.5} on="on Canvas" />
      <ContrastBadge ratio={4.49} min={4.5} on="on Surface" />
      <ContrastBadge ratio={3.2} min={3} />
    </div>
  ),
}
