// A workspace's activity (OpenSpec change workspace-activity): every actor's
// events in the workspace's projects and Inbox, from the device's retained
// events (offline, D6) merged with pages of GET /api/v1/workspaces/{id}/activity.
// The filters are remembered on the device per workspace (D5), never synced; a
// range is stored as days, so a chosen week stays that week.
import { useLiveQuery } from 'dexie-react-hooks'
import { api } from './api'
import { db } from './db'
import { decryptActivityPage } from './e2ee'
import { newestFirst, projectActivity } from './activity'
import { readJSON, writeJSON } from './deviceStorage'
import { FEED_KINDS, feedKindOf, type FeedKind } from './feed'
import type { ActivityEvent, ActivityPage } from './types'
import { Partition, type WorkspaceState } from './workspaces'

export interface WorkspaceFilter {
  /** Inclusive days, YYYY-MM-DD in the viewer's time zone; '' for no bound. */
  from: string
  to: string
  kinds: FeedKind[]
  /** A project id, 'inbox', or '' for all. */
  project: string
  actor: string
}

export const NO_FILTER: WorkspaceFilter = { from: '', to: '', kinds: [], project: '', actor: '' }

const key = (workspaceId: string) => `workspaceActivity:${workspaceId}`
const DAY = /^\d{4}-\d{2}-\d{2}$/
const KNOWN = new Set<string>(FEED_KINDS.map((k) => k.value))

/** The filters this device last used for the workspace. */
export function readFilter(workspaceId: string): WorkspaceFilter {
  return readJSON(key(workspaceId), NO_FILTER, (v) => {
    if (!v || typeof v !== 'object') return null
    const o = v as Record<string, unknown>
    const str = (x: unknown) => (typeof x === 'string' ? x : '')
    const day = (x: unknown) => (typeof x === 'string' && DAY.test(x) ? x : '')
    const kinds = Array.isArray(o.kinds) ? o.kinds.filter((k): k is FeedKind => typeof k === 'string' && KNOWN.has(k)) : []
    return { from: day(o.from), to: day(o.to), kinds, project: str(o.project), actor: str(o.actor) }
  })
}

export function writeFilter(workspaceId: string, f: WorkspaceFilter): void {
  writeJSON(key(workspaceId), f)
}

/** The range as Unix ms: the start of `from` and the end of `to`, local time. */
export function rangeOf(f: Pick<WorkspaceFilter, 'from' | 'to'>): { from?: number; to?: number } {
  const at = (d: string, end: boolean) => {
    const [y, m, day] = d.split('-').map(Number)
    return end ? new Date(y, m - 1, day + 1).getTime() - 1 : new Date(y, m - 1, day).getTime()
  }
  return { ...(f.from ? { from: at(f.from, false) } : {}), ...(f.to ? { to: at(f.to, true) } : {}) }
}

export function filterWorkspace(events: ActivityEvent[], f: WorkspaceFilter): ActivityEvent[] {
  const { from, to } = rangeOf(f)
  const kinds = f.kinds.length ? new Set(f.kinds) : null
  return events.filter((e) => (from === undefined || e.ts >= from) && (to === undefined || e.ts <= to) &&
    (!kinds || kinds.has(feedKindOf(e.kind))) && (!f.actor || e.actor === f.actor) &&
    (!f.project || (f.project === 'inbox' ? !e.projectId : e.projectId === f.project)))
}

/**
 * The events this device retains for the workspace's projects (deleted ones
 * too) and for its Inbox tasks, newest first, each tagged with its project.
 */
export async function localWorkspaceEvents(workspaceId: string, state: WorkspaceState): Promise<ActivityEvent[]> {
  const projects = await db.projects.toArray()
  const known = state.list.map((w) => w.id)
  const placed = new Partition(state.defaultId, known, projects)
  // One workspace (or none cached yet): everything is in it, as in projectsIn.
  const all = state.list.length <= 1
  const ids = projects.filter((p) => all || placed.project(p.id) === workspaceId).map((p) => p.id)
  const names = new Map(projects.map((p) => [p.id, p.name]))
  // Reads start together, so the live query tracks every one (see feedEvents).
  const [inbox, ...perProject] = await Promise.all([projectActivity('inbox'), ...ids.map((id) => projectActivity(id))])
  const taskIds = [...new Set(inbox.map((e) => e.taskId).filter((id): id is string => !!id))]
  const tasks = (await db.tasks.bulkGet(taskIds)).filter((t) => !!t)
  const p = new Partition(state.defaultId, known, projects, tasks)
  const inWorkspace = new Set(tasks.filter((t) => all || p.taskRow(t) === workspaceId).map((t) => t.id))
  return newestFirst([
    ...inbox.filter((e) => e.taskId && inWorkspace.has(e.taskId)),
    // The name travels along: an archived or deleted project is not among the live ones.
    ...perProject.flatMap((evs, i) => evs.map((ev) => ({ ...ev, projectId: ids[i], projectName: names.get(ids[i]) }))),
  ])
}

/** The workspace's retained events, live; undefined until read. */
export function useWorkspaceEvents(workspaceId: string, state: WorkspaceState): ActivityEvent[] | undefined {
  return useLiveQuery(() => localWorkspaceEvents(workspaceId, state), [workspaceId, state])
}

/** One page from the server with the filters applied. */
export async function fetchWorkspaceActivity(workspaceId: string, f: WorkspaceFilter, cursor?: string): Promise<ActivityPage> {
  const { from, to } = rangeOf(f)
  const page = await api.workspaceActivity(workspaceId, {
    cursor, from, to, actor: f.actor, kind: f.kinds.join(','), project: f.project === 'inbox' ? '' : f.project,
  })
  // An Inbox filter is applied here: the route has no Inbox-only parameter.
  const events = f.project === 'inbox' ? page.events.filter((e) => !e.projectId) : page.events
  return decryptActivityPage({ ...page, events })
}
