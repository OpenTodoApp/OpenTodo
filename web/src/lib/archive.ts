// Automatic archive of completed projects (OpenSpec change `trash-and-history`,
// design D6). Runs on the client: a check after each completion (the UI offers a
// one-key archive) and a daily pass that archives projects with tasks but no open
// task for 30 days. Archiving is an ordinary op, so devices converge; two devices
// archiving at once write the same value. The opt-out is per device (`meta`).
import { db, getMeta, setMeta } from './db'
import { archiveProject, updateProject } from './ops'
import { canEditProject, membershipMap, roleOf } from './sharing'
import type { Membership, Project, Task } from './types'

export const AUTO_ARCHIVE_DAYS = 30
const DAY_MS = 86_400_000
export const AUTO_ARCHIVE_KEY = 'autoArchive'
export const AUTO_ARCHIVE_SKIP_KEY = 'autoArchiveSkip'
export const AUTO_ARCHIVE_LAST_RUN_KEY = 'autoArchiveLastRun'

/** Whether this device archives finished projects automatically (default on). */
export function getAutoArchive(): Promise<boolean> {
  return getMeta<boolean>(AUTO_ARCHIVE_KEY, true)
}

export function setAutoArchive(on: boolean): Promise<void> {
  return setMeta(AUTO_ARCHIVE_KEY, on)
}

/**
 * Projects to archive automatically: live, not archived, at least one live task,
 * no open task, and the last completion at least 30 days ago. The Inbox is not a
 * project and never qualifies; neither does a shared project the user cannot
 * archive, nor one the user un-archived after an automatic archive (`skip`).
 */
export function archiveCandidates(
  projects: Iterable<Project>, tasks: Iterable<Task>, now: number,
  memberships: Map<string, Membership> = new Map(), skip: Set<string> = new Set(),
): Project[] {
  const stats = new Map<string, { total: number; open: number; last: number }>()
  for (const t of tasks) {
    if (t.deleted_at || !t.project_id) continue
    const s = stats.get(t.project_id) ?? { total: 0, open: 0, last: 0 }
    s.total++
    if (!t.completed_at) s.open++
    else s.last = Math.max(s.last, t.completed_at)
    stats.set(t.project_id, s)
  }
  const out: Project[] = []
  for (const p of projects) {
    if (p.deleted_at || p.archived || skip.has(p.id)) continue
    if (!canEditProject(roleOf(p.id, memberships))) continue
    const s = stats.get(p.id)
    if (!s || s.total === 0 || s.open > 0) continue
    if (now - s.last >= AUTO_ARCHIVE_DAYS * DAY_MS) out.push(p)
  }
  return out
}

/**
 * After completing a task: the project to offer archiving for, when that task was
 * its last open one. Null for the Inbox, archived or deleted projects, projects
 * still holding open tasks and projects the user's role cannot archive.
 */
export async function projectFinishedBy(taskId: string): Promise<Project | null> {
  const task = await db.tasks.get(taskId)
  if (!task?.project_id || !task.completed_at) return null
  const project = await db.projects.get(task.project_id)
  if (!project || project.deleted_at || project.archived) return null
  if (!canEditProject(roleOf(project.id, await membershipMap()))) return null
  const open = await db.tasks.where('project_id').equals(project.id).filter((t) => !t.deleted_at && !t.completed_at).count()
  return open === 0 ? project : null
}

/**
 * The daily pass: archives every candidate unless the device opted out, at most
 * once per `intervalMs`. Returns the archived projects for the notice.
 */
export async function runAutoArchive(now = Date.now(), intervalMs = DAY_MS): Promise<Project[]> {
  if (!(await getAutoArchive())) return []
  const last = await getMeta<number>(AUTO_ARCHIVE_LAST_RUN_KEY, 0)
  if (now - last < intervalMs) return []
  await setMeta(AUTO_ARCHIVE_LAST_RUN_KEY, now)
  const skip = new Set(await getMeta<string[]>(AUTO_ARCHIVE_SKIP_KEY, []))
  const list = archiveCandidates(await db.projects.toArray(), await db.tasks.toArray(), now, await membershipMap(), skip)
  for (const p of list) await archiveProject(p.id)
  return list
}

/**
 * Restore an archived project (OpenSpec `unarchive-projects`): one op on the
 * existing `archived` field, so it applies at once, works offline and converges.
 * Only this project is restored; archived descendants stay archived. The project
 * joins this device's skip list so the daily pass does not archive it again.
 */
export async function unarchiveProject(id: string): Promise<void> {
  const skip = new Set(await getMeta<string[]>(AUTO_ARCHIVE_SKIP_KEY, []))
  skip.add(id)
  await setMeta(AUTO_ARCHIVE_SKIP_KEY, [...skip])
  await updateProject(id, { archived: false })
}

/** Undo an automatic archive and never archive that project automatically again on this device. */
export const undoAutoArchive = unarchiveProject

/** One row of Settings → Data → Archived projects. */
export interface ArchivedProject {
  project: Project
  /** Name of the parent project, when it is a sub-project of a live one. */
  parentName: string | null
  /** Open (not completed, not deleted) tasks directly in the project. */
  open: number
  /** Whether the user's role allows restoring it (the same roles that may archive). */
  canRestore: boolean
}

/** Archived, non-deleted projects sorted by name, with what the list shows for each. */
export function archivedProjects(
  projects: Iterable<Project>, tasks: Iterable<Task>, memberships: Map<string, Membership> = new Map(),
): ArchivedProject[] {
  const all = [...projects]
  const byId = new Map(all.map((p) => [p.id, p]))
  const open = new Map<string, number>()
  for (const t of tasks) {
    if (t.deleted_at || t.completed_at || !t.project_id) continue
    open.set(t.project_id, (open.get(t.project_id) ?? 0) + 1)
  }
  return all
    .filter((p) => p.archived && !p.deleted_at)
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .map((p) => {
      const parent = p.parent_id ? byId.get(p.parent_id) : undefined
      return {
        project: p,
        parentName: parent && !parent.deleted_at ? parent.name : null,
        open: open.get(p.id) ?? 0,
        canRestore: canEditProject(roleOf(p.id, memberships)),
      }
    })
}
