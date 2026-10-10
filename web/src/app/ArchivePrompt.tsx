import { useEffect, useState, useSyncExternalStore } from 'react'
import { projectFinishedBy, runAutoArchive, undoAutoArchive } from '../lib/archive'
import { archiveProject } from '../lib/ops'
import type { Project } from '../lib/types'

// Automatic archive of finished projects (OpenSpec `trash-and-history`): a one-key
// prompt after the last open task of a project is completed, and a notice with
// undo when the daily pass archived projects idle for 30 days.

let offered: Project | null = null
const listeners = new Set<() => void>()
function setOffered(p: Project | null) {
  offered = p
  listeners.forEach((fn) => fn())
}

/** After completing a task: offer to archive its project when it was the last open task. */
export async function offerArchiveAfterCompletion(taskId: string): Promise<void> {
  const p = await projectFinishedBy(taskId)
  if (p) setOffered(p)
}

const CHECK_MS = 60 * 60 * 1000

export function ArchivePrompt() {
  const project = useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => offered,
    () => null,
  )
  const [archived, setArchived] = useState<Project[]>([])

  // Enter archives; any other key dismisses (and still does its usual job).
  useEffect(() => {
    if (!project) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return
      const p = offered
      setOffered(null)
      if (e.key === 'Enter' && p) {
        e.preventDefault()
        e.stopImmediatePropagation()
        void archiveProject(p.id)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [project])

  // The daily pass (runAutoArchive runs at most once a day per device).
  useEffect(() => {
    let alive = true
    const run = () => void runAutoArchive().then((list) => alive && list.length > 0 && setArchived((prev) => [...prev, ...list]), () => undefined)
    run()
    const t = setInterval(run, CHECK_MS)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  if (!project && archived.length === 0) return null
  return (
    <div className="fixed bottom-4 left-1/2 z-40 w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 space-y-2">
      {project && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm shadow-lg dark:border-emerald-900 dark:bg-slate-900">
          <span className="flex-1">Archive <strong>{project.name}</strong>? <span className="kbd">Enter</span></span>
          <button className="btn-primary px-2 py-0.5 text-xs" onClick={() => { setOffered(null); void archiveProject(project.id) }}>Archive</button>
          <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => setOffered(null)}>Not now</button>
        </div>
      )}
      {archived.length > 0 && (
        <div role="status" className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <span className="flex-1">Archived {archived.map((p) => p.name).join(', ')}: no open tasks for 30 days.</span>
          <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => { const list = archived; setArchived([]); for (const p of list) void undoAutoArchive(p.id) }}>Undo</button>
          <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => setArchived([])}>Dismiss</button>
        </div>
      )}
    </div>
  )
}
