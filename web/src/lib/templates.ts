// Project templates and duplication (OpenSpec change project-templates, design
// D1–D5). One tree model for a project read from this device, a task tree and a
// template file; one planner that turns a tree into a single batch of ordinary
// ops with fresh ids and dates shifted to a start day. Copies carry structure and
// open work, never completion, assignees, comments or reminders.
import { addDaysISO, daysBetweenISO, todayISO } from './dates'
import { db } from './db'
import { nameId } from './ids'
import { mutateMany, type Change } from './ops'
import { compareByPosition, planMove } from './ordering'
import { descendants } from './tree'
import type { Due, Label, Project, Section, Task } from './types'

/** The device-side ceiling of one copy (design D4); larger files go through Import. */
export const MAX_TEMPLATE_TASKS = 1000

export class TemplateTooLargeError extends Error {
  constructor(public count: number) {
    super(`This holds ${count} tasks; a copy can make at most ${MAX_TEMPLATE_TASKS}. Load larger files with Settings → Data → Import.`)
  }
}

/** The file is not an OpenTodo template (design D1). */
export class TemplateFileError extends Error {}

export interface TTask {
  title: string
  description: string
  notes_doc?: string
  priority: number
  due: Due | null
  deadline?: string | null
  start?: string | null
  evening?: boolean
  labels: string[] // names
  estimate_minutes: number | null
  recurrence: string | null
  /** Keys of tasks in the same tree this one waits for (task-dependencies); remapped to the copies. */
  key?: string
  blocked_by?: string[]
  subtasks: TTask[]
}

export interface TSection {
  name: string
  tasks: TTask[]
}

export interface TProject {
  name: string
  color: string
  sections: TSection[]
  /** Tasks outside any section. */
  tasks: TTask[]
  children: TProject[]
}

export interface TemplateTree {
  labels: { name: string; color?: string }[]
  projects: TProject[]
  /** A bare task tree (Duplicate on a task) instead of projects. */
  tasks?: TTask[]
  /** The reference day for date shifting, when the source declares one. */
  day?: string
}

const byPos = <T extends { position: number; id: string }>(a: T, b: T) => compareByPosition(a, b)
const isOpenTask = (task: Task) => !task.deleted_at && !task.completed_at && !task.series_id

// ---- reading from this device ----

function taskNode(task: Task, all: Task[], labelName: Map<string, string>): TTask {
  const subs = all.filter((s) => s.parent_id === task.id && isOpenTask(s)).sort(byPos)
  const node: TTask = {
    key: task.id, title: task.title, description: task.description ?? '', priority: task.priority, due: task.due ?? null,
    deadline: task.deadline ?? null, start: task.start ?? null, evening: !!task.evening,
    labels: (task.labels ?? []).map((id) => labelName.get(id)).filter((n): n is string => !!n),
    estimate_minutes: task.estimate_minutes ?? null, recurrence: task.recurrence ?? null,
    blocked_by: task.blocked_by?.length ? [...task.blocked_by] : undefined,
    subtasks: subs.map((s) => taskNode(s, all, labelName)),
  }
  if (task.notes_doc) node.notes_doc = task.notes_doc
  return node
}

function usedLabels(nodes: TTask[], labels: Label[]): { name: string; color?: string }[] {
  const names = new Set<string>()
  const walk = (ts: TTask[]) => ts.forEach((item) => { item.labels.forEach((n) => names.add(n)); walk(item.subtasks) })
  walk(nodes)
  return labels.filter((l) => !l.deleted_at && names.has(l.name)).map((l) => ({ name: l.name, color: l.color }))
}

function allTasks(p: TProject): TTask[] {
  return [...p.tasks, ...p.sections.flatMap((s) => s.tasks), ...p.children.flatMap(allTasks)]
}

/** A project, its live sub-projects, sections and open tasks with their open subtasks. */
export async function treeFromProject(id: string): Promise<TemplateTree> {
  const projects = (await db.projects.toArray()).filter((p) => !p.deleted_at)
  const root = projects.find((p) => p.id === id)
  if (!root) throw new Error('Project not found')
  const ids = new Set([id, ...descendants(id, projects)])
  const live = projects.filter((p) => ids.has(p.id) && (p.id === id || !p.archived))
  const sections = (await db.sections.toArray()).filter((s) => !s.deleted_at && ids.has(s.project_id))
  const tasks = (await db.tasks.toArray()).filter((task) => task.project_id && ids.has(task.project_id) && isOpenTask(task))
  const labels = await db.labels.toArray()
  const labelName = new Map(labels.filter((l) => !l.deleted_at).map((l) => [l.id, l.name]))
  const node = (p: Project): TProject => {
    const mine = tasks.filter((tk) => tk.project_id === p.id)
    const top = mine.filter((item) => !item.parent_id || !mine.some((x) => x.id === item.parent_id)).sort(byPos)
    const secs = sections.filter((s) => s.project_id === p.id).sort(byPos) as Section[]
    const secIds = new Set(secs.map((s) => s.id))
    return {
      name: p.name, color: p.color,
      sections: secs.map((s) => ({ name: s.name, tasks: top.filter((task) => task.section_id === s.id).map((task) => taskNode(task, mine, labelName)) })),
      tasks: top.filter((task) => !task.section_id || !secIds.has(task.section_id)).map((task) => taskNode(task, mine, labelName)),
      children: live.filter((c) => c.parent_id === p.id).sort(byPos).map(node),
    }
  }
  const tree = node(root)
  return { labels: usedLabels(allTasks(tree), labels), projects: [tree] }
}

/** One task and its open subtasks. */
export async function treeFromTask(id: string): Promise<TemplateTree> {
  const task = await db.tasks.get(id)
  if (!task || task.deleted_at) throw new Error('Task not found')
  const all = (await db.tasks.toArray()).filter(isOpenTask)
  const labels = await db.labels.toArray()
  const labelName = new Map(labels.filter((l) => !l.deleted_at).map((l) => [l.id, l.name]))
  const node = taskNode(task, all, labelName)
  return { labels: usedLabels([node], labels), projects: [], tasks: [node] }
}

/** Every task of a tree, subtasks included. */
export function countTasks(tree: TemplateTree): number {
  const count = (ts: TTask[]): number => ts.reduce((n, item) => n + 1 + count(item.subtasks), 0)
  return count(tree.tasks ?? []) + tree.projects.reduce((n, p) => n + count(allTasks(p)), 0)
}

// ---- dates (design D3) ----

/** Days from the reference day to the start day (0 when either is missing). */
export function shiftDays(referenceDay: string | null | undefined, startDay: string | null | undefined): number {
  return referenceDay && startDay ? daysBetweenISO(referenceDay, startDay) : 0
}

/** A due moved by whole days, its time and zone kept. */
export function shiftDue(due: Due | null, days: number): Due | null {
  if (!due || !days) return due
  return { ...due, date: addDaysISO(due.date, days) }
}

function shiftDate(date: string | null | undefined, days: number): string | null {
  if (!date) return null
  if (date === 'someday' || !days) return date
  return addDaysISO(date, days)
}

/** The earliest due date in the tree, for a source that declares no day. */
export function earliestDue(tree: TemplateTree): string | null {
  let min: string | null = null
  const walk = (ts: TTask[]) => ts.forEach((item) => { if (item.due && (!min || item.due.date < min)) min = item.due.date; walk(item.subtasks) })
  walk(tree.tasks ?? [])
  tree.projects.forEach((p) => walk(allTasks(p)))
  return min
}

/** The reference day: the declared day, else the earliest due date. */
export function referenceDay(tree: TemplateTree): string | null {
  return tree.day ?? earliestDue(tree)
}

// ---- planning (design D2) ----

export interface PlanOptions {
  /** Parent project of the copied top-level project (projects), or the target task's project (task trees). */
  parentId?: string | null
  startDay?: string | null
  /** For task trees: where the copy goes. */
  projectId?: string | null
  sectionId?: string | null
  parentTaskId?: string | null
  /** The live labels to match by name. */
  labels: Label[]
  /** Projects already present, to place the copy last among its siblings. */
  projects?: Project[]
  /** Overrides the top-level project's name. */
  name?: string
}

export interface Plan {
  changes: Change[]
  projectIds: string[]
  taskIds: string[]
  /** Top-level task ids of a task tree, in order. */
  rootTaskIds: string[]
}

const PALETTE = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899']

/**
 * One batch for a tree: fresh ids, positions in tree order, labels matched by
 * name ignoring case or created in the batch, dates shifted, no assignee.
 * Refuses more than MAX_TEMPLATE_TASKS tasks before planning anything.
 */
export function planTree(tree: TemplateTree, opts: PlanOptions): Plan {
  const total = countTasks(tree)
  if (total > MAX_TEMPLATE_TASKS) throw new TemplateTooLargeError(total)
  const days = shiftDays(referenceDay(tree), opts.startDay)
  const now = Date.now()
  const changes: Change[] = []
  const plan: Plan = { changes, projectIds: [], taskIds: [], rootTaskIds: [] }
  let seq = 0
  const nextPos = () => ++seq

  // Labels by name, ignoring case; missing ones are created in the batch.
  const byName = new Map<string, string>()
  for (const l of opts.labels) if (!l.deleted_at && !byName.has(l.name.toLowerCase())) byName.set(l.name.toLowerCase(), l.id)
  const declared = new Map(tree.labels.map((l) => [l.name.toLowerCase(), l]))
  let created = 0
  const labelId = (name: string): string => {
    const key = name.toLowerCase()
    const hit = byName.get(key)
    if (hit) return hit
    const id = crypto.randomUUID()
    byName.set(key, id)
    const color = declared.get(key)?.color ?? PALETTE[created++ % PALETTE.length]
    changes.push({ entity: 'label', entityId: id, patch: { name, color, position: now + created, created_at: now, deleted_at: null } })
    return id
  }

  // Every label the source declares exists once afterwards, used or not (a
  // method set-up template brings its contexts).
  for (const l of tree.labels) if (l.name.trim()) labelId(l.name)

  const keyToId = new Map<string, string>()
  const pending: { id: string; blockers: string[] }[] = []
  const addTask = (item: TTask, place: { project_id: string | null; section_id: string | null; parent_id: string | null }, position: number) => {
    const id = crypto.randomUUID()
    if (item.key) keyToId.set(item.key, id)
    plan.taskIds.push(id)
    const patch: Record<string, unknown> = {
      title: item.title, description: item.description ?? '', project_id: place.project_id, parent_id: place.parent_id, priority: item.priority || 4,
      due: shiftDue(item.due, days), labels: [...new Set(item.labels.map(labelId))], position, created_at: now, completed_at: null, deleted_at: null,
      estimate_minutes: item.estimate_minutes ?? null,
    }
    // Optional fields only when set, like createTask, so plain tasks keep their op footprint.
    if (place.section_id) patch.section_id = place.section_id
    if (item.recurrence) patch.recurrence = item.recurrence
    if (item.deadline) patch.deadline = shiftDate(item.deadline, days)
    if (item.start) patch.start = shiftDate(item.start, days)
    if (item.evening) patch.evening = true
    if (item.notes_doc) patch.notes_doc = item.notes_doc
    changes.push({ entity: 'task', entityId: id, patch })
    if (item.blocked_by?.length) pending.push({ id, blockers: item.blocked_by })
    item.subtasks.forEach((s) => addTask(s, { ...place, parent_id: id }, nextPos()))
    return id
  }

  const addProject = (p: TProject, parentId: string | null, position: number, name?: string) => {
    const id = crypto.randomUUID()
    plan.projectIds.push(id)
    changes.push({ entity: 'project', entityId: id, patch: { name: name ?? p.name, color: p.color, position, archived: false, parent_id: parentId, created_at: now, deleted_at: null } })
    p.tasks.forEach((entry) => addTask(entry, { project_id: id, section_id: null, parent_id: null }, nextPos()))
    for (const s of p.sections) {
      const sid = crypto.randomUUID()
      changes.push({ entity: 'section', entityId: sid, patch: { name: s.name, project_id: id, position: nextPos(), created_at: now, deleted_at: null } })
      s.tasks.forEach((x1) => addTask(x1, { project_id: id, section_id: sid, parent_id: null }, nextPos()))
    }
    p.children.forEach((c) => addProject(c, id, nextPos()))
  }

  if (tree.projects.length) {
    // The top-level copies go last among their new siblings, like createProject.
    const siblings = (opts.projects ?? []).filter((x) => !x.deleted_at && (x.parent_id ?? null) === (opts.parentId ?? null))
    const last = siblings.reduce((m, x) => Math.max(m, x.position), 0)
    tree.projects.forEach((p, i) => addProject(p, opts.parentId ?? null, Math.max(last + 1 + i, now + i), i === 0 ? opts.name : undefined))
  }
  for (const tVar of tree.tasks ?? []) {
    plan.rootTaskIds.push(addTask(tVar, { project_id: opts.projectId ?? null, section_id: opts.sectionId ?? null, parent_id: opts.parentTaskId ?? null }, nextPos()))
  }
  // Blockers inside the copied tree point at the copies; others are left out.
  for (const { id, blockers } of pending) {
    const mapped = blockers.map((b) => keyToId.get(b)).filter((x): x is string => !!x)
    if (mapped.length) changes.push({ entity: 'task', entityId: id, patch: { blocked_by: mapped } })
  }
  return plan
}

// ---- template files (design D1, D5) ----

interface FileRow { id: string; [field: string]: unknown }

export interface TemplateFile {
  format: 'opentodo-export'
  version: 1
  exportedAt: string
  template?: { day: string }
  labels: FileRow[]
  projects: FileRow[]
  sections: FileRow[]
  tasks: FileRow[]
  reminders: FileRow[]
  views: FileRow[]
}

/** What a tree holds, for the dialogs. */
export function summarise(tree: TemplateTree): { projects: number; sections: number; tasks: number; labels: number; dated: number; recurring: number } {
  let projects = 0
  let sections = 0
  let dated = 0
  let recurring = 0
  const walkTasks = (ts: TTask[]) => ts.forEach((item) => { if (item.due) dated++; if (item.recurrence) recurring++; walkTasks(item.subtasks) })
  const walk = (p: TProject) => { projects++; sections += p.sections.length; walkTasks(allTasks({ ...p, children: [] })); p.children.forEach(walk) }
  tree.projects.forEach(walk)
  walkTasks(tree.tasks ?? [])
  return { projects, sections, tasks: countTasks(tree), labels: tree.labels.length, dated, recurring }
}

/** Read a template file (an own export, with or without `template`). */
export function treeFromFile(doc: unknown): TemplateTree {
  const d = doc as Partial<TemplateFile> | null
  if (!d || typeof d !== 'object' || d.format !== 'opentodo-export' || typeof d.version !== 'number' || d.version < 1) {
    throw new TemplateFileError('This is not an OpenTodo template.')
  }
  const rows = (k: keyof TemplateFile) => (Array.isArray(d[k]) ? (d[k] as FileRow[]) : [])
  const live = (r: FileRow) => !r.deleted_at
  const projects = rows('projects').filter(live)
  const sections = rows('sections').filter(live)
  const tasks = rows('tasks').filter((item) => live(item) && !item.completed_at && !item.series_id)
  const labels = rows('labels').filter(live)
  const projectIds = new Set(projects.map((p) => p.id))
  const sectionIds = new Set(sections.map((s) => s.id))
  for (const entry of tasks) {
    if (entry.project_id && !projectIds.has(String(entry.project_id))) throw new TemplateFileError(`A task names a project that is not in the file (${String(entry.title ?? entry.id)}).`)
    if (entry.section_id && !sectionIds.has(String(entry.section_id))) throw new TemplateFileError(`A task names a section that is not in the file (${String(entry.title ?? entry.id)}).`)
  }
  const labelName = new Map(labels.map((l) => [l.id, String(l.name ?? '')]))
  const pos = (r: FileRow) => (typeof r.position === 'number' ? r.position : 0)
  const order = (a: FileRow, b: FileRow) => pos(a) - pos(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  const node = (x1: FileRow): TTask => {
    const n: TTask = {
      key: x1.id, title: String(x1.title ?? ''), description: typeof x1.description === 'string' ? x1.description : '',
      priority: typeof x1.priority === 'number' ? x1.priority : 4, due: (x1.due as Due | null) ?? null,
      deadline: typeof x1.deadline === 'string' ? x1.deadline : null, start: typeof x1.start === 'string' ? x1.start : null, evening: x1.evening === true,
      labels: (Array.isArray(x1.labels) ? x1.labels : []).map((id) => labelName.get(String(id))).filter((x): x is string => !!x),
      estimate_minutes: typeof x1.estimate_minutes === 'number' ? x1.estimate_minutes : null,
      recurrence: typeof x1.recurrence === 'string' ? x1.recurrence : null,
      blocked_by: Array.isArray(x1.blocked_by) && x1.blocked_by.length ? x1.blocked_by.map(String) : undefined,
      subtasks: tasks.filter((s) => s.parent_id === x1.id).sort(order).map(node),
    }
    if (typeof x1.notes_doc === 'string' && x1.notes_doc) n.notes_doc = x1.notes_doc
    return n
  }
  const taskIds = new Set(tasks.map((tVar) => tVar.id))
  const top = tasks.filter((tVar) => !tVar.parent_id || !taskIds.has(String(tVar.parent_id)))
  const projectNode = (p: FileRow): TProject => {
    const mine = top.filter((tVar) => tVar.project_id === p.id).sort(order)
    const secs = sections.filter((s) => s.project_id === p.id).sort(order)
    return {
      name: String(p.name ?? ''), color: typeof p.color === 'string' ? p.color : PALETTE[0],
      sections: secs.map((s) => ({ name: String(s.name ?? ''), tasks: mine.filter((tVar) => tVar.section_id === s.id).map(node) })),
      tasks: mine.filter((tVar) => !tVar.section_id).map(node),
      children: projects.filter((c) => c.parent_id === p.id).sort(order).map(projectNode),
    }
  }
  const roots = projects.filter((p) => !p.parent_id || !projectIds.has(String(p.parent_id))).sort(order)
  const tree: TemplateTree = {
    labels: labels.map((l) => ({ name: String(l.name ?? ''), color: typeof l.color === 'string' ? l.color : undefined })),
    projects: roots.map(projectNode),
  }
  const inbox = top.filter((tVar) => !tVar.project_id).sort(order).map(node)
  if (inbox.length) tree.tasks = inbox
  const day = typeof d.template?.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.template.day) ? d.template.day
    : typeof d.exportedAt === 'string' && !Number.isNaN(Date.parse(d.exportedAt)) ? new Date(d.exportedAt).toISOString().slice(0, 10) : undefined
  if (day) tree.day = day
  return tree
}

/**
 * Write a tree as a template file: name-based ids inside the file, so the same
 * project saved twice gives the same file; only the labels its tasks use; dates
 * as they are, with `template.day` naming the reference day.
 */
export function fileFromTree(tree: TemplateTree, opts: { day: string; exportedAt?: string }): TemplateFile {
  const file: TemplateFile = {
    format: 'opentodo-export', version: 1, exportedAt: opts.exportedAt ?? new Date().toISOString(), template: { day: opts.day },
    labels: [], projects: [], sections: [], tasks: [], reminders: [], views: [],
  }
  const labelIds = new Map<string, string>()
  for (const l of tree.labels) {
    const id = nameId('template-label', l.name.toLowerCase())
    labelIds.set(l.name.toLowerCase(), id)
    file.labels.push({ id, name: l.name, color: l.color ?? PALETTE[file.labels.length % PALETTE.length], position: file.labels.length + 1, created_at: 0, deleted_at: null })
  }
  const keyToFileId = new Map<string, string>()
  const blocked: { row: FileRow; keys: string[] }[] = []
  const writeTask = (item: TTask, path: string, place: { project_id: string | null; section_id: string | null; parent_id: string | null }, position: number) => {
    const id = nameId('template-task', path)
    if (item.key) keyToFileId.set(item.key, id)
    const row: FileRow = {
      id, title: item.title, description: item.description, priority: item.priority, due: item.due, labels: item.labels.map((n) => labelIds.get(n.toLowerCase())).filter(Boolean),
      position, created_at: 0, completed_at: null, deleted_at: null, project_id: place.project_id, section_id: place.section_id, parent_id: place.parent_id,
      estimate_minutes: item.estimate_minutes, recurrence: item.recurrence,
    }
    if (item.deadline) row.deadline = item.deadline
    if (item.start) row.start = item.start
    if (item.evening) row.evening = true
    if (item.notes_doc) row.notes_doc = item.notes_doc
    file.tasks.push(row)
    if (item.blocked_by?.length) blocked.push({ row, keys: item.blocked_by })
    item.subtasks.forEach((s, i) => writeTask(s, `${path}/${i}:${s.title}`, { ...place, parent_id: id }, i + 1))
  }
  const writeProject = (p: TProject, path: string, parentId: string | null, position: number) => {
    const id = nameId('template-project', path)
    file.projects.push({ id, name: p.name, color: p.color, position, archived: false, parent_id: parentId, created_at: 0, deleted_at: null })
    p.tasks.forEach((entry, i) => writeTask(entry, `${path}/t${i}:${entry.title}`, { project_id: id, section_id: null, parent_id: null }, i + 1))
    p.sections.forEach((s, si) => {
      const sid = nameId('template-section', `${path}/s${si}:${s.name}`)
      file.sections.push({ id: sid, name: s.name, project_id: id, position: si + 1, created_at: 0, deleted_at: null })
      s.tasks.forEach((x1, i) => writeTask(x1, `${path}/s${si}/t${i}:${x1.title}`, { project_id: id, section_id: sid, parent_id: null }, i + 1))
    })
    p.children.forEach((c, i) => writeProject(c, `${path}/p${i}:${c.name}`, id, i + 1))
  }
  tree.projects.forEach((p, i) => writeProject(p, `p${i}:${p.name}`, null, i + 1))
  ;(tree.tasks ?? []).forEach((tVar, i) => writeTask(tVar, `inbox/t${i}:${tVar.title}`, { project_id: null, section_id: null, parent_id: null }, i + 1))
  for (const { row, keys } of blocked) {
    const ids = keys.map((k) => keyToFileId.get(k)).filter(Boolean)
    if (ids.length) row.blocked_by = ids
  }
  return file
}

/** `opentodo-template-trip-to-rome.json` */
export function templateFileName(name: string): string {
  const slug = name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
  return `opentodo-template-${slug || 'project'}.json`
}

/** Offer a file as a download from a Blob URL (no server round trip). */
export function downloadJSON(data: unknown, name: string): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/** The local date used as `template.day` when saving. */
export function today(): string {
  return todayISO()
}

// ---- duplicate (design D2, D6) ----

/**
 * Copy a project tree into a new, unshared project (a viewer may duplicate:
 * the source is only read). Returns the new project's id.
 */
export async function duplicateProject(id: string, opts: { name?: string; parentId?: string | null; startDay?: string | null } = {}): Promise<string> {
  const tree = await treeFromProject(id)
  const projects = await db.projects.toArray()
  const plan = planTree(tree, { labels: await db.labels.toArray(), projects, parentId: opts.parentId ?? null, startDay: opts.startDay ?? null, name: opts.name?.trim() || undefined })
  await mutateMany(plan.changes)
  return plan.projectIds[0]
}

/**
 * Copy a task and its open subtasks directly after the original, in the same
 * project, section and parent. Returns the copy's id.
 */
export async function duplicateTask(id: string, opts: { startDay?: string | null } = {}): Promise<string> {
  const source = await db.tasks.get(id)
  if (!source || source.deleted_at) throw new Error('Task not found')
  const tree = await treeFromTask(id)
  const plan = planTree(tree, {
    labels: await db.labels.toArray(), startDay: opts.startDay ?? null,
    projectId: source.project_id ?? null, sectionId: source.section_id ?? null, parentTaskId: source.parent_id ?? null,
  })
  const copyId = plan.rootTaskIds[0]
  // Right after the original among its siblings, in the same batch.
  const siblings = (await db.tasks.toArray()).filter((task) => !task.deleted_at && (task.project_id ?? null) === (source.project_id ?? null)
    && (task.parent_id ?? null) === (source.parent_id ?? null))
  const moves = planMove([...siblings, { id: copyId, position: Number.MAX_SAFE_INTEGER }], copyId, { after: id }, { fallback: source.position + 1 }) ?? []
  for (const m of moves) {
    const copy = plan.changes.find((c) => c.entity === 'task' && c.entityId === m.id)
    if (copy) copy.patch.position = m.position
    else plan.changes.push({ entity: 'task', entityId: m.id, patch: { position: m.position } })
  }
  await mutateMany(plan.changes)
  return copyId
}
