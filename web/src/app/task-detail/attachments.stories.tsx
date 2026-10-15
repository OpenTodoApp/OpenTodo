import type { Meta, StoryObj } from '@storybook/react-vite'
import type { AttachmentBlob } from '../../lib/db'
import type { Attachment } from '../../lib/types'
import { AttachmentItem } from './AttachmentsRow'

// The Attachments row of the task panel (OpenSpec change attachments, D7), one
// item per state. Fixture rows only: no server, so images use local bytes.
const meta: Meta = { title: 'Task/Attachments' }
export default meta

const a = (id: string, name: string, extra: Partial<Attachment> = {}): Attachment => ({
  id, task_id: 't1', comment_id: null, name, mime: 'application/pdf', size: 2_400_000, sha256: 'ab', url: null, encrypted: false,
  author_id: 'u-me', created_at: 1, uploaded_at: 2, deleted_at: null, _clock: {}, ...extra,
})
// A 2×2 grey PNG, so the thumbnail renders offline.
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGOYs3g9EDFAKAA1yge5YXhuBgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))
const blob = (id: string, extra: Partial<AttachmentBlob> = {}): AttachmentBlob => ({ id, blob: new Blob([PNG], { type: 'image/png' }), name: id, size: PNG.length, ...extra })
const noop = () => {}
const done = async () => {}

const ITEMS: { row: Attachment; blob?: AttachmentBlob; mine?: boolean; missing?: boolean; note?: string }[] = [
  { row: a('img', 'Whiteboard.png', { mime: 'image/png', size: PNG.length, uploaded_at: null }), blob: blob('img') },
  { row: a('pdf', 'Q3 report.pdf') },
  { row: a('wait', 'Recording.m4a', { mime: 'audio/mp4', size: 48_000_000, uploaded_at: null }), blob: blob('wait', { reason: 'Files may be at most 25 MB on this server.' }) },
  { row: a('other', 'Floor plan.dwg', { mime: 'application/octet-stream', uploaded_at: null, author_id: 'u-bob' }), mine: false },
  { row: a('link', 'Design spec', { url: 'https://example.com/spec', mime: 'text/uri-list', size: 0, uploaded_at: null }) },
  { row: a('gone', 'Old invoice.pdf'), missing: true, note: 'Connect to the internet to open this file.' },
]

function List({ selected = 1 }: { selected?: number }) {
  return (
    <section className="max-w-md">
      <ul aria-label="Attachments" className="space-y-0.5">
        {ITEMS.map((it, i) => (
          <AttachmentItem key={it.row.id} a={it.row} blob={it.blob} selected={i === selected} missing={!!it.missing} note={it.note}
            renaming={false} canRename={it.mine !== false} canRemove={it.mine !== false}
            onSelect={noop} onOpen={noop} onRename={noop} onRenamed={done} onRemove={noop} onMissing={noop} />
        ))}
      </ul>
    </section>
  )
}

export const States: StoryObj = { render: () => <List /> }

export const Renaming: StoryObj = {
  render: () => (
    <ul aria-label="Attachments" className="max-w-md">
      <AttachmentItem a={a('pdf', 'Q3 report.pdf')} blob={undefined} selected missing={false} renaming canRename canRemove
        onSelect={noop} onOpen={noop} onRename={noop} onRenamed={done} onRemove={noop} onMissing={noop} />
    </ul>
  ),
}
