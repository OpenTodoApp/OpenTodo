// Language-independent attribute tokens: #project, @label, p1–p4 and durations.
import type { Priority } from '../types'
import { normalize } from './vocab'

/** The slice of a project the matcher needs; archived and deleted projects are ignored. */
export interface ProjectRef {
  id: string
  name: string
  archived?: boolean
  deleted_at?: number | null
  /** Parent project for nested projects; used only to break ties between equal names. */
  parent_id?: string | null
}

/** Upper bound for an estimate: one week, mirrors `MaxPositiveInt` on the server. */
export const MAX_ESTIMATE_MINUTES = 10080

/** Fold a project name or a #token for comparison: no case, diacritics or spaces. */
export function foldName(s: string): string {
  return normalize(s).replace(/[\s_-]+/g, '')
}

/**
 * Depth of a project in the visible tree: 0 at the top level. A parent that is
 * missing, archived or deleted ends the walk (the sidebar shows such a child at the
 * top level), and a parent cycle is cut, so this always terminates.
 */
function depthOf(p: ProjectRef, byId: Map<string, ProjectRef>): number {
  let depth = 0
  const seen = new Set([p.id])
  let cur = p
  while (cur.parent_id) {
    const parent = byId.get(cur.parent_id)
    if (!parent || seen.has(parent.id)) break
    seen.add(parent.id)
    depth++
    cur = parent
  }
  return depth
}

/**
 * Resolve a `#name` token against every live project, nested ones included: exact
 * (folded) match first, then a unique prefix. Several projects with exactly the same
 * name resolve to the shallowest one in the tree (then the smallest id), so
 * `#docs` means a top-level "Docs" over "Work › Docs". An ambiguous prefix, or no
 * match, returns null and the token stays in the title. The project list may arrive
 * in any order; the result is the same.
 */
export function matchProject(token: string, projects: readonly ProjectRef[]): ProjectRef | null {
  if (!token.startsWith('#') || token.length < 2) return null
  if (token.includes('/')) return matchProjectPath(token, projects)
  const want = foldName(token.slice(1))
  if (!want) return null
  const live = projects.filter((p) => !p.archived && !p.deleted_at)
  const exact = live.filter((p) => foldName(p.name) === want)
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) {
    const byId = new Map(live.map((p) => [p.id, p]))
    const ranked = exact.map((p) => ({ p, depth: depthOf(p, byId) }))
    ranked.sort((a, b) => a.depth - b.depth || (a.p.id < b.p.id ? -1 : a.p.id > b.p.id ? 1 : 0))
    return ranked[0].p
  }
  const prefix = live.filter((p) => foldName(p.name).startsWith(want))
  return prefix.length === 1 ? prefix[0] : null
}

/**
 * A `#Parent/Child` path (smart-title-tokens D2): every segment matches a project name
 * exactly (folded) and each is the parent of the next, so two projects with the same
 * name under different parents are told apart. No prefix matching; null otherwise.
 */
export function matchProjectPath(token: string, projects: readonly ProjectRef[]): ProjectRef | null {
  const parts = token.slice(1).split('/').map(foldName)
  if (parts.length < 2 || parts.some((x) => !x)) return null
  const live = projects.filter((p) => !p.archived && !p.deleted_at)
  const byId = new Map(live.map((p) => [p.id, p]))
  const fits = (p: ProjectRef): boolean => {
    let cur: ProjectRef | undefined = p
    for (let i = parts.length - 1; i >= 0; i--) {
      if (!cur || foldName(cur.name) !== parts[i]) return false
      cur = i > 0 ? (cur.parent_id ? byId.get(cur.parent_id) : undefined) : cur
    }
    return true
  }
  const found = live.filter(fits)
  if (!found.length) return null
  found.sort((a, b) => depthOf(a, byId) - depthOf(b, byId) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return found[0]
}

/** Why a `#token` names no project: none starts with it, or several do (smart-title-tokens D4). */
export function projectMiss(token: string, projects: readonly ProjectRef[]): { reason: 'none' } | { reason: 'ambiguous'; count: number } | null {
  if (!token.startsWith('#') || token.length < 2 || matchProject(token, projects)) return null
  const want = foldName(token.slice(1).split('/').pop() ?? '')
  if (!want) return null
  const n = projects.filter((p) => !p.archived && !p.deleted_at && foldName(p.name).startsWith(want)).length
  return n > 1 && !token.includes('/') ? { reason: 'ambiguous', count: n } : { reason: 'none' }
}

/** `@name` → `name`, exactly as typed (trailing comma dropped); null otherwise. */
export function matchLabel(token: string): string | null {
  if (!token.startsWith('@') || token.length < 2) return null
  const name = token.slice(1).replace(/[,;]+$/, '')
  return name.length > 0 && !/\s/.test(name) ? name : null
}

/** `p1`–`p4` (any case) → priority. */
export function matchPriority(token: string): Priority | null {
  const m = /^p([1-4])$/i.exec(token.replace(/[,;]+$/, ''))
  return m ? (Number(m[1]) as Priority) : null
}

const SPENT_PART = '(\\d+(?:[.,]\\d+)?h(?:\\d{1,2}(?:m|min)?)?|\\d+(?:m|min|mins|minutes))'
const SPENT = new RegExp(`^${SPENT_PART}/${SPENT_PART}$`)

/** One part of a spent token in minutes, or null (both parts carry a unit). */
function spentPart(s: string): number | null {
  let m = /^(\d+(?:[.,]\d+)?)h(?:(\d{1,2})(?:m|min)?)?$/.exec(s)
  let v: number | null = null
  if (m) {
    const mins = m[2] ? Number(m[2]) : 0
    if (mins > 59) return null
    v = Math.round(Number(m[1].replace(',', '.')) * 60 + mins)
  } else if ((m = /^(\d+)(?:m|min|mins|minutes)$/.exec(s))) v = Number(m[1])
  return v !== null && v >= 1 && v <= MAX_ESTIMATE_MINUTES ? v : null
}

/**
 * Time already spent and an estimate, `<spent>/<estimate>` (OpenSpec time-tracking,
 * design D10): `30m/2h`, `1h/1h30`, `45min/2h`. Both parts need a unit, so a
 * day-month date such as `30/12` never matches, and there is no `+`. Mirrors
 * matchSpent in internal/quickadd.
 */
export function matchSpent(token: string): { spent: number; estimate: number } | null {
  const m = SPENT.exec(token.replace(/[,;]+$/, '').toLowerCase())
  if (!m) return null
  const spent = spentPart(m[1])
  const estimate = spentPart(m[2])
  return spent !== null && estimate !== null ? { spent, estimate } : null
}

/**
 * Durations. With a leading `+` any of `+30`, `+30m`, `+45min`, `+2h`, `+1.5h`,
 * `+1h30`, `+1h30m` is an estimate in minutes. Without the `+`, `45min` and `2h`
 * are accepted too, except that `2h` is left alone when `bareHourIsTime` is set
 * (an active language writes clock times as "15h"). Out-of-range values do not match.
 */
export function matchDuration(token: string, opts: { bareHourIsTime: boolean }): number | null {
  const t = token.replace(/[,;]+$/, '').toLowerCase()
  const plus = t.startsWith('+')
  const body = plus ? t.slice(1) : t
  if (!body) return null
  let minutes: number | null = null
  let m: RegExpExecArray | null
  if ((m = /^(\d+(?:[.,]\d+)?)h(?:(\d{1,2})(?:m|min)?)?$/.exec(body))) {
    // 2h, 1.5h, 1h30, 1h30m
    const hours = Number(m[1].replace(',', '.'))
    const mins = m[2] ? Number(m[2]) : 0
    if (mins > 59) return null
    if (!plus && (opts.bareHourIsTime || m[2] !== undefined)) return null
    minutes = Math.round(hours * 60 + mins)
  } else if ((m = /^(\d+)(m|min|mins|minutes)$/.exec(body))) {
    if (!plus && m[2] === 'm') return null // bare "30m" could be metres
    minutes = Number(m[1])
  } else if (plus && (m = /^(\d+)$/.exec(body))) {
    minutes = Number(m[1])
  }
  if (minutes === null || !Number.isInteger(minutes) || minutes < 1 || minutes > MAX_ESTIMATE_MINUTES) return null
  return minutes
}
