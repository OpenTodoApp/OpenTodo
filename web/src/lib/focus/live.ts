// Live reads of the focus session's time entry (focus-mode D4, "Entry stopped elsewhere").
import { useLiveQuery } from 'dexie-react-hooks'
import { focusLogger } from './index'

/** Whether the session's entry still runs: undefined while it loads or without an entry. */
export function useEntryRunning(entryId: string | null): boolean | undefined {
  return useLiveQuery(async () => (entryId ? focusLogger().running(entryId) : undefined), [entryId], undefined)
}
