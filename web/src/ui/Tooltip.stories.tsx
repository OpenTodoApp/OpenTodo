import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button, IconButton } from './Button'
import { Tooltip } from './Tooltip'
import { TruncatedText } from './TruncatedText'

const meta: Meta = { title: 'UI/Tooltip' }
export default meta

/** Icon-only buttons carry a tooltip by default; hover or focus one. */
export const OnIconButtons: StoryObj = {
  render: () => (
    <div className="flex items-center gap-2 p-8">
      <IconButton icon="bell" label="Notifications" />
      <IconButton icon="search" label="Search and commands" />
      <IconButton icon="circle-help" label="Help" size="sm" />
      <IconButton icon="x" label="Close" variant="secondary" />
    </div>
  ),
}

/** A label with its shortcut, on any control. */
export const WithShortcut: StoryObj = {
  render: () => (
    <div className="flex items-center gap-2 p-8">
      <Tooltip label="Share project" shortcut="Shift+S"><Button variant="ghost" size="sm" icon="users">Share</Button></Tooltip>
      <Tooltip label="Quick add a task" shortcut="q" side="top"><Button variant="primary" size="sm" icon="plus">Add</Button></Tooltip>
    </div>
  ),
}

/** Long text wraps inside the tip's maximum width. */
export const LongLabel: StoryObj = {
  render: () => (
    <div className="p-8">
      <Tooltip label="This task is fixed to Europe/Rome; it shows at 15:00 there and at 09:00 in New York. Press z to release it to a floating time."><IconButton icon="clock" label="Time zone" /></Tooltip>
    </div>
  ),
}

/** Cut text keeps its full text (ux-fixes-phone D2): the cut name takes focus and shows it in the tip; the whole one is plain text. */
export const CutText: StoryObj = {
  render: () => (
    <div className="space-y-2 p-8 text-meta text-muted">
      <div className="w-40"><TruncatedText className="block" text="Home renovation with a rather long project name" /></div>
      <div className="w-40"><TruncatedText className="block" text="Garden" /></div>
    </div>
  ),
}
