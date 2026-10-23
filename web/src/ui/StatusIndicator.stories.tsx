import type { Meta, StoryObj } from '@storybook/react-vite'
import { StatusIndicator } from './StatusIndicator'

// Status dot (precision-settings, design-system "Status dot"): state as a dot and a
// word. The word carries the meaning; the dot is decoration.
const meta: Meta = { title: 'UI/Status indicator' }
export default meta

export const Tones: StoryObj = {
  render: () => (
    <div className="flex flex-wrap items-center gap-5">
      <StatusIndicator tone="ok">Working</StatusIndicator>
      <StatusIndicator tone="warn">Paused after 3 failures</StatusIndicator>
      <StatusIndicator tone="danger">Failing</StatusIndicator>
      <StatusIndicator tone="busy">Backup in progress</StatusIndicator>
      <StatusIndicator tone="off">Off</StatusIndicator>
    </div>
  ),
}
