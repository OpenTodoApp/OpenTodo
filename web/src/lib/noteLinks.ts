// Links between notes, tasks and projects on the device (OpenSpec change
// note-links, design D2, D4, D5): what a link's target is and how it reads now
// (resolution, local data only), and the link index behind Linked references.
// Loaded lazily with the editor and the Linked references section; nothing here
// is in the first load.
//
// The index reads the decrypted projections the device already holds (never the
// documents): for every source (a task note, a project note or a standalone note,
// keyed `<kind>:<id>`, pending appends included) its targets, and the reverse map.
// It is built in 8 ms slices on first use, follows the task rows a write changed
// (the shared snapshot keeps every other row object, so walking the two id-sorted
// lists compares references only) and the project and note rows whose text
// changed, rebuilds in slices when it cannot follow, and is dropped when the
// account locks.
import { useEffect, useSyncExternalStore } from 'react'
import { db } from './db'
import { encryptionSnapshot, onEncryptionChange } from './e2ee'
import { t } from './i18n'
import { liveSnapshot } from './liveSnapshot'
import { resettable } from './moduleState'
import { everyTask, taskIndexOf } from './liveTasks'
import { linksIn, type LinkKind, type NoteLink } from './noteLinkGrammar'
import { noteText, updatedOf } from './noteList'
import { stripMarkdown } from './noteSearch'
import type { Note, Project, Task } from './types'

export { linksIn, type LinkKind, type NoteLink }

/** An address of this app that names an item: `?note=<id>`, `?task=<id>` or `?project=<id>`. */
const HREF = /^\?(note|task|project)=([A-Za-z0-9_-]+)$/

/** The target of an internal link address, or null for any other address. */
export function refOf(href: string): { kind: LinkKind; id: string } | null {
  const m = HREF.exec(href)
  return m ? { kind: m[1] as LinkKind, id: m[2] } : null
}

export const hrefOf = (kind: LinkKind, id: string): string => `?${kind}=${id}`

/** What a link target reads as on this device. */
export interface Target {
  kind: LinkKind
  id: string
  title: string
  projectId: string | null
  /** A completed task or an archived project. */
  done: boolean
}

/** The title a note reads as (an empty one as "Untitled note"). */
export const noteTitle = (title: string | undefined): string => title?.trim() || t('Untitled note')

// ---- the rows (every workspace the device holds) ----

const projectRows = liveSnapshot('link projects', () => db.projects.toArray())
const noteRows = liveSnapshot('link notes', () => db.notes.toArray())

export interface World {
  tasks: readonly Task[]
  taskById: ReadonlyMap<string, Task>
  projects: readonly Project[]
  projectById: Map<string, Project>
  notes: readonly Note[]
  noteById: Map<string, Note>
}

let world: World | null = null
let version = 0
const listeners = new Set<() => void>()
let unsubs: (() => void)[] = []

/** The rows as the index and resolution read them; `prev` lends the maps of rows that did not change. */
export function worldOf(tasks: readonly Task[], projects: readonly Project[], notes: readonly Note[], prev?: World | null): World {
  return {
    tasks, taskById: taskIndexOf(tasks),
    projects, projectById: prev?.projects === projects ? prev.projectById : new Map(projects.map((p) => [p.id, p])),
    notes, noteById: prev?.notes === notes ? prev.noteById : new Map(notes.map((n) => [n.id, n])),
  }
}

function read(): World | null {
  const tasks = everyTask.read()
  const projects = projectRows.read()
  const notes = noteRows.read()
  if (!tasks || !projects || !notes) return null
  if (world && world.tasks === tasks && world.projects === projects && world.notes === notes) return world
  world = worldOf(tasks, projects, notes, world)
  return world
}

function changed(): void {
  const w = read()
  if (!w) return
  version++
  index?.follow(w)
  for (const l of listeners) l()
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  if (listeners.size === 1) {
    unsubs = [everyTask.subscribe(changed), projectRows.subscribe(changed), noteRows.subscribe(changed), onEncryptionChange(onLock)]
    changed()
  }
  return () => {
    listeners.delete(fn)
    if (listeners.size === 0) {
      for (const u of unsubs) u()
      unsubs = []
      world = null
    }
  }
}

function onLock(): void {
  const s = encryptionSnapshot()
  if (s.enabled && !s.unlocked) dropIndex()
}

/** Re-renders when anything a link could read changes; the number changes with it. */
export function useLinkVersion(): number {
  return useSyncExternalStore(subscribe, () => version, () => version)
}

/** Subscribes outside React (the editor's node views); returns the unsubscribe. */
export function watchLinks(fn: () => void): () => void {
  return subscribe(fn)
}

const projectGone = (w: World, projectId: string | null | undefined) => !!projectId && !!w.projectById.get(projectId)?.deleted_at

/** The live target of a link, or null when it is missing, in the Trash or out of reach (the same answer, D4). */
export function resolve(kind: LinkKind, id: string): Target | null {
  const w = read()
  return w ? resolveIn(w, kind, id) : null
}

export function resolveIn(w: World, kind: LinkKind, id: string): Target | null {
  if (kind === 'task') {
    const task = w.taskById.get(id)
    return task ? { kind, id, title: task.title, projectId: task.project_id, done: !!task.completed_at } : null
  }
  if (kind === 'project') {
    const p = w.projectById.get(id)
    return p && !p.deleted_at ? { kind, id, title: p.name, projectId: p.id, done: !!p.archived } : null
  }
  const n = w.noteById.get(id)
  return n && !n.deleted_at && !projectGone(w, n.project_id) ? { kind, id, title: noteTitle(n.title), projectId: n.project_id, done: false } : null
}

/** The current title of an internal address, or null (not internal, or unreachable). */
export function titleOf(href: string): string | null {
  const r = refOf(href)
  return r ? resolve(r.kind, r.id)?.title ?? null : null
}

/** A project's name, for secondary lines (null when unknown). */
export function projectName(id: string | null | undefined): string | null {
  if (!id) return null
  const p = read()?.projectById.get(id)
  return p && !p.deleted_at ? p.name : null
}

/** The rows the index and the picker read (null until loaded). */
export function linkRows(): Pick<World, 'tasks' | 'projects' | 'notes'> | null {
  return read()
}

// ---- the index ----

interface Source {
  key: string
  kind: LinkKind
  id: string
  row: Task | Project | Note
  text: string
  targets: Set<string>
}

/** One row of Linked references. */
export interface Reference {
  kind: LinkKind
  id: string
  title: string
  projectId: string | null
  updated: number
  /** The text around the first link to the item: before it, the link's text, after it. */
  snippet: { before: string; link: string; after: string }
}

const NOTE_FIELDS = ['notes_doc', 'description']
const STANDALONE_FIELDS = ['title', 'notes_doc', 'description', 'labels', 'project_id']
/** One slice of building the index (ms), as the Notes search warms. */
export const SLICE_MS = 8

/** A change cut too long to follow row by row: build again instead. */
const MAX_CHANGES = 1_000

/**
 * The rows that differ between two lists sorted by id (the shared task snapshot's
 * order): each id once, with its version before and after; null when the lists are
 * not in that order or more than MAX_CHANGES rows changed.
 */
export function changedRows(prev: readonly Task[], next: readonly Task[]): { id: string; before?: Task; after?: Task }[] | null {
  const out: { id: string; before?: Task; after?: Task }[] = []
  let i = 0
  let j = 0
  while (i < prev.length || j < next.length) {
    const a = prev[i]
    const b = next[j]
    if (a === b) { i++; j++; continue }
    if ((i > 0 && a && prev[i - 1].id >= a.id) || (j > 0 && b && next[j - 1].id >= b.id)) return null
    if (a && b && a.id === b.id) { out.push({ id: a.id, before: a, after: b }); i++; j++ }
    else if (b && (!a || b.id < a.id)) { out.push({ id: b.id, after: b }); j++ }
    else { out.push({ id: a.id, before: a }); i++ }
    if (out.length > MAX_CHANGES) return null
  }
  return out
}

/** Whether a task's note is the same in two versions of its row. */
const sameNote = (a: Task, b: Task) => a.description === b.description && a.appends === b.appends

export class LinkIndex {
  private sources = new Map<string, Source>()
  private reverse = new Map<string, Set<string>>()
  private built: World | null = null
  private building: { w: World; queue: (() => void)[]; at: number } | null = null
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly onReady: () => void = () => {}) {}

  get ready(): boolean {
    return this.built !== null
  }

  /** Builds the whole index at once (tests, and a world small enough not to slice). */
  buildNow(w: World): void {
    this.reset()
    for (const step of this.steps(w)) step()
    this.built = w
  }

  /** Builds in slices of SLICE_MS; calls onReady when done. */
  build(w: World): void {
    if (this.building?.w === w || this.built === w) return
    if (this.timer) clearTimeout(this.timer)
    this.building = { w, queue: this.steps(w), at: 0 }
    const fresh = { sources: new Map<string, Source>(), reverse: new Map<string, Set<string>>() }
    const run = () => {
      const b = this.building
      if (!b) return
      const until = performance.now() + SLICE_MS
      const keep = { sources: this.sources, reverse: this.reverse }
      this.sources = fresh.sources
      this.reverse = fresh.reverse
      while (b.at < b.queue.length && performance.now() < until) b.queue[b.at++]()
      this.sources = keep.sources
      this.reverse = keep.reverse
      if (b.at < b.queue.length) {
        this.timer = setTimeout(run, 0)
        return
      }
      this.timer = null
      this.building = null
      this.sources = fresh.sources
      this.reverse = fresh.reverse
      this.built = b.w
      // The world may have moved on while building: catch up.
      const now = read()
      if (now && now !== b.w) this.follow(now)
      this.onReady()
    }
    this.timer = setTimeout(run, 0)
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.building = null
    this.reset()
  }

  private reset(): void {
    this.sources = new Map()
    this.reverse = new Map()
    this.built = null
  }

  /** The work of a full build, in small steps (a few hundred rows each). */
  private steps(w: World): (() => void)[] {
    const out: (() => void)[] = []
    const chunk = <T>(rows: readonly T[], fn: (row: T) => void) => {
      for (let i = 0; i < rows.length; i += 200) out.push(() => { for (const r of rows.slice(i, i + 200)) fn(r) })
    }
    chunk(w.tasks, (task) => this.put('task', task.id, task))
    chunk(w.projects, (p) => { if (!p.deleted_at) this.put('project', p.id, p) })
    chunk(w.notes, (n) => { if (!n.deleted_at && !projectGone(w, n.project_id)) this.put('note', n.id, n) })
    return out
  }

  private put(kind: LinkKind, id: string, row: Task | Project | Note): void {
    const key = `${kind}:${id}`
    const text = noteText(row)
    const old = this.sources.get(key)
    if (old && old.text === text) {
      old.row = row
      return
    }
    if (old) this.remove(key)
    const links = linksIn(text)
    if (links.length === 0) return
    const targets = new Set(links.map((l) => `${l.kind}:${l.id}`))
    this.sources.set(key, { key, kind, id, row, text, targets })
    for (const tk of targets) {
      let set = this.reverse.get(tk)
      if (!set) this.reverse.set(tk, (set = new Set()))
      set.add(key)
    }
  }

  private remove(key: string): void {
    const s = this.sources.get(key)
    if (!s) return
    this.sources.delete(key)
    for (const tk of s.targets) {
      const set = this.reverse.get(tk)
      set?.delete(key)
      if (set?.size === 0) this.reverse.delete(tk)
    }
  }

  /**
   * Follows a newer world: tasks from the rows the writes changed (or a sliced
   * rebuild when that chain is cut), projects and notes by comparing rows.
   */
  follow(w: World): void {
    const last = this.built
    // A build in progress catches up with the newest rows when it ends.
    if (this.building || !last || last === w) return
    if (last.tasks !== w.tasks) {
      const changes = changedRows(last.tasks, w.tasks)
      if (!changes) {
        this.build(w)
        return
      }
      for (const c of changes) {
        if (c.before && c.after && sameNote(c.before, c.after)) {
          const s = this.sources.get(`task:${c.id}`)
          if (s) s.row = c.after
          continue
        }
        if (c.after) this.put('task', c.id, c.after)
        else this.remove(`task:${c.id}`)
      }
    }
    if (last.projects !== w.projects) {
      for (const p of w.projects) if (p.deleted_at) this.remove(`project:${p.id}`); else this.put('project', p.id, p)
      for (const p of last.projects) if (!w.projectById.has(p.id)) this.remove(`project:${p.id}`)
    }
    if (last.notes !== w.notes || last.projects !== w.projects) {
      for (const n of w.notes) if (n.deleted_at || projectGone(w, n.project_id)) this.remove(`note:${n.id}`); else this.put('note', n.id, n)
      for (const n of last.notes) if (!w.noteById.has(n.id)) this.remove(`note:${n.id}`)
    }
    this.built = w
  }

  /** The source keys linking to a target (tests compare it with a full build). */
  edges(): Map<string, string[]> {
    const out = new Map<string, string[]>()
    for (const [k, set] of this.reverse) out.set(k, [...set].sort())
    return out
  }

  /**
   * Every target some other source links to (`<kind>:<id>`): the Notes page's
   * Unlinked filter keeps the standalone notes not in it (notes-home D5). Kept
   * until the index changes.
   */
  linkedTargets(): ReadonlySet<string> {
    if (this.linked?.built === this.built && this.linked.size === this.reverse.size) return this.linked.set
    const set = new Set<string>()
    for (const [tk, keys] of this.reverse) {
      for (const k of keys) if (k !== tk && this.sources.has(k)) { set.add(tk); break }
    }
    this.linked = { built: this.built, size: this.reverse.size, set }
    return set
  }

  private linked: { built: World | null; size: number; set: Set<string> } | null = null

  /** The items linking to `kind:id` the device can read, most recently changed first. */
  references(kind: LinkKind, id: string): Reference[] {
    const keys = this.reverse.get(`${kind}:${id}`)
    if (!keys) return []
    const self = `${kind}:${id}`
    const title = this.built ? resolveIn(this.built, kind, id)?.title : undefined
    const out: Reference[] = []
    for (const key of keys) {
      if (key === self) continue
      const s = this.sources.get(key)
      if (!s) continue
      const r = s.row as Task & Project & Note
      out.push({
        kind: s.kind, id: s.id,
        title: s.kind === 'project' ? r.name : s.kind === 'note' ? noteTitle(r.title) : r.title,
        projectId: s.kind === 'project' ? null : r.project_id ?? null,
        updated: s.kind === 'note' ? updatedOf(r._clock, STANDALONE_FIELDS) || r.created_at || 0 : updatedOf(r._clock, NOTE_FIELDS),
        snippet: snippetAround(s.text, kind, id, title),
      })
    }
    return out.sort((a, b) => b.updated - a.updated || (a.id < b.id ? -1 : 1))
  }
}

const SNIPPET_BEFORE = 60
const SNIPPET_AFTER = 90

/** The line around the first link to the target: plain text before and after, the link's text between. */
export function snippetAround(text: string, kind: LinkKind, id: string, title?: string): Reference['snippet'] {
  const link = linksIn(text).find((l) => l.kind === kind && l.id === id)
  if (!link) return { before: '', link: title ?? '', after: '' }
  const lineStart = text.lastIndexOf('\n', link.at - 1) + 1
  const nl = text.indexOf('\n', link.end)
  const lineEnd = nl < 0 ? text.length : nl
  const space = (s: string, atEnd: boolean) => (s && /\s/.test(atEnd ? s[s.length - 1] : s[0]) ? ' ' : '')
  const rawBefore = text.slice(lineStart, link.at)
  const rawAfter = text.slice(link.end, lineEnd)
  let before = stripMarkdown(rawBefore)
  let after = stripMarkdown(rawAfter)
  if (before) before += space(rawBefore, true)
  if (after) after = space(rawAfter, false) + after
  if (before.length > SNIPPET_BEFORE) before = `…${before.slice(-SNIPPET_BEFORE).replace(/^\S*\s/, '')}`
  if (after.length > SNIPPET_AFTER) after = `${after.slice(0, SNIPPET_AFTER).replace(/\s\S*$/, '')}…`
  return { before, link: title ?? (link.label || ''), after }
}

let index: LinkIndex | null = null

function dropIndex(): void {
  index?.stop()
  index = null
  version++
  for (const l of listeners) l()
}

/** The shared index, started on first use (D5): null until the rows are loaded. */
function sharedIndex(): LinkIndex | null {
  const w = read()
  if (!w) return null
  if (!index) {
    index = new LinkIndex(() => {
      version++
      for (const l of listeners) l()
    })
    index.build(w)
  }
  return index
}

/**
 * The Linked references of an item, live: null while the index is being built,
 * then the list (empty when nothing links here).
 */
export function useReferences(kind: LinkKind, id: string): Reference[] | null {
  useLinkVersion()
  const idx = sharedIndex()
  // Built from an effect too, so a first render that found nothing loaded still starts it.
  useEffect(() => { sharedIndex() })
  if (!idx?.ready) return null
  return idx.references(kind, id)
}

const noSubscribe = () => () => {}

/**
 * The targets something links to, live (notes-home D5): null while the index is
 * being built or while `enabled` is false, when nothing is read or built.
 */
export function useLinkedTargets(enabled: boolean): ReadonlySet<string> | null {
  useSyncExternalStore(enabled ? subscribe : noSubscribe, () => version, () => version)
  const idx = enabled ? sharedIndex() : null
  useEffect(() => { if (enabled) sharedIndex() }, [enabled])
  if (!idx?.ready) return null
  return idx.linkedTargets()
}

/** Test hook: forget the shared index. */
export function resetLinkIndex(): void {
  index?.stop()
  index = null
}
resettable('noteLinks', resetLinkIndex)
