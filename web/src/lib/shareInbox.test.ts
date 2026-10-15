import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { clearInbox, deleteInboxEntry, entryFromForm, getInboxEntry, INBOX_MAX_AGE_MS, putInboxEntry, sweepInbox } from './shareInbox'

describe('share inbox', () => {
  it('stores a share sheet POST, reads it back and deletes it', async () => {
    const form = new FormData()
    form.append('title', 'Receipt')
    form.append('files', new File(['png'], 'photo.png', { type: 'image/png' }))
    const entry = entryFromForm(form, 'e1', 1000)
    expect(entry).toMatchObject({ id: 'e1', title: 'Receipt', text: '', url: '' })
    await putInboxEntry(entry)
    const back = await getInboxEntry('e1')
    expect(back?.files.map((f) => [f.name, f.type])).toEqual([['photo.png', 'image/png']])
    await deleteInboxEntry('e1')
    expect(await getInboxEntry('e1')).toBeUndefined()
  })

  it('sweeps entries older than ten minutes and clears at sign-out', async () => {
    await putInboxEntry({ id: 'old', createdAt: 0, title: '', text: '', url: '', files: [] })
    await putInboxEntry({ id: 'new', createdAt: INBOX_MAX_AGE_MS, title: '', text: '', url: '', files: [] })
    await sweepInbox(INBOX_MAX_AGE_MS + 1)
    expect(await getInboxEntry('old')).toBeUndefined()
    expect(await getInboxEntry('new')).toBeDefined()
    await clearInbox()
    expect(await getInboxEntry('new')).toBeUndefined()
  })
})
