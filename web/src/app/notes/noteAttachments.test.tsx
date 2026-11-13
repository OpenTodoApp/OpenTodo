// @vitest-environment happy-dom
// Files on a standalone note (OpenSpec change note-attachments, task 2.2 and 2.3).
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setMeta, useDatabase } from '../../lib/db'
import { noteParent } from '../../lib/attachments'
import { createNote } from '../../lib/noteOps'
import { applyOps, resetDeviceId } from '../../lib/ops'
import type { Op } from '../../lib/types'
import { render, waitFor } from '../../ui/test-utils'
import { Markdown } from '../Markdown'
import { AttachmentsRow } from '../task-detail/AttachmentsRow'

let n = 0
beforeEach(async () => {
  useDatabase(`note-files-${n++}`)
  resetDeviceId()
  await setMeta('userId', 'me')
})
const mounted: { unmount: () => Promise<void> }[] = []
afterEach(async () => { for (const r of mounted.splice(0)) await r.unmount() })

async function image(id: string, note: string) {
  let ts = 100
  const op = (field: string, value: unknown, device = 'other'): Op => ({ id: `${id}-${field}`, entity: 'attachment', entityId: id, field, value, ts: ts++, device })
  await applyOps([op('note_id', note), op('author_id', 'me'), op('name', 'board.png'), op('mime', 'image/png'), op('size', 2048), op('sha256', 'ab'), op('created_at', 5), op('uploaded_at', 9, 'server')])
}

describe('files on a standalone note', () => {
  it('shows an image of the same note; "Image from another note" is a placeholder that loads nothing', async () => {
    const whiteboard = await createNote({ title: 'Whiteboard' })
    const trip = await createNote({ title: 'Trip' })
    await image('w1', whiteboard)
    await image('t1', trip)
    const own = await render(<Markdown source="![board](attachment:w1)" taskId={noteParent(whiteboard)} />)
    mounted.push(own)
    await waitFor(() => !!own.container.querySelector('img'), 'the image')
    expect(own.container.querySelector('img')!.getAttribute('src')).toBe('/api/v1/attachments/w1/content')
    const other = await render(<Markdown source="![x](attachment:t1)" taskId={noteParent(whiteboard)} />)
    mounted.push(other)
    await waitFor(() => other.container.querySelector('[data-state]')?.getAttribute('data-state') === 'removed', 'the placeholder')
    expect(other.container.querySelector('img')).toBeNull()
  })

  it('"No attachments at rest": nothing shows until the note has a file, then the list', async () => {
    const note = await createNote({ title: 'Recipe' })
    const r = await render(<AttachmentsRow taskId={noteParent(note)} userId="me" role="owner" />)
    mounted.push(r)
    expect(r.container.querySelector('h3')).toBeNull()
    expect(r.container.querySelector('[data-drop-zone]')).toBeNull()
    expect(r.container.textContent).toBe('')
    await image('r1', note)
    await waitFor(() => r.container.textContent?.includes('board.png') === true, 'the file')
    expect(r.container.querySelector('h3')!.textContent).toContain('Attachments')
  })
})
