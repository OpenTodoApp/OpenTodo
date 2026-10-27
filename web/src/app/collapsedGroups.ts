// Which list groups are collapsed on this device (OpenSpec change ux-overhaul,
// task-list-presentation "Group headers"): date, project and Later groups, keyed
// by view and group. Device state, never synced; sections keep their own store.
import { createPersistedStore } from '../lib/deviceStorage'

const KEY = 'ot.groups.collapsed'
const collapsed = createPersistedStore<ReadonlySet<string>>('collapsedGroups', KEY, {
  parse: (raw) => {
    try { return new Set(JSON.parse(raw ?? '[]') as string[]) } catch { return new Set() }
  },
  serialize: (set) => JSON.stringify([...set]),
})

export function groupKey(view: string, key: string): string {
  return `${view}:${key}`
}

export function isGroupCollapsed(view: string, key: string): boolean {
  return collapsed.get().has(groupKey(view, key))
}

export function setGroupCollapsed(view: string, key: string, on: boolean): void {
  const next = new Set(collapsed.get())
  if (on) next.add(groupKey(view, key))
  else next.delete(groupKey(view, key))
  collapsed.set(next)
}

export const useCollapsedGroups = collapsed.use

/** Tests: forget every collapsed group. */
export function resetCollapsedGroups(): void {
  collapsed.set(new Set())
}
