import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { clearInbox, deleteInboxEntry, entryFromForm, entrySize, getInboxEntry, INBOX_MAX_AGE_MS, putInboxEntry, SHARE_MAX_BYTES, shareRequestAllowed, shareRequestVerdict, sweepInbox } from './shareInbox'

describe('share inbox', () => {
  it('stores a share sheet POST, reads it back and deletes it', async () => {
    const form = new FormData()
    form.append('title', 'Receipt')
    form.append('files', new File(['png'], 'photo.png', { type: 'image/png' }))
    const entry = entryFromForm(form, 'e1', 1000)
    expect(entry).toMatchObject({ id: 'e1', title: 'Receipt', text: '', url: '' })
    await putInboxEntry(indexedDB, entry)
    const back = await getInboxEntry(indexedDB, 'e1')
    expect(back?.files.map((f) => [f.name, f.type])).toEqual([['photo.png', 'image/png']])
    await deleteInboxEntry(indexedDB, 'e1')
    expect(await getInboxEntry(indexedDB, 'e1')).toBeUndefined()
  })

  it('sweeps entries older than ten minutes and clears at sign-out', async () => {
    await putInboxEntry(indexedDB, { id: 'old', createdAt: 0, title: '', text: '', url: '', files: [] })
    await putInboxEntry(indexedDB, { id: 'new', createdAt: INBOX_MAX_AGE_MS, title: '', text: '', url: '', files: [] })
    await sweepInbox(indexedDB, INBOX_MAX_AGE_MS + 1)
    expect(await getInboxEntry(indexedDB, 'old')).toBeUndefined()
    expect(await getInboxEntry(indexedDB, 'new')).toBeDefined()
    await clearInbox(indexedDB)
    expect(await getInboxEntry(indexedDB, 'new')).toBeUndefined()
  })

  it('takes shares only from the share sheet or the app itself, and only up to the cap (encryption-state-integrity)', () => {
    const h = (o: Record<string, string>) => new Headers(o)
    expect(shareRequestAllowed(h({ 'Sec-Fetch-Site': 'none' }))).toBe(true)
    expect(shareRequestAllowed(h({ 'Sec-Fetch-Site': 'same-origin' }))).toBe(true)
    // A request without Sec-Fetch-Site is not stored (share-target-fetch-metadata).
    expect(shareRequestAllowed(h({}))).toBe(false)
    expect(shareRequestAllowed(h({ 'Sec-Fetch-Site': 'cross-site' }))).toBe(false)
    expect(shareRequestAllowed(h({ 'Sec-Fetch-Site': 'same-site' }))).toBe(false)
    expect(shareRequestAllowed(h({ 'Sec-Fetch-Site': 'none', 'Content-Length': String(SHARE_MAX_BYTES + 1) }))).toBe(false)
    expect(shareRequestAllowed(h({ 'Sec-Fetch-Site': 'none', 'Content-Length': String(SHARE_MAX_BYTES) }))).toBe(true)
  })

  it('stores only a share that says where it came from, and explains one that does not (share-target-fetch-metadata)', () => {
    const h = (o: Record<string, string>) => new Headers(o)
    expect(shareRequestVerdict(h({ 'Sec-Fetch-Site': 'none' }))).toBe('store')
    expect(shareRequestVerdict(h({ 'Sec-Fetch-Site': 'same-origin' }))).toBe('store')
    expect(shareRequestVerdict(h({}))).toBe('unverified')
    expect(shareRequestVerdict(h({ 'Content-Type': 'multipart/form-data; boundary=x', 'Content-Length': '10' }))).toBe('unverified')
    expect(shareRequestVerdict(h({ 'Sec-Fetch-Site': 'cross-site' }))).toBe('refused')
    expect(shareRequestVerdict(h({ 'Sec-Fetch-Site': 'same-site' }))).toBe('refused')
    // An unknown value is not one of the two the share sheet and the app send.
    expect(shareRequestVerdict(h({ 'Sec-Fetch-Site': 'something-else' }))).toBe('refused')
    expect(shareRequestVerdict(h({ 'Content-Length': String(SHARE_MAX_BYTES + 1) }))).toBe('refused')
  })

  it('measures an entry by its files and text', () => {
    const form = new FormData()
    form.append('title', 'abc')
    form.append('files', new File(['12345'], 'a.txt'))
    form.append('files', new File(['67'], 'b.txt'))
    expect(entrySize(entryFromForm(form, 'e2'))).toBe(10)
  })
})
