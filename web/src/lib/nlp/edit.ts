// Parsing while editing a title (OpenSpec change smart-title-tokens, design D5): only
// the text typed in this edit is read; the title as it was when the edit began is
// treated as quoted, so "Review may report" never gains a date on a later edit. On
// commit the recognised attributes become one patch: scalar fields overwrite, labels
// are added to the task's, reminders are new records. Pure: no reads, no writes.
import type { Task } from '../types'
import { parse, type ParseContext, type ParseResult } from './parse'
import type { Span } from './tokenize'

/** The spans of `draft` that were already in `base` (the common prefix and suffix). */
export function unchangedSpans(base: string, draft: string): Span[] {
  let p = 0
  const max = Math.min(base.length, draft.length)
  while (p < max && base[p] === draft[p]) p++
  let s = 0
  while (s < max - p && base[base.length - 1 - s] === draft[draft.length - 1 - s]) s++
  const out: Span[] = []
  if (p > 0) out.push({ start: 0, end: p, text: draft.slice(0, p) })
  if (s > 0) out.push({ start: draft.length - s, end: draft.length, text: draft.slice(draft.length - s) })
  return out
}

/** Parses `draft` as quick add does, reading only what differs from `base`. */
export function parseEdit(base: string, draft: string, ctx: ParseContext): ParseResult {
  return parse(draft, { ...ctx, dismissed: [...(ctx.dismissed ?? []), ...unchangedSpans(base, draft)] })
}

/** What a committed edit writes: the task fields, the label names to add and the reminders. */
export interface EditPlan {
  patch: Partial<Pick<Task, 'title' | 'due' | 'deadline' | 'start' | 'evening' | 'priority' | 'estimate_minutes' | 'recurrence' | 'project_id'>>
  /** Label names typed, in order; resolved (and created) by the caller, then added. */
  labels: string[]
  reminders: ParseResult['reminders']
}

/** The plan for a parse of an edited title; an empty patch apart from the title when nothing was recognised. */
export function editPlan(task: Pick<Task, 'title' | 'project_id'>, r: ParseResult): EditPlan {
  const patch: EditPlan['patch'] = {}
  if (r.title !== task.title) patch.title = r.title
  if (r.due) patch.due = r.due
  if (r.deadline) patch.deadline = r.deadline
  if (r.start) patch.start = r.start
  if (r.evening) patch.evening = true
  if (r.priority) patch.priority = r.priority
  if (r.estimateMinutes) patch.estimate_minutes = r.estimateMinutes
  if (r.recurrence) patch.recurrence = r.recurrence
  if (r.projectId && r.projectId !== (task.project_id ?? null)) patch.project_id = r.projectId
  return { patch, labels: r.labels, reminders: r.reminders }
}
