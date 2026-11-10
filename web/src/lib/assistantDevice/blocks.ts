// The display tools on the device (OpenSpec change assistant-generative-ui, design
// D2): internal/assistant blocks.go in the browser. The same argument checks, the
// same id checks against this device's rows (live, visible, not in a project kept
// away from assistants), the same limit and the same results, pinned by
// blocks.vectors.json. A display call changes nothing.
import type { AssistantBlock } from '../assistantBlocks'
import { daysBetweenISO } from '../dates'
import { db } from '../db'
import { calendarDate } from './args'
import { isDeleted, loadSnapshot, str, type Row } from './data'
import { manifest } from './manifest'

export const DISPLAY_TOOLS = ['show_tasks', 'show_calendar', 'ask_choice', 'show_map', 'show_note', 'show_project', 'show_time', 'show_free_time', 'show_deadlines']

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_TITLE = 80
const MAX_QUESTION = 200
const MAX_OPTION = 60
// The time blocks (assistant-time-blocks), as blocks.go: MaxBlockDays and the free time minutes.
const MAX_DAYS = 31
const DEFAULT_FREE = 30
const MAX_FREE = 12 * 60

class DisplayArgError extends Error {}

const strings = (v: unknown, field: string): string[] => {
  if (v === undefined || v === null) return []
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) throw new DisplayArgError(`${field} must be a list of ids`)
  return v as string[]
}

function text(field: string, v: unknown, max: number, required: boolean): string {
  const s = typeof v === 'string' ? v.trim() : ''
  if (!s && required) throw new DisplayArgError(`${field} is required`)
  if ([...s].length > max) throw new DisplayArgError(`${field} is longer than ${max} characters`)
  return s
}

function ids(field: string, v: unknown, required: boolean): string[] {
  const list = strings(v, field)
  if (required && !list.length) throw new DisplayArgError(`${field} needs at least one id`)
  if (list.length > manifest.limits.max_block_ids) throw new DisplayArgError(`${field} holds at most ${manifest.limits.max_block_ids} ids`)
  return list
}

/** A block's days from..to (checkRange): two dates in order, at most MAX_DAYS. */
function range(a: Record<string, unknown>): { from: string; to: string } {
  const from = typeof a.from === 'string' ? a.from : ''
  const to = typeof a.to === 'string' ? a.to : ''
  if (!calendarDate(from) || !calendarDate(to)) throw new DisplayArgError('from and to must be YYYY-MM-DD')
  if (to < from) throw new DisplayArgError('to must not be before from')
  if (daysBetweenISO(from, to) + 1 > MAX_DAYS) throw new DisplayArgError(`a block covers at most ${MAX_DAYS} days`)
  return { from, to }
}

/** A display call's arguments as a block, before its ids are checked (parseBlock). */
export function parseBlock(name: string, a: Record<string, unknown>): AssistantBlock {
  switch (name) {
    case 'show_tasks': {
      const title = a.title === undefined || a.title === null ? '' : text('title', a.title, MAX_TITLE, false)
      return { kind: 'tasks', ids: ids('ids', a.ids, true), ...(title ? { title } : {}) }
    }
    case 'show_calendar':
      if (typeof a.date !== 'string' || !DATE_RE.test(a.date)) throw new DisplayArgError('date must be YYYY-MM-DD')
      if (a.span !== 'day' && a.span !== 'week') throw new DisplayArgError('span must be "day" or "week"')
      return { kind: 'calendar', date: a.date, span: a.span }
    case 'ask_choice': {
      const question = text('question', a.question, MAX_QUESTION, true)
      const raw = Array.isArray(a.options) ? a.options : []
      if (raw.length < 2 || raw.length > 4) throw new DisplayArgError('options holds 2 to 4 answers')
      return { kind: 'choice', question, options: raw.map((o) => text('each option', o, MAX_OPTION, true)) }
    }
    case 'show_map': {
      const taskIds = strings(a.task_ids, 'task_ids')
      const placeIds = strings(a.place_ids, 'place_ids')
      if (!taskIds.length && !placeIds.length) throw new DisplayArgError('name at least one task id or place id')
      if (taskIds.length + placeIds.length > manifest.limits.max_block_ids) throw new DisplayArgError(`a map shows at most ${manifest.limits.max_block_ids} items`)
      return { kind: 'map', task_ids: taskIds, place_ids: placeIds }
    }
    case 'show_note':
    case 'show_project': {
      const id = typeof a.id === 'string' ? a.id : ''
      if (!id.trim()) throw new DisplayArgError('id is required')
      return { kind: name === 'show_note' ? 'note' : 'project', id }
    }
    case 'show_time': {
      const r = range(a)
      if (a.group_by !== 'project' && a.group_by !== 'day') throw new DisplayArgError('group_by must be "project" or "day"')
      return { kind: 'time', ...r, group_by: a.group_by }
    }
    case 'show_free_time': {
      if (typeof a.date !== 'string' || !DATE_RE.test(a.date)) throw new DisplayArgError('date must be YYYY-MM-DD')
      if (a.span !== 'day' && a.span !== 'week') throw new DisplayArgError('span must be "day" or "week"')
      const m = a.min_minutes
      if (m !== undefined && m !== null && (typeof m !== 'number' || !Number.isInteger(m) || m < 1 || m > MAX_FREE)) throw new DisplayArgError(`min_minutes must be a whole number from 1 to ${MAX_FREE}`)
      return { kind: 'free_time', date: a.date, span: a.span, min_minutes: typeof m === 'number' ? m : DEFAULT_FREE }
    }
    case 'show_deadlines':
      return { kind: 'deadlines', ...range(a) }
  }
  throw new DisplayArgError('unknown display tool')
}

type ShownKind = 'task' | 'project' | 'note' | 'place'

/** The ids, in order and without repeats, that name a live entity this device's assistant may read (Registry.Shown). */
export async function shown(kind: ShownKind, list: readonly string[]): Promise<string[]> {
  if (!list.length) return []
  const snap = await loadSnapshot()
  const live = new Set<string>()
  if (kind === 'task') {
    // As on the server: a task whose project is gone or kept away is not shown.
    for (const t of snap.tasks) if (!str(t, 'project_id') || snap.projects.has(str(t, 'project_id'))) live.add(str(t, 'id'))
  } else if (kind === 'project') {
    for (const id of snap.projects.keys()) live.add(id)
  } else if (kind === 'place') {
    for (const p of (await db.places.toArray()) as unknown as Row[]) if (!isDeleted(p)) live.add(str(p, 'id'))
  } else {
    for (const n of (await db.notes.toArray()) as unknown as Row[]) {
      const pid = str(n, 'project_id')
      if (!isDeleted(n) && (!pid || snap.projects.has(pid))) live.add(str(n, 'id'))
    }
  }
  const out: string[] = []
  for (const id of list) if (live.has(id) && !out.includes(id)) out.push(id)
  return out
}

/** One turn's display state: the blocks shown so far. */
export interface DisplayTurn { shown: number }

/** Keeps a block's live ids: the block left, how many ids it named and how many are left. */
async function check(b: AssistantBlock): Promise<{ block: AssistantBlock; asked: number; found: number }> {
  switch (b.kind) {
    case 'tasks': {
      const list = await shown('task', b.ids)
      return { block: { ...b, ids: list }, asked: b.ids.length, found: list.length }
    }
    case 'map': {
      const tasks = await shown('task', b.task_ids ?? [])
      const places = await shown('place', b.place_ids ?? [])
      return { block: { kind: 'map', task_ids: tasks, place_ids: places }, asked: (b.task_ids?.length ?? 0) + (b.place_ids?.length ?? 0), found: tasks.length + places.length }
    }
    case 'note':
    case 'project':
      return { block: b, asked: 1, found: (await shown(b.kind, [b.id])).length }
    case 'calendar':
    case 'time':
    case 'free_time':
    case 'deadlines':
      return { block: b, asked: 1, found: 1 }
    case 'choice':
      return { block: b, asked: b.options.length, found: b.options.length }
  }
}

/** A display call: the checks, the limit, the block (through `emit`) and the tool result. */
export async function runDisplay(name: string, args: Record<string, unknown>, turn: DisplayTurn, emit: (b: AssistantBlock) => void): Promise<{ content: string; isError: boolean }> {
  const fail = (payload: Record<string, unknown>) => ({ content: JSON.stringify(payload), isError: true })
  if (turn.shown >= manifest.limits.max_blocks) return fail({ error: 'block_limit', message: manifest.messages.block_limit })
  let parsed: AssistantBlock
  try {
    parsed = parseBlock(name, args)
  } catch (err) {
    if (err instanceof DisplayArgError) return fail({ error: 'invalid_arguments', message: err.message })
    throw err
  }
  const { block, asked, found } = await check(parsed)
  if (!found) return fail({ error: 'not_found', message: manifest.messages.not_found })
  turn.shown++
  emit(block)
  const out: Record<string, unknown> = { shown: block.kind, count: found }
  if (asked > found) out.not_found = asked - found
  if (block.kind === 'choice') out.message = manifest.messages.choice_asked
  return { content: JSON.stringify(out), isError: false }
}
