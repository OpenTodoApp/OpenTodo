// Calendar slots (OpenSpec change calendar-slots): one block on the Day and Week
// grid that holds a checklist of small tasks, such as "Admin" on Wednesday from
// 16:00 for 45 minutes. A slot is a personal synced entity (design D1); the tasks
// it shows are derived here (D2) and every action is one undoable batch of
// ordinary field edits (D3, D5). No field is added to tasks: a slotted task is an
// ordinary task due on the slot's day without a time.
import { useMemo } from 'react'
import type { ProposedChange } from './assistantTypes'
import { DAY_MINUTES, SLOT_MINUTES } from './calendar'
import { db, type AssistantUndo } from './db'
import { formatMinutes } from './duration'
import { localDate, localDueOf } from './dates'
import { clockMinutes, clockOf, fitInFrame } from './frames'
import { t } from './i18n'
import { uuid } from './ids'
import { liveSnapshot } from './liveSnapshot'
import { createStore } from './store'
import { getDeviceId, SLOT_DEFAULTS } from './ops'
import { canEditTask, membershipMap } from './sharing'
import type { Due, Membership, Slot, Task } from './types'
import { applyBatch } from './undo'

/** The most tasks one slot lists (design D1). */
export const MAX_SLOT_TASKS = 20
/** Lengths a slot can have: 15 to 480 minutes in 15-minute steps (design D1). */
export const MIN_SLOT_MINUTES = 15
export const MAX_SLOT_MINUTES = 480
export const DEFAULT_SLOT_MINUTES = 30
export const MAX_SLOT_TITLE = 200
/** A slot's grid id, next to task ids and `event:` ids in a day's layout. */
export const SLOT_KEY = 'slot:'
export const isSlotKey = (id: string): boolean => id.startsWith(SLOT_KEY)
export const slotKey = (id: string): string => SLOT_KEY + id

/** A slot's name: its title, or "Slot". */
export function slotName(slot: Pick<Slot, 'title'>): string {
  return slot.title.trim() || t('Slot')
}

/** Live slots with a date and a readable start, created first first (design D2's tie rule). */
export function liveSlots(slots: readonly Slot[]): Slot[] {
  return slots
    .filter((s) => !s.deleted_at && !!s.date && clockMinutes(s.start) !== null)
    .sort((a, b) => a.created_at - b.created_at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** A slot on one day with the tasks it shows. */
export interface SlotView {
  /** `slot:<id>`, its id in the day's layout. */
  key: string
  slot: Slot
  start: number
  end: number
  /** Open shown tasks in list order. */
  open: Task[]
  /** Completed shown tasks in list order, drawn checked after the open ones. */
  done: Task[]
  /** Sum of the open tasks' estimates. */
  estimate: number
  /** What the slot counts toward capacity: the greater of its length and `estimate` (design D6). */
  counted: number
  /** The estimates exceed the length ("50m in 45m"). */
  overfull: boolean
}

/**
 * The slots of `date` and the tasks each shows (design D2): a listed task that is
 * known, not deleted and due on the slot's date in the viewer's zone (or undated).
 * When two slots of the day list the same task, the slot created first shows it.
 * `tasks` holds every local task by id with its due as viewed (open and completed).
 */
export function slotsOnDate(slots: readonly Slot[], date: string, tasks: ReadonlyMap<string, Task>): SlotView[] {
  const claimed = new Set<string>()
  const out: SlotView[] = []
  for (const slot of liveSlots(slots)) {
    if (slot.date !== date) continue
    const open: Task[] = []
    const done: Task[] = []
    for (const id of slot.task_ids ?? []) {
      const task = tasks.get(id)
      if (!task || task.deleted_at || claimed.has(id) || (task.due && task.due.date !== date)) continue
      claimed.add(id)
      ;(task.completed_at ? done : open).push(task)
    }
    const start = clockMinutes(slot.start)!
    const minutes = Math.max(1, slot.minutes || DEFAULT_SLOT_MINUTES)
    const estimate = open.reduce((sum, task) => sum + (task.estimate_minutes || 0), 0)
    out.push({ key: slotKey(slot.id), slot, start, end: Math.min(DAY_MINUTES, start + minutes), open, done, estimate, counted: Math.max(minutes, estimate), overfull: estimate > minutes })
  }
  return out
}

/** The slots of each date. */
export function slotsByDate(slots: readonly Slot[], dates: readonly string[], tasks: ReadonlyMap<string, Task>): Map<string, SlotView[]> {
  const out = new Map<string, SlotView[]>()
  if (!slots.length) return out
  for (const d of dates) {
    const views = slotsOnDate(slots, d, tasks)
    if (views.length) out.set(d, views)
  }
  return out
}

/** The ids of the tasks a day's slots show; they are not drawn again as blocks or in the lane. */
export function heldTaskIds(views: readonly SlotView[] | undefined): Set<string> {
  const out = new Set<string>()
  for (const v of views ?? []) for (const task of [...v.open, ...v.done]) out.add(task.id)
  return out
}

/**
 * What a day's slots change in its capacity (design D6): each slot counts once with
 * the greater of its length and its open tasks' estimates, and its tasks are not
 * counted again. `extra` is added to the day's task estimates (which already hold
 * the slotted tasks'), `covered` the unestimated tasks a slot accounts for.
 */
export function slotCapacity(views: readonly SlotView[] | undefined): { extra: number; covered: number } {
  let extra = 0, covered = 0
  for (const v of views ?? []) {
    extra += v.counted - v.estimate
    covered += v.open.filter((task) => !task.estimate_minutes).length
  }
  return { extra, covered }
}

/** "2 of 5 done", or "50m in 45m" when the estimates exceed the length (design D6). */
export function slotCount(view: SlotView): string {
  if (view.overfull) return t('{estimate} in {length}', { estimate: formatMinutes(view.estimate), length: formatMinutes(view.end - view.start) })
  return t('{done} of {total} done', { done: view.done.length, total: view.open.length + view.done.length })
}

/** The slot of `date` whose time holds `minutes` (a placement's start, design D7), or null. */
export function slotAt(views: readonly SlotView[] | undefined, minutes: number): SlotView | null {
  return views?.find((v) => v.start <= minutes && minutes < v.end) ?? null
}

/** The slot that shows a task on its due date, from slots in any order, or null (list rows, design D8). */
export function slotOf(task: Pick<Task, 'id' | 'due' | 'deleted_at'>, slots: readonly Slot[], zone?: string): Slot | null {
  const date = localDate(task.due, zone)
  if (!date || task.deleted_at) return null
  for (const s of liveSlots(slots)) if (s.date === date && s.task_ids?.includes(task.id)) return s
  return null
}

// ---- reads for screens ----

const slotRows = liveSnapshot('slots', () => db.slots.toArray())
const NO_SLOTS: Slot[] = []

/** Every local slot row (deleted ones too; the helpers above filter). */
export function useSlots(): Slot[] {
  return slotRows.use() ?? NO_SLOTS
}

/** The slot a list row's task is shown in, or null (design D8: the row's time column). */
export function useSlotOf(task: Pick<Task, 'id' | 'due' | 'deleted_at' | 'completed_at'>): Slot | null {
  const slots = useSlots()
  return useMemo(() => (slots.length && !task.due?.time ? slotOf(task, slots) : null), [slots, task])
}

/** A predicate for list models: whether a task shows a slot's start in its time column. */
export function useSlotted(): (task: Pick<Task, 'id' | 'due' | 'deleted_at'>) => boolean {
  const slots = useSlots()
  return useMemo(() => (task) => slots.length > 0 && !task.due?.time && slotOf(task, slots) !== null, [slots])
}

// ---- batches (design D3, D5) ----

export type SlotBatch = { changes: ProposedChange[]; label: string } | { error: string }

/**
 * Adding a task to a slot (design D3): the slot's list with the task at its end,
 * the task's due set to the slot's date without a time when it is not already
 * that, and the task taken out of the day's other slots. `viewedDue` is the
 * task's due in the viewer's zone; `canEdit` whether the user may change it.
 */
export function addChanges(slot: Slot, task: Pick<Task, 'id' | 'due'>, viewedDue: Due | null, slots: readonly Slot[], canEdit: boolean): SlotBatch {
  const list = slot.task_ids ?? []
  const listed = list.includes(task.id)
  if (!listed && list.length >= MAX_SLOT_TASKS) return { error: t('A slot holds up to {n} tasks.', { n: MAX_SLOT_TASKS }) }
  const dated = viewedDue?.date === slot.date && !viewedDue.time
  if (!dated && !canEdit) return { error: t("You can't change this task's date") }
  const changes: ProposedChange[] = []
  if (!listed) changes.push({ entity: 'slot', entityId: slot.id, patch: { task_ids: [...list, task.id] } })
  if (!dated) changes.push({ entity: 'task', entityId: task.id, patch: { due: { date: slot.date } } })
  for (const other of slots) {
    if (other.id === slot.id || other.deleted_at || other.date !== slot.date || !other.task_ids?.includes(task.id)) continue
    changes.push({ entity: 'slot', entityId: other.id, patch: { task_ids: other.task_ids.filter((id) => id !== task.id) } })
  }
  return { changes, label: t('Added to {slot}', { slot: slotName(slot) }) }
}

/**
 * Moving a slot (design D5): its date and start, and when the date changes each
 * shown task the user may edit is dated to the new day; the others stay on their
 * day and stop being shown.
 */
export function moveChanges(view: SlotView, date: string, start: number, memberships: Map<string, Membership>): SlotBatch {
  const patch: Record<string, unknown> = {}
  if (view.slot.date !== date) patch.date = date
  const clock = clockOf(Math.max(0, Math.min(DAY_MINUTES - SLOT_MINUTES, start)))
  if (view.slot.start !== clock) patch.start = clock
  if (!Object.keys(patch).length) return { changes: [], label: '' }
  const changes: ProposedChange[] = [{ entity: 'slot', entityId: view.slot.id, patch }]
  if (patch.date) {
    for (const task of [...view.open, ...view.done]) {
      if (canEditTask(task, memberships)) changes.push({ entity: 'task', entityId: task.id, patch: { due: { date } } })
    }
  }
  return { changes, label: t('{slot} moved', { slot: slotName(view.slot) }) }
}

/** A slot's new length: whole 15-minute steps from 15 to 480 minutes. */
export function clampSlotMinutes(minutes: number): number {
  return Math.max(MIN_SLOT_MINUTES, Math.min(MAX_SLOT_MINUTES, Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES))
}

/** Taking a task out of a slot (design D5); with `due` (a drop on the grid) the task gets that time too. */
export function takeOutChanges(slot: Slot, taskId: string, due?: Due | null): SlotBatch {
  const changes: ProposedChange[] = [{ entity: 'slot', entityId: slot.id, patch: { task_ids: (slot.task_ids ?? []).filter((id) => id !== taskId) } }]
  if (due) changes.push({ entity: 'task', entityId: taskId, patch: { due } })
  return { changes, label: t('Taken out of {slot}', { slot: slotName(slot) }) }
}

/** The result of a slot action: the undo entry and its toast text, or the refusal. */
export type SlotResult = { entry: AssistantUndo | null; label: string; error?: undefined } | { error: string; entry?: undefined; label?: undefined }

async function run(batch: SlotBatch): Promise<SlotResult> {
  if ('error' in batch) return { error: batch.error }
  if (!batch.changes.length) return { entry: null, label: '' }
  await getDeviceId()
  const entry = await applyBatch(batch.changes, { source: 'action', label: batch.label })
  return { entry, label: batch.label }
}

/** Adds a task to a slot as one undoable batch (design D3), or answers why not. */
export async function addTaskToSlot(slotId: string, taskId: string, zone?: string): Promise<SlotResult> {
  const [slot, task, slots, memberships] = await Promise.all([db.slots.get(slotId), db.tasks.get(taskId), db.slots.toArray(), membershipMap()])
  if (!slot || slot.deleted_at || !slot.date || !task || task.deleted_at) return { entry: null, label: '' }
  return run(addChanges(slot, task, localDueOf(task.due, zone), slots, canEditTask(task, memberships)))
}

/** Moves a slot (and its tasks' dates) as one undoable batch. */
export async function moveSlot(view: SlotView, date: string, start: number): Promise<SlotResult> {
  return run(moveChanges(view, date, start, await membershipMap()))
}

/** Changes a slot's length (15-minute steps) as one undoable batch. */
export async function resizeSlot(slot: Slot, minutes: number): Promise<SlotResult> {
  const next = clampSlotMinutes(minutes)
  if (next === slot.minutes) return { entry: null, label: '' }
  return run({ changes: [{ entity: 'slot', entityId: slot.id, patch: { minutes: next } }], label: t('{slot} resized', { slot: slotName(slot) }) })
}

/** Takes a task out of a slot, optionally giving it a time, as one undoable batch. */
export async function takeOutOfSlot(slot: Slot, taskId: string, due?: Due | null): Promise<SlotResult> {
  return run(takeOutChanges(slot, taskId, due))
}

/** Renames or recolours a slot as one undoable batch. */
export async function editSlot(slot: Slot, patch: { title?: string; color?: string }): Promise<SlotResult> {
  const clean: Record<string, unknown> = {}
  if (patch.title !== undefined && patch.title.trim().slice(0, MAX_SLOT_TITLE) !== slot.title) clean.title = patch.title.trim().slice(0, MAX_SLOT_TITLE)
  if (patch.color !== undefined && patch.color !== slot.color) clean.color = patch.color
  if (!Object.keys(clean).length) return { entry: null, label: '' }
  return run({ changes: [{ entity: 'slot', entityId: slot.id, patch: clean }], label: t('Slot changed') })
}

/** Deletes a slot (a tombstone) as one undoable batch; its tasks keep their date without a time. */
export async function deleteSlot(slot: Slot, now = Date.now()): Promise<SlotResult> {
  if (slot.deleted_at) return { entry: null, label: '' }
  return run({ changes: [{ entity: 'slot', entityId: slot.id, patch: { deleted_at: now }, base: { deleted_at: null } }], label: t('Slot deleted') })
}

export interface NewSlot {
  date: string
  start: string
  minutes?: number
  title?: string
  color?: string
}

/** Creates a slot as one undoable batch and returns its id with the undo entry. */
export async function createSlot(input: NewSlot, now = Date.now()): Promise<{ id: string; entry: AssistantUndo | null; label: string }> {
  const id = uuid()
  await getDeviceId()
  const label = t('Slot created')
  const entry = await applyBatch([{
    entity: 'slot', entityId: id, create: true,
    patch: {
      title: (input.title ?? '').trim().slice(0, MAX_SLOT_TITLE), date: input.date, start: input.start,
      minutes: clampSlotMinutes(input.minutes ?? DEFAULT_SLOT_MINUTES), task_ids: [], color: input.color ?? SLOT_DEFAULTS.color, created_at: now, deleted_at: null,
    },
  }], { source: 'action', label })
  return { id, entry, label }
}

/**
 * Where New slot goes (design "Create slots"): the first free quarter hour at or
 * after `from` on the day, around the busy intervals, for `length` minutes; the
 * next quarter hour when nothing is free.
 */
export function nextFreeStart(from: number, busy: readonly { start: number; end: number }[], length = DEFAULT_SLOT_MINUTES): number {
  const first = Math.min(DAY_MINUTES - SLOT_MINUTES, Math.ceil(from / SLOT_MINUTES) * SLOT_MINUTES)
  return fitInFrame({ start: first, end: DAY_MINUTES }, busy, length) ?? first
}

/** The busy intervals of a day from local rows: timed open tasks and live slots (events are added by the grid). */
export async function busyOn(date: string, zone?: string): Promise<{ start: number; end: number }[]> {
  const [tasks, slots] = await Promise.all([db.tasks.toArray(), db.slots.toArray()])
  const out: { start: number; end: number }[] = []
  for (const task of tasks) {
    if (task.deleted_at || task.completed_at || !task.due?.time) continue
    const due = localDueOf(task.due, zone)
    const start = clockMinutes(due.time)
    if (due.date !== date || start === null) continue
    out.push({ start, end: start + (task.estimate_minutes || 30) })
  }
  for (const s of liveSlots(slots)) {
    if (s.date !== date) continue
    const start = clockMinutes(s.start)!
    out.push({ start, end: start + s.minutes })
  }
  return out
}

/** A new slot whose title the grid opens for editing (design "Create slots"): its id, or null. */
export const slotTitleRequest = createStore<string | null>('slotTitleRequest', null)
