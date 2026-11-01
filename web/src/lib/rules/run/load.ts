// The device's rows as a RunWorld (routines-ai-step D7): what planRoutine
// reads, from this device's decrypted copy in Dexie. The template library is
// loaded only when a routine has a Create a project from a template step.
import { db } from '../../db'
import { membershipMap, currentUserId } from '../../sharing'
import { logicalDate } from '../match'
import type { RoutineStep, UserPrefs } from '../../types'
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
}

/** Reads this device's rows for a run. */
export async function loadRunWorld(o: LoadOptions): Promise<RunWorld> {
  const now = o.now ?? Date.now()
  const [tasks, projects, labels, sections, views, fields, timeEntries, prefs, memberships, me] = await Promise.all([
    db.tasks.toArray(), db.projects.toArray(), db.labels.toArray(), db.sections.toArray(), db.views.toArray(), db.fields.toArray(),
    db.timeEntries.toArray(), db.userPrefs.get('me'), membershipMap(), currentUserId(),
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
  return {
    userId: me ?? '', today: logicalDate(now, offset, dayStart), now, weekStart: WEEK_START[String(p.week_start)] ?? 1, offset, dayStart,
    tasks: rows(tasks), projects: rows(projects), labels: rows(labels), sections: rows(sections), views: rows(views), fields: rows(fields),
    timeEntries: rows(timeEntries), prefs: p, memberships, changed: changedDates(rows(tasks), offset, dayStart), encrypted: o.encrypted,
    env: o.env, templates,
  }
}
