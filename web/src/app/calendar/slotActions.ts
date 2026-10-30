// Slot actions from the grid (OpenSpec change calendar-slots): run a batch from
// lib/slots and show its Undo toast, or the refusal ("You can't change this
// task's date", "A slot holds up to 20 tasks.") as a toast; and the ways to
// create a slot (New slot in the overflow menu and the palette, Make a slot here
// in a frame's popover, New slot here… for calendar-clarity's empty-slot menu).
import { logicalToday, todayISO } from '../../lib/dates'
import { clockOf } from '../../lib/frames'
import { busyOn, createSlot, nextFreeStart, slotTitleRequest, type NewSlot, type SlotResult } from '../../lib/slots'
import { act, reportActionError } from '../actionError'
import { showBulkToast, showUndoToast } from '../bulk/toastStore'
import { navigate } from '../router'

/** Runs a slot action; resolves true when it wrote something. */
export function runSlot(p: Promise<SlotResult>): Promise<boolean> {
  return p.then((r) => {
    if (r.error) { showBulkToast(r.error, null); return false }
    if (r.entry) showUndoToast(r.label, r.entry.id)
    return !!r.entry
  }, (err) => { reportActionError(err); return false })
}

/** Creates a slot with Undo and asks its block to open the title for editing. */
export async function newSlot(input: NewSlot): Promise<string> {
  const r = await createSlot(input)
  if (r.entry) showUndoToast(r.label, r.entry.id)
  slotTitleRequest.set(r.id)
  return r.id
}

/** New slot here… (for the empty-slot menu of OpenSpec change calendar-clarity): 30 minutes from that quarter hour. */
export function newSlotAt(date: string, startMinutes: number): void {
  act(newSlot({ date, start: clockOf(Math.floor(startMinutes / 15) * 15) }))
}

/** New slot on a day: the first free quarter hour at or after `from`, 30 minutes, around `busy` and the day's tasks and slots. */
export async function newSlotOn(date: string, from: number, busy: readonly { start: number; end: number }[] = [], zone?: string): Promise<string> {
  const all = [...busy, ...(await busyOn(date, zone))]
  return newSlot({ date, start: clockOf(nextFreeStart(from, all)) })
}

/** New slot from the command palette: today, the next free quarter hour from now, 30 minutes; the Day view shows it. */
export async function newSlotNow(now = new Date()): Promise<void> {
  const today = logicalToday(undefined, now.getTime())
  const minutes = todayISO(now) === today ? now.getHours() * 60 + now.getMinutes() : 0
  await newSlotOn(today, minutes)
  navigate({ view: 'day' })
}
