// Quarterly and weekly objectives (OpenSpec change plan-objectives): a handful
// of short lines pinned to a quarter "YYYY-Qn" or an ISO week "YYYY-Www", read
// and written only through the op log. At most five open per period (design
// D2): the client hides Add at the limit; devices that were offline together can
// hold more, and every one of them is shown, never removed. Each change is one
// undoable batch, applied locally first (D4). Past periods are never moved by
// themselves (D5).
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { logicalDay } from './dates'
import { t } from './i18n'
import { uuid } from './ids'
import { currentPeriods, nextOf, parseSector, formatPeriod } from './sectors'
import type { Objective } from './types'
import { applyBatch } from './undo'
import type { AssistantUndo } from './db'

/** The most open objectives a period holds (D2). */
export const MAX_OPEN_OBJECTIVES = 5
/** The longest title, in characters (D2). */
export const MAX_OBJECTIVE_TITLE = 140
/** The input starts counting down this many characters before the limit (D2). */
export const OBJECTIVE_COUNTDOWN = 20

/** Whether `p` is an objective period: a quarter or an ISO week, never a month. */
export function isObjectivePeriod(p: unknown): p is string {
  const parsed = parseSector(p)
  return !!parsed && parsed.kind !== 'month'
}

/** The previous quarter or week of a period ("2026-W45" → "2026-W44"). */
export function previousPeriod(period: string): string | null {
  const p = parseSector(period)
  if (!p || p.kind === 'month') return null
  if (p.kind === 'quarter') return formatPeriod(p.n > 1 ? { ...p, n: p.n - 1 } : { ...p, year: p.year - 1, n: 4 })
  // Weeks: the last ISO week of the year before holds 28 December.
  return p.n > 1 ? formatPeriod({ ...p, n: p.n - 1 }) : currentPeriods(`${p.year - 1}-12-28`, 1)['this-week']
}

/** The following period ("2026-Q4" → "2027-Q1"). */
export function followingPeriod(period: string): string | null {
  const p = parseSector(period)
  return p && p.kind !== 'month' ? formatPeriod(nextOf(p)) : null
}

/** This quarter, this week and next week on the viewer's date and first day of the week. */
export function objectivePeriods(today: string, weekStart: number): { quarter: string; week: string; nextWeek: string } {
  const cur = currentPeriods(today, weekStart)
  return { quarter: cur['this-quarter'], week: cur['this-week'], nextWeek: cur['next-week'] }
}

export interface ReviewPlan {
  /** This quarter. */
  quarter: string
  /** The week being planned: next week on the last three days of the week, this week otherwise (or flipped). */
  planned: string
  /** Whether the planned week is next week. */
  plansNext: boolean
  /** The week before the planned week, whose open objectives are offered. */
  previousWeek: string
  /** The previous quarter, offered in the first review of a new quarter; null otherwise. */
  previousQuarter: string | null
}

/**
 * The weekly review's periods (D4): it plans next week when opened on the last
 * three days of the viewer's week (Friday to Sunday with Monday weeks), this
 * week otherwise, `flip` choosing the other; the previous quarter's open
 * objectives are offered while the last finished review (Unix ms, 0 for none)
 * falls in an earlier quarter than today. `weekStart` is 0 (Sunday) to 6.
 */
export function reviewPlan(today: string, weekStart: number, lastReviewAt: number, flip = false): ReviewPlan {
  const p = objectivePeriods(today, weekStart)
  const dayOfWeek = (new Date(`${today}T12:00:00Z`).getUTCDay() - weekStart + 7) % 7
  const plansNext = (dayOfWeek >= 4) !== flip
  const planned = plansNext ? p.nextWeek : p.week
  const lastQuarter = lastReviewAt ? objectivePeriods(logicalDay(lastReviewAt), weekStart).quarter : ''
  return {
    quarter: p.quarter, planned, plansNext, previousWeek: previousPeriod(planned)!,
    previousQuarter: lastQuarter === p.quarter ? null : previousPeriod(p.quarter),
  }
}

/** Live (not deleted) objectives of a period in their order. */
export function objectivesIn(list: readonly Objective[], period: string): Objective[] {
  return list.filter((o) => o.period === period && !o.deleted_at)
    .sort((a, b) => a.position - b.position || a.created_at - b.created_at || a.id.localeCompare(b.id))
}

/** The number of open (not done, not deleted) objectives of a period. */
export function openCount(list: readonly Objective[], period: string): number {
  return list.filter((o) => o.period === period && !o.deleted_at && !o.done_at).length
}

/** Whether Add is offered for a period: fewer than five open (D2). */
export function canAdd(list: readonly Objective[], period: string): boolean {
  return openCount(list, period) < MAX_OPEN_OBJECTIVES
}

/** A title as typed, trimmed to one line; '' when nothing is left. */
export function cleanTitle(title: string): string {
  return title.replace(/[\r\n]+/g, ' ').trim().slice(0, MAX_OBJECTIVE_TITLE)
}

const NO_OBJECTIVES: Objective[] = []

/** The live objectives of the given periods (every period when none is given). */
export function useObjectives(periods?: readonly string[]): Objective[] {
  const key = periods?.join(',') ?? ''
  return useLiveQuery(async () => {
    const rows = periods ? await db.objectives.where('period').anyOf([...periods]).toArray() : await db.objectives.toArray()
    return rows.filter((o) => !o.deleted_at)
  }, [key], NO_OBJECTIVES) ?? NO_OBJECTIVES
}

export interface ObjectiveResult {
  entry: AssistantUndo | null
  label: string
}

async function batch(changes: { id: string; patch: Partial<Objective>; create?: boolean }[], label: string): Promise<ObjectiveResult> {
  const entry = await applyBatch(changes.map((c) => ({ entity: 'objective' as const, entityId: c.id, patch: c.patch, ...(c.create ? { create: true } : {}) })), { source: 'action', label })
  return { entry, label }
}

/**
 * Adds an objective at the end of its period. Refused (null) for an invalid
 * period, an empty title, or a period that already holds five open ones.
 */
export async function addObjective(title: string, period: string, now = Date.now()): Promise<(ObjectiveResult & { id: string }) | null> {
  const clean = cleanTitle(title)
  if (!clean || !isObjectivePeriod(period)) return null
  const rows = (await db.objectives.where('period').equals(period).toArray()).filter((o) => !o.deleted_at)
  if (!canAdd(rows, period)) return null
  const position = Math.max(0, ...rows.map((o) => o.position)) + 1024
  const id = uuid()
  const r = await batch([{ id, create: true, patch: { title: clean, period, position, done_at: 0, created_at: now, deleted_at: null } }], t('Objective added'))
  return { ...r, id }
}

/** Renames an objective (an empty title changes nothing). */
export async function renameObjective(id: string, title: string): Promise<ObjectiveResult | null> {
  const clean = cleanTitle(title)
  const row = await db.objectives.get(id)
  if (!clean || !row || row.title === clean) return null
  return batch([{ id, patch: { title: clean } }], t('Objective renamed'))
}

/** Marks an objective done or open again. */
export async function setObjectiveDone(id: string, done: boolean, now = Date.now()): Promise<ObjectiveResult> {
  return batch([{ id, patch: { done_at: done ? now : 0 } }], done ? t('Objective done') : t('Objective reopened'))
}

/** Drops an objective (a tombstone, with Undo). */
export async function dropObjective(id: string, now = Date.now()): Promise<ObjectiveResult> {
  return batch([{ id, patch: { deleted_at: now } }], t('Objective dropped'))
}

/**
 * Carries an objective to another period, at its end (D4, D5). Refused (null)
 * when that period already holds five open objectives.
 */
export async function carryObjective(id: string, period: string): Promise<ObjectiveResult | null> {
  if (!isObjectivePeriod(period)) return null
  const rows = (await db.objectives.where('period').equals(period).toArray()).filter((o) => !o.deleted_at && o.id !== id)
  if (!canAdd(rows, period)) return null
  const position = Math.max(0, ...rows.map((o) => o.position)) + 1024
  return batch([{ id, patch: { period, position } }], t('Objective carried over'))
}

/** Moves an objective one place up (-1) or down (+1) within its period: one position write. */
export async function moveObjective(id: string, by: -1 | 1): Promise<ObjectiveResult | null> {
  const row = await db.objectives.get(id)
  if (!row) return null
  const list = objectivesIn(await db.objectives.where('period').equals(row.period).toArray(), row.period)
  const i = list.findIndex((o) => o.id === id)
  const j = i + by
  if (i < 0 || j < 0 || j >= list.length) return null
  return reorderTo(list, id, j)
}

/** Puts an objective at index `to` of its period's order, writing only its position. */
export async function placeObjective(id: string, to: number): Promise<ObjectiveResult | null> {
  const row = await db.objectives.get(id)
  if (!row) return null
  const list = objectivesIn(await db.objectives.where('period').equals(row.period).toArray(), row.period)
  return reorderTo(list, id, to)
}

function reorderTo(list: Objective[], id: string, to: number): Promise<ObjectiveResult> | null {
  const rest = list.filter((o) => o.id !== id)
  if (to < 0 || to > rest.length || list.findIndex((o) => o.id === id) === to) return null
  const before = rest[to - 1]?.position
  const after = rest[to]?.position
  const position = before === undefined ? (after ?? 1024) - 1024 : after === undefined ? before + 1024 : (before + after) / 2
  return batch([{ id, patch: { position } }], t('Objective moved'))
}
