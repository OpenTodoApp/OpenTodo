import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { clearInbox, deleteInboxEntry, entryFromForm, entrySize, getInboxEntry, INBOX_MAX_AGE_MS, putInboxEntry, SHARE_MAX_BYTES, shareRequestAllowed, sweepInbox } from './shareInbox'

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

  it('takes shares only from the share sheet or the app itself, and only up to the cap (encryption-state-integrity)', () => {
    const h = (o: Record<string, string>) => new Headers(o)
    expect(shareRequestAllowed(h({ 'Sec-Fetch-Site': 'none' }))).toBe(true)
    expect(shareRequestAllowed(h({ 'Sec-Fetch-Site': 'same-origin' }))).toBe(true)
    // Older browsers send no Sec-Fetch-Site.
    expect(shareRequestAllowed(h({}))).toBe(true)
    expect(shareRequestAllowed(h({ 'Sec-Fetch-Site': 'cross-site' }))).toBe(false)
    expect(shareRequestAllowed(h({ 'Sec-Fetch-Site': 'same-site' }))).toBe(false)
    expect(shareRequestAllowed(h({ 'Sec-Fetch-Site': 'none', 'Content-Length': String(SHARE_MAX_BYTES + 1) }))).toBe(false)
    expect(shareRequestAllowed(h({ 'Sec-Fetch-Site': 'none', 'Content-Length': String(SHARE_MAX_BYTES) }))).toBe(true)
  })

  it('measures an entry by its files and text', () => {
    const form = new FormData()
    form.append('title', 'abc')
    form.append('files', new File(['12345'], 'a.txt'))
    form.append('files', new File(['67'], 'b.txt'))
    expect(entrySize(entryFromForm(form, 'e2'))).toBe(10)
  })
})
