import type { Meta, StoryObj } from '@storybook/react-vite'
import type { Note } from '../../lib/types'
import NotePageDialog from './NotePageDialog'

// Publishing a note page from the note's menu (OpenSpec note-public-links,
// "Publishing from a note"): the first publish, and the status of an active page.
const note = { id: 'n1', title: 'Babysitter how-to', description: '', project_id: null, labels: [], position: 1, created_at: 1, deleted_at: null, _clock: {} } as unknown as Note

const meta: Meta<typeof NotePageDialog> = {
  title: 'Notes/Note page dialog',
  component: NotePageDialog,
  args: { note, onClose: () => {} },
}
export default meta
type Story = StoryObj<typeof NotePageDialog>

export const Publish: Story = { args: { status: null } }
export const ActivePage: Story = {
  args: {
    status: { id: 'p1', noteId: 'n1', label: 'babysitter-how-to', createdBy: 'u1', publishedAt: Date.parse('2026-10-12T09:30:00'),
      expiresAt: Date.parse('2026-11-11T09:30:00'), lastOpenedAt: Date.parse('2026-10-14T08:10:00'), encrypted: false, snapshotAt: null },
  },
}
