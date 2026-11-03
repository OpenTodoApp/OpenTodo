// The command bar's search index prepared before the bar first opens (OpenSpec change
// list-rendering-at-scale, design D6). Folding the text of 10,000 tasks and preparing
// 2,000 notes took most of the first keystroke on a phone when it waited for that
// keystroke (or for the idle moments of the second the bar is open). Shell mounts
// this once the page has been left alone for a while: it takes one reading of the
// rows, makes and folds the bar's entries a few milliseconds at a time while the page
// is idle, prepares the notes the same way, and asks to be taken down. Nothing is
// drawn, and nothing is computed in a render. Later writes change a few tasks; the
// bar prepares those when it opens.
import { useEffect, useRef } from 'react'
import { useTasksOfEveryWorkspace } from '../../lib/liveTasks'
import { useLabels, useProjects, useProjectsOfEveryWorkspace, useWorkspaceState } from '../../lib/localData'
import { useNoteRowsLoaded } from '../../lib/noteRows'
import type { Label, Note, Project, Task, User, View } from '../../lib/types'
import type { WorkspaceState } from '../../lib/workspaces'
import { useToday, useViews } from '../useViews'
import { buildEntries, makeTaskEntry } from './index'
import { paletteNoteEntries, sharedNoteIndex } from './notesSection'
import { elsewhereOf, prepareEntry } from './usePaletteEntities'

/** Work in one idle moment, in ms: a key pressed meanwhile waits at most about this long. */
const SLICE_MS = 4

const idle = (fn: (deadline?: IdleDeadline) => void): (() => void) => {
  if (typeof requestIdleCallback === 'function') {
    const h = requestIdleCallback(fn)
    return () => cancelIdleCallback(h)
  }
  const h = setTimeout(fn, 50)
  return () => clearTimeout(h)
}

/** Runs `step` in idle moments, a slice at a time, until it returns false; then `done`. */
function inIdleSlices(step: () => boolean, done: () => void): () => void {
  let cancel = () => {}
  let stopped = false
  const run = (deadline?: IdleDeadline) => {
    const end = performance.now() + SLICE_MS
    let more = true
    while (more && !stopped && performance.now() < end && (!deadline || deadline.timeRemaining() > 1)) more = step()
    if (stopped) return
    if (more) cancel = idle(run)
    else done()
  }
  cancel = idle(run)
  return () => { stopped = true; cancel() }
}

interface Reading {
  user: User | null; today: string; tasks: readonly Task[]; projects: readonly Project[]; everyProject: readonly Project[]
  labels: Label[]; views: View[]; notes: readonly Note[]; state: WorkspaceState
}

/** The steps of the warm-up over one reading: the tasks a slice at a time, the other entries, then the notes. */
function warmUp(r: Reading, done: () => void): () => void {
  let stop = () => {}
  let live = true
  const projects = r.everyProject.length ? r.everyProject : r.projects
  let entry: ((task: Task) => ReturnType<ReturnType<typeof makeTaskEntry>>) | null = null
  let at = 0
  const tasks = () => {
    entry ??= makeTaskEntry(projects, r.today, elsewhereOf(r.state, r.everyProject, r.tasks))
    for (const end = Math.min(at + 50, r.tasks.length); at < end; at++) if (!r.tasks[at].deleted_at) prepareEntry(entry(r.tasks[at]))
    return at < r.tasks.length
  }
  const rest = () => {
    for (const e of buildEntries({ tasks: [], projects: projects as Project[], labels: r.labels, views: r.views, user: r.user, today: r.today, elsewhere: elsewhereOf(r.state, r.everyProject, r.tasks) })) prepareEntry(e)
    void import('../../lib/noteList').then((mod) => {
      if (!live) return
      const index = sharedNoteIndex(mod)
      const list = paletteNoteEntries(mod, r.tasks, r.projects, r.notes)
      stop = inIdleSlices(() => index.warm(list, 5), done)
    })
    return false
  }
  stop = inIdleSlices(tasks, () => { stop = inIdleSlices(rest, () => {}) })
  return () => { live = false; stop() }
}

export default function PaletteWarmer({ user, onDone }: { user: User | null; onDone: () => void }) {
  const today = useToday()
  const tasks = useTasksOfEveryWorkspace()
  const projects = useProjects()
  const everyProject = useProjectsOfEveryWorkspace()
  const labels = useLabels()
  const views = useViews()
  const notes = useNoteRowsLoaded()
  const state = useWorkspaceState()
  // The first complete reading only: what changes afterwards the bar prepares itself.
  const first = useRef<Reading | null>(null)
  if (!first.current && tasks && notes) first.current = { user, today, tasks, projects, everyProject, labels, views, notes, state }
  const reading = first.current
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => (reading ? warmUp(reading, () => done.current()) : undefined), [reading])
  return null
}

