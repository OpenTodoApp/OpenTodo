// The `[[` picker's list (OpenSpec change note-links, design D3): the live notes,
// tasks and projects of the current workspace whose title holds every typed word
// (case and accents ignored, as the Notes search), ranked by title prefix, then
// words matched at a word start, then open before done, then the most recent
// change; at most 8, shown grouped as Notes, Tasks, Projects. In a note of a shared
// project only that project's items are offered (owner decision 1). Lazy chunk only.
import { normalizeText } from './noteSearch'
import type { LinkKind } from './noteLinkGrammar'
import type { Note, Project, Task } from './types'

export const MAX_LINK_ROWS = 8

export interface LinkCandidate {
  kind: LinkKind
  id: string
  title: string
  /** A faint second line: the project, or for a subtask its parent. */
  secondary: string | null
  /** A completed task or an archived project (listed after open ones). */
  done: boolean
}

export interface LinkPickerInput {
  tasks: readonly Task[]
  projects: readonly Project[]
  notes: readonly Note[]
  /** Only items of this project (a shared project's note); null for the whole workspace. */
  scope: string | null
  /** The note being edited (`<kind>:<id>`), never offered. */
  self: string
  untitled: string
}

const normal = new WeakMap<object, string>()
function norm(row: object, title: string): string {
  let n = normal.get(row)
  if (n === undefined) normal.set(row, (n = normalizeText(title)))
  return n
}

function updated(row: { _clock?: Record<string, { ts: number }>; created_at?: number }): number {
  let best = row.created_at ?? 0
  for (const c of Object.values(row._clock ?? {})) if (c.ts > best) best = c.ts
  return best
}

const ORDER: Record<LinkKind, number> = { note: 0, task: 1, project: 2 }

/** The rows for a query, already grouped (notes, tasks, projects), at most MAX_LINK_ROWS. */
export function linkCandidates(query: string, input: LinkPickerInput): LinkCandidate[] {
  const q = normalizeText(query.trim())
  const words = q.split(/\s+/).filter(Boolean)
  const projectName = new Map(input.projects.map((p) => [p.id, p.name]))
  const taskTitle = new Map<string, string>()
  const scored: { c: LinkCandidate; tier: number; at: number }[] = []
  const consider = (kind: LinkKind, row: object & { _clock?: Record<string, { ts: number }>; created_at?: number }, id: string, title: string, secondary: string | null, done: boolean) => {
    if (`${kind}:${id}` === input.self) return
    const n = norm(row, title)
    if (!words.every((w) => n.includes(w))) return
    const tier = !q ? 0 : n.startsWith(q) ? 0 : words.every((w) => n.startsWith(w) || n.includes(` ${w}`)) ? 1 : 2
    scored.push({ c: { kind, id, title, secondary, done }, tier, at: updated(row) })
  }
  const inScope = (pid: string | null | undefined) => input.scope === null || pid === input.scope
  if (input.tasks.length) for (const t of input.tasks) taskTitle.set(t.id, t.title)
  for (const n of input.notes) {
    if (n.deleted_at || !inScope(n.project_id)) continue
    consider('note', n, n.id, n.title.trim() || input.untitled, n.project_id ? projectName.get(n.project_id) ?? null : null, false)
  }
  for (const t of input.tasks) {
    if (t.deleted_at || !inScope(t.project_id) || !t.title.trim()) continue
    const parent = t.parent_id ? taskTitle.get(t.parent_id) : undefined
    consider('task', t, t.id, t.title, parent ?? (t.project_id ? projectName.get(t.project_id) ?? null : null), !!t.completed_at)
  }
  for (const p of input.projects) {
    if (p.deleted_at || (input.scope !== null && p.id !== input.scope)) continue
    consider('project', p, p.id, p.name, null, !!p.archived)
  }
  scored.sort((a, b) => a.tier - b.tier || Number(a.c.done) - Number(b.c.done) || b.at - a.at || (a.c.id < b.c.id ? -1 : 1))
  return scored.slice(0, MAX_LINK_ROWS).map((s) => s.c).sort((a, b) => ORDER[a.kind] - ORDER[b.kind])
}

/** Whether the New note row is offered: text typed and no title equal to it. */
export function offersNewNote(query: string, rows: readonly LinkCandidate[]): boolean {
  const q = normalizeText(query.trim())
  return !!q && !rows.some((r) => normalizeText(r.title) === q)
}
