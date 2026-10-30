// Take a slot and Give back the slot (OpenSpec change today-closed-list, design D3):
// Today publishes its closed list here while it is on screen, so the row action, the
// task's Actions menu (also the long-press menu) and the palette offer the same two
// commands without each computing the slots again.
import { useSyncExternalStore } from 'react'
import { giveBackSlot, takeSlot } from '../../lib/closedListPrefs'
import { t } from '../../lib/i18n'
import { resettable } from '../../lib/moduleState'
import { act } from '../actionError'
import { ACTION_TOAST_MS, showBulkToast } from '../bulk/toastStore'
import type { ClosedList } from './useClosedList'

interface Published { list: ClosedList; today: string }

let current: Published | null = null
const listeners = new Set<() => void>()
resettable('closed-list-slots', () => { current = null })

/** Today on screen with a limit sets its closed list; null when it leaves or the limit is off. */
export function publishClosedList(next: Published | null): void {
  if (current?.list === next?.list && current?.today === next?.today) return
  current = next
  listeners.forEach((fn) => fn())
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export type SlotState = 'waiting' | 'taken' | null

/** The slot command a task offers now: Take a slot while it waits, Give back while it holds a taken slot. */
export function slotStateOf(id: string, p: Published | null = current): SlotState {
  if (!p || !p.list.fill.limit) return null
  if (p.list.waitingIds.has(id)) return 'waiting'
  return p.list.taken.includes(id) && p.list.fill.slots.includes(id) ? 'taken' : null
}

/** The slot state of one task, following Today's list live. */
export function useSlotState(id: string): SlotState {
  return useSyncExternalStore(subscribe, () => slotStateOf(id), () => null)
}

/** Take a slot for `id`; a full Today is refused with a message and nothing is written. */
export async function runTakeSlot(id: string): Promise<void> {
  const p = current
  if (!p) return
  const r = await takeSlot(p.list.review, p.today, p.list.fill, id)
  if (r === 'full') showBulkToast(t('Today is full: complete a task or give one back'), null, { ttl: ACTION_TOAST_MS })
}

/** Give back the slot `id` holds: it goes back to the usual fill order. */
export async function runGiveBackSlot(id: string): Promise<void> {
  const p = current
  if (!p) return
  await giveBackSlot(p.list.review, p.today, id)
}

/** The action of a task's slot state, run with the app's error toast. */
export function slotAction(id: string, state: SlotState): (() => void) | null {
  if (state === 'waiting') return () => act(runTakeSlot(id))
  if (state === 'taken') return () => act(runGiveBackSlot(id))
  return null
}

/** The label of a slot state's command. */
export function slotLabel(state: Exclude<SlotState, null>): string {
  return state === 'waiting' ? t('Take a slot') : t('Give back the slot')
}
