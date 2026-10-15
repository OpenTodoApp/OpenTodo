import { useEffect, useState, useSyncExternalStore } from 'react'
import { projectFinishedBy, runAutoArchive, undoAutoArchive } from '../lib/archive'
import { archiveProject } from '../lib/ops'
import type { Project } from '../lib/types'
import { useShortcutScope } from './shortcuts'
import { Kbd } from './shortcuts/Kbd'

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

  // Enter archives (`list.archive-offer`); any other key dismisses the offer and still does its usual job.
  useShortcutScope('list', {
    'list.archive-offer': () => {
      const p = offered
      setOffered(null)
      if (!p) return false
      void archiveProject(p.id)
    },
  }, { capture: true, enabled: !!project, any: (e) => { if (e.key !== 'Enter') setOffered(null) } })

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
    <div className="fixed left-1/2 z-40 w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 space-y-2"
      style={{ bottom: 'calc(var(--vv-bottom, 0px) + max(1rem, env(safe-area-inset-bottom)))' }}>
      {project && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-accent/40 bg-surface px-3 py-2 text-sm shadow-lg">
          <span className="user-text min-w-0 flex-1">Archive <strong>{project.name}</strong>? <Kbd k="Enter" only /></span>
          <button className="btn-primary px-2 py-0.5 text-xs" onClick={() => { setOffered(null); void archiveProject(project.id) }}>Archive</button>
          <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => setOffered(null)}>Not now</button>
        </div>
      )}
      {archived.length > 0 && (
        <div role="status" className="flex items-center gap-2 rounded-lg border border-default bg-surface px-3 py-2 text-sm shadow-lg">
          <span className="flex-1">Archived {archived.map((p) => p.name).join(', ')}: no open tasks for 30 days.</span>
          <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => { const list = archived; setArchived([]); for (const p of list) void undoAutoArchive(p.id) }}>Undo</button>
          <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => setArchived([])}>Dismiss</button>
        </div>
      )}
    </div>
  )
}
