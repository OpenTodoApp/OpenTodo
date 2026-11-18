import { describe, expect, it } from 'vitest'
import { writesOwnRow } from './authored'

describe('writesOwnRow', () => {
  it('lets only the author write a comment, an attachment or a time entry', () => {
    expect(writesOwnRow('comment', { author_id: 'me' }, 'me')).toBe(true)
    expect(writesOwnRow('comment', { author_id: 'bob' }, 'me')).toBe(false)
    expect(writesOwnRow('attachment', { author_id: 'bob' }, 'me')).toBe(false)
    expect(writesOwnRow('time_entry', { user_id: 'me', author_id: 'bob' }, 'me')).toBe(true)
    expect(writesOwnRow('time_entry', { user_id: 'bob' }, 'me')).toBe(false)
  })
  it('lets anyone write a kind without an author', () => {
    expect(writesOwnRow('task', { author_id: 'bob' }, 'me')).toBe(true)
  })
})
