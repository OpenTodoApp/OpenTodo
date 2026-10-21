import type { Meta, StoryObj } from '@storybook/react-vite'
import { EmptyState } from '../patterns/EmptyState'
import { Illustration } from './Illustration'
import { InboxZero } from './InboxZero'

// Illustrations (inbox-means-unplaced D9, design-system "Illustrations"): the workbench
// shows each one in light and dark, alone and in the empty-state pattern.
const meta: Meta = { title: 'UI/Illustrations' }
export default meta

export const InboxZeroDrawing: StoryObj = {
  name: 'Inbox zero',
  render: () => <div className="flex gap-6 p-4 text-muted"><InboxZero /><Illustration name="inbox-zero" /></div>,
}

export const InboxZeroEmptyState: StoryObj = {
  name: 'Inbox zero empty state',
  render: () => <EmptyState illustration="inbox-zero" title="Inbox zero: every task has a place." action={{ label: 'Back to the Inbox', onClick: () => {} }} />,
}
