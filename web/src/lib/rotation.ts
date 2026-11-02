// Rotating assignees on recurring tasks (OpenSpec change chore-rotation). The
// server computes the same thing in internal/sync/rotation.go; both are pinned by
// rotation.vectors.json.
import type { Membership, Task } from './types'

/** At most this many people take turns on one task (design D1). */
export const MAX_ROTATION = 20

/**
 * The person whose turn follows `current` (design D2): the one after `current`
 * among the rotation's people who are members, wrapping around, or the first of
 * them when `current` is not one of them. With nobody left it returns `current`.
 */
export function nextAssignee(rotation: readonly string[], current: string, isMember: (id: string) => boolean): string {
  const live = rotation.filter((id) => isMember(id))
  if (live.length === 0) return current
  const i = live.indexOf(current)
  return i < 0 ? live[0] : live[(i + 1) % live.length]
}

/** A rotation may hold at most MAX_ROTATION distinct, non-empty account ids. */
export function validRotation(list: readonly string[]): boolean {
  return list.length <= MAX_ROTATION && list.every((id) => id !== '' && id.length <= 64) && new Set(list).size === list.length
}

/** The current members of a shared project (the owner included), or undefined for a personal one. */
export function memberSet(m: Membership | undefined): ReadonlySet<string> | undefined {
  return m ? new Set(m.members.map((p) => p.userId)) : undefined
}

/**
 * Whether a task can take turns: a top-level recurring task in a project with at
 * least two members. Elsewhere a stored rotation is kept but inert and hidden.
 */
export function canRotate(task: Pick<Task, 'recurrence' | 'parent_id'>, members: ReadonlySet<string> | undefined): boolean {
  return !!task.recurrence && !task.parent_id && (members?.size ?? 0) >= 2
}

/** The rotation in effect on a task: its people, or [] when it is inert. */
export function activeRotation(task: Pick<Task, 'recurrence' | 'parent_id' | 'rotation'>, members: ReadonlySet<string> | undefined): string[] {
  const list = task.rotation ?? []
  return list.length > 0 && canRotate(task, members) ? list : []
}

/**
 * Whether a row marks its assignee as taking turns: a top-level recurring task
 * whose rotation names two or more people. Rows show assignees only in shared
 * projects, so the member count is not read here.
 */
export function rowTakesTurns(task: Pick<Task, 'recurrence' | 'parent_id' | 'rotation'>): boolean {
  return !!task.recurrence && !task.parent_id && (task.rotation?.length ?? 0) >= 2
}

/** `list` with the person at `from` moved to `to` (both clamped). */
export function moveInRotation(list: readonly string[], from: number, to: number): string[] {
  const out = [...list]
  if (from < 0 || from >= out.length) return out
  const [id] = out.splice(from, 1)
  out.splice(Math.max(0, Math.min(to, out.length)), 0, id)
  return out
}

/**
 * `list` with the people of `add` appended in their order, skipping who is
 * already in it and anyone past MAX_ROTATION ("Add everyone in <group>").
 */
export function addToRotation(list: readonly string[], add: readonly string[]): string[] {
  const out = [...list]
  for (const id of add) if (!out.includes(id) && out.length < MAX_ROTATION) out.push(id)
  return out
}

/**
 * The assignee a completion that continues `series` passes the turn to, or
 * undefined when nothing changes (no rotation in effect, or the same person).
 */
export function turnAfterCompletion(series: Task, members: ReadonlySet<string> | undefined): string | undefined {
  const list = activeRotation(series, members)
  if (list.length === 0 || !members) return undefined
  const current = series.assignee_id ?? ''
  const next = nextAssignee(list, current, (id) => members.has(id))
  return next && next !== current ? next : undefined
}
