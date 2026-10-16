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
function foldName(s: string): string {
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

/**
 * Durations. With a leading `+` any of `+30`, `+30m`, `+45min`, `+2h`, `+1.5h`,
 * `+1h30`, `+1h30m` is an estimate in minutes. Without the `+`, `45min` and `2h`
 * are accepted too, except that `2h` is left alone when `bareHourIsTime` is set
 * (an active language writes clock times as "15h"). Out-of-range values do not match.
 */
export function matchDuration(token: string, opts: { bareHourIsTime: boolean }): number | null {
  const item = token.replace(/[,;]+$/, '').toLowerCase()
  const plus = item.startsWith('+')
  const body = plus ? item.slice(1) : item
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
