// Writing the names of the priority levels (OpenSpec change priority-names, D1,
// D2): one synced user_prefs field per level, so a rename works offline, reaches
// the person's other devices and converges per level. Kept apart from
// lib/priority.ts, which every list reads, so only Settings loads it.
import { mutate } from './ops'
import { PRIORITY_NAME_MAX } from './priority'
import { USER_PREFS_ID } from './userPrefs'

/** What is stored for a typed name: one line, trimmed, at most 24 characters; '' is the default. */
export function priorityNameValue(text: string): string {
  return [...text.replace(/\s+/g, ' ').trim()].slice(0, PRIORITY_NAME_MAX).join('')
}

/** Names one level; an empty name brings back the default. */
export function setPriorityName(n: 1 | 2 | 3 | 4, text: string): Promise<void> {
  return mutate('user_prefs', USER_PREFS_ID, { [`priority_name_${n}`]: priorityNameValue(text) })
}

/** Reset: the four levels back to their default names, in one change. */
export function resetPriorityNames(): Promise<void> {
  return mutate('user_prefs', USER_PREFS_ID, { priority_name_1: '', priority_name_2: '', priority_name_3: '', priority_name_4: '' })
}
