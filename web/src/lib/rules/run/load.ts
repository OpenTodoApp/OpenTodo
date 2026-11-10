// The device's rows as a RunWorld (routines-ai-step D7): what planRoutine
// reads, from this device's decrypted copy in Dexie. The template library is
// loaded only when a routine has a Create a project from a template step.
import { db } from '../../db'
import { membershipMap, currentUserId } from '../../sharing'
import { logicalDate } from '../match'
import { defaultWorkspaceId, Partition } from '../../workspaces'
import type { RoutineStep, UserPrefs, Workspace } from '../../types'
import type { LibraryTemplate, Row, RunEnv, RunWorld } from './types'

const WEEK_START: Record<string, number> = { sun: 0, sat: 6 }

function usesTemplates(steps: readonly RoutineStep[]): boolean {
  return steps.some((s) => s.kind === 'project_from_template' || usesTemplates([...(s.then ?? []), ...(s.otherwise ?? []), ...(s.do ?? [])]))
}

/** The newest field change of each row, as a logical date (the condition `unchanged`). */
function changedDates(rows: readonly Row[], offset: number, dayStart: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const r of rows) {
    const clock = (r._clock ?? {}) as Record<string, { ts: number }>
    let ts = 0
    for (const c of Object.values(clock)) if (c && c.ts > ts) ts = c.ts
    if (ts) out[r.id as string] = logicalDate(ts, offset, dayStart)
  }
  return out
}

export interface LoadOptions {
  steps: readonly RoutineStep[]
  encrypted: boolean
  env?: RunEnv
  now?: number
  /** A shared routine's project: assignee names stay inside it. */
  project?: string
  /** A routine's workspace (routine-conditions D1): the world holds only its rows. */
  workspace?: string
}

/**
 * The world of a routine of one workspace (routine-conditions D1), as the
 * server's inWorkspace reads it: that workspace's tasks, projects and sections,
 * the other workspaces' projects in elsewhere. Null when the workspace is not
 * one of the user's (the routine does not run).
 */
export function inWorkspace(w: RunWorld, ws: string, workspaces: readonly Pick<Workspace, 'id' | 'name' | 'default'>[]): RunWorld | null {
  const own = workspaces.find((x) => x.id === ws)
  if (!own) return null
  const part = new Partition(defaultWorkspaceId(workspaces as Workspace[]), workspaces.map((x) => x.id), w.projects as never[], w.tasks as never[])
  const projects = w.projects.filter((p) => part.project(String(p.id)) === ws)
  const kept = new Set(projects.map((p) => String(p.id)))
  const elsewhere = new Set(w.projects.filter((p) => !kept.has(String(p.id))).map((p) => String(p.id)))
  const tasks = w.tasks.filter((t) => part.task(String(t.id)) === ws)
  const sections = w.sections.filter((s) => kept.has(String(s.project_id)))
  return { ...w, tasks, projects, sections, workspace: ws, workspaceName: own.name, workspaceDefault: !!own.default, elsewhere }
}

/** Reads this device's rows for a run. */
export async function loadRunWorld(o: LoadOptions): Promise<RunWorld> {
  const now = o.now ?? Date.now()
  const [tasks, projects, labels, sections, views, fields, timeEntries, prefs, memberships, me, workspaces] = await Promise.all([
    db.tasks.toArray(), db.projects.toArray(), db.labels.toArray(), db.sections.toArray(), db.views.toArray(), db.fields.toArray(),
    db.timeEntries.toArray(), db.userPrefs.get('me'), membershipMap(), currentUserId(), o.workspace ? db.workspaces.toArray() : Promise.resolve([]),
  ])
  const p = (prefs ?? {}) as Partial<UserPrefs> & Row
  const dayStart = typeof p.day_start === 'string' ? p.day_start : ''
  const offset = -new Date(now).getTimezoneOffset()
  const rows = (x: unknown[]) => x as unknown as Row[]
  let templates: LibraryTemplate[] | undefined
  if (usesTemplates(o.steps)) {
    const lib = (await import('../../../generated/templates.json')).default as unknown as { templates: LibraryTemplate[] }
    templates = lib.templates
  }
  const world: RunWorld = {
    userId: me ?? '', today: logicalDate(now, offset, dayStart), now, weekStart: WEEK_START[String(p.week_start)] ?? 1, offset, dayStart,
    tasks: rows(tasks), projects: rows(projects), labels: rows(labels), sections: rows(sections), views: rows(views), fields: rows(fields),
    timeEntries: rows(timeEntries), prefs: p, memberships, project: o.project || undefined, changed: changedDates(rows(tasks), offset, dayStart), encrypted: o.encrypted,
    env: o.env, templates,
  }
  if (!o.workspace || o.project) return world
  const scoped = inWorkspace(world, o.workspace, workspaces)
  if (!scoped) throw new WorkspaceGone()
  return scoped
}

/** The routine's workspace is no longer one of the user's: it does not run. */
export class WorkspaceGone extends Error {
  constructor() {
    super('workspace gone')
  }
}
