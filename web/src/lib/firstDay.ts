// The first-day checklist (OpenSpec change moments-and-onboarding, design D5;
// first-run "First-day checklist"): three steps to first value whose done state is
// read from local data and never written. "Add a task": a task not marked sample.
// "Plan today": a non-sample task with a date, or Today opened after the first task
// (remembered on this device only). "Get it on another device": the app runs
// installed here, or the account's personal rows (Inbox tasks, preferences, reviews)
// carry a clock from another browser device. Hiding the sidebar entry is the synced
// `start_checklist` preference (userPrefs.ts).
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { db } from './db'
import { getDeviceId } from './ops'
import { isSample } from './sampleTasks'
import type { Task } from './types'

export type FirstDayStep = 'add' | 'plan' | 'device'
export const FIRST_DAY_STEPS: readonly FirstDayStep[] = ['add', 'plan', 'device']
export type FirstDayState = Record<FirstDayStep, boolean>

const TODAY_KEY = 'opentodo.firstDay.todayOpened'
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

function readTodayOpened(): boolean {
  try { return localStorage.getItem(TODAY_KEY) === '1' } catch { return false }
}

/** Today was opened: counts for "Plan today" once a real task exists. Device state only. */
export async function noteTodayOpened(): Promise<void> {
  if (readTodayOpened()) return
  const real = await db.tasks.filter((task) => !task.deleted_at && !isSample(task)).first()
  if (!real) return
  try { localStorage.setItem(TODAY_KEY, '1') } catch { /* private window: the step stays open */ }
  emit()
}

/** Whether the app runs installed (its own window) on this device. */
export function isInstalled(): boolean {
  try {
    return window.matchMedia?.('(display-mode: standalone)').matches === true || (navigator as { standalone?: boolean }).standalone === true
  } catch { return false }
}

// A browser device id is a UUID; server-side writers are named (server, import, caldav:…).
const BROWSER_DEVICE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Whether a row's field clocks name a browser device other than this one. */
export function writtenElsewhere(row: { _clock?: Record<string, { device: string }> } | undefined, self: string): boolean {
  return Object.values(row?._clock ?? {}).some((c) => c.device !== self && BROWSER_DEVICE.test(c.device))
}

// Early-exit queries, so a large account pays one short scan per step after each write.
// Only Dexie promises are awaited inside, so the live query keeps observing every table it reads.
async function readState(todayOpened: boolean, self: string): Promise<FirstDayState> {
  const real = (task: Task) => !task.deleted_at && !isSample(task)
  const add = !!(await db.tasks.filter(real).first())
  const plan = add && (todayOpened || !!(await db.tasks.filter((task) => real(task) && !!task.due).first()))
  // Personal-scope rows only (Inbox tasks, preferences, reviews): other members' devices never write these.
  const elsewhere = (row: unknown) => writtenElsewhere(row as { _clock?: Record<string, { device: string }> } | undefined, self)
  const device = isInstalled() || elsewhere(await db.userPrefs.get('me')) || elsewhere(await db.review.get('me'))
    || !!(await db.tasks.filter((task) => !task.project_id && elsewhere(task)).first())
  return { add, plan, device }
}

/** The checklist's live state, or undefined while loading or when not `enabled` (nothing is read then). */
export function useFirstDay(enabled = true): FirstDayState | undefined {
  const todayOpened = useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn) } }, readTodayOpened, () => false)
  const [self, setSelf] = useState<string | null>(null)
  useEffect(() => { if (enabled) void getDeviceId().then(setSelf) }, [enabled])
  return useLiveQuery(() => (enabled && self ? readState(todayOpened, self) : undefined), [todayOpened, enabled, self])
}

export const doneCount = (state: FirstDayState): number => FIRST_DAY_STEPS.filter((s) => state[s]).length
