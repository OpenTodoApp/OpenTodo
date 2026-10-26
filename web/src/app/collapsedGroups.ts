// Which list groups are collapsed on this device (OpenSpec change ux-overhaul,
// task-list-presentation "Group headers"): date, project and Later groups, keyed
// by view and group. Device state, never synced; sections keep their own store.
import { useSyncExternalStore } from 'react'
import { resettable } from '../lib/moduleState'

const KEY = 'ot.groups.collapsed'
let current: ReadonlySet<string> = read()
const listeners = new Set<() => void>()

function read(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]) } catch { return new Set() }
}

export function groupKey(view: string, key: string): string {
  return `${view}:${key}`
}

export function isGroupCollapsed(view: string, key: string): boolean {
  return current.has(groupKey(view, key))
}

export function setGroupCollapsed(view: string, key: string, collapsed: boolean): void {
  const next = new Set(current)
  if (collapsed) next.add(groupKey(view, key))
  else next.delete(groupKey(view, key))
  current = next
  try { localStorage.setItem(KEY, JSON.stringify([...next])) } catch { /* device state only */ }
  listeners.forEach((fn) => fn())
}

export function useCollapsedGroups(): ReadonlySet<string> {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn) } }, () => current, () => current)
}

/** Tests: forget every collapsed group. */
export function resetCollapsedGroups(): void {
  current = new Set()
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
  listeners.forEach((fn) => fn())
}
resettable('collapsedGroups', resetCollapsedGroups)
