// The kinds an account authors: only the account named in a comment's or an
// attachment's author_id, or a time entry's user_id, writes the row (comments,
// attachments D1, time-tracking D11; on the server, internal/sync existingAuthored).
import type { Entity } from './types'

const AUTHOR_FIELD: Partial<Record<Entity, 'author_id' | 'user_id'>> = { comment: 'author_id', attachment: 'author_id', time_entry: 'user_id' }

/** Whether the account `me` may write this row: always, for a kind without an author. */
export function writesOwnRow(entity: Entity, row: Record<string, unknown>, me: unknown): boolean {
  const field = AUTHOR_FIELD[entity]
  return !field || row[field] === me
}
