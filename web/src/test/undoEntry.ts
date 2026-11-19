// The undo entry of a change, once it is stored. recordUndoBatch (lib/undo.ts) applies
// the change first and writes its entry after, so a test that waits for the change and
// then reads db.assistantUndo can read it before the entry is there. Wait for the entry
// itself instead.
import { db, type AssistantUndo } from '../lib/db'
import { waitFor } from '../ui/test-utils'

/** The newest stored undo entry that matches (any entry when no match is given). */
export async function undoEntry(match: (e: AssistantUndo) => boolean = () => true): Promise<AssistantUndo> {
  let found: AssistantUndo | undefined
  await waitFor(async () => {
    found = (await db.assistantUndo.orderBy('created_at').toArray()).filter(match).at(-1)
    return !!found
  }, 'the undo entry')
  return found!
}

/** Waits until exactly `count` undo entries are stored. */
export async function undoCount(count: number): Promise<void> {
  await waitFor(async () => (await db.assistantUndo.count()) === count, `${count} undo entries`)
}
