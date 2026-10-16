import { useEffect, useState, useSyncExternalStore } from 'react'
import { projectFinishedBy, runAutoArchive, undoAutoArchive } from '../lib/archive'
import { archiveProject } from '../lib/ops'
import type { Project } from '../lib/types'
import { useShortcutScope } from './shortcuts'
import { Kbd } from './shortcuts/Kbd'
import { t } from '../lib/i18n'

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
    const item = setInterval(run, CHECK_MS)
    return () => {
      alive = false
      clearInterval(item)
    }
  }, [])

  if (!project && archived.length === 0) return null
  return (
    <div className="fixed left-1/2 z-40 w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 space-y-2"
      style={{ bottom: 'calc(var(--vv-bottom, 0px) + max(1rem, env(safe-area-inset-bottom)))' }}>
      {project && (
        <div role="alert" className="flex items-center gap-2 rounded-control border border-accent/40 bg-surface px-3 py-2 text-body shadow-2">
          <span className="user-text min-w-0 flex-1">{t.rich('Archive <strong>{name}</strong>? {kbd}', { name: project.name, kbd: <Kbd k="Enter" only />, strong: (chunks) => <strong>{chunks}</strong> })}</span>
          <button className="ui-btn ui-btn--primary ui-btn--sm px-2 py-0.5 text-meta" onClick={() => { setOffered(null); void archiveProject(project.id) }}>{t('Archive')}</button>
          <button className="ui-btn ui-btn--ghost ui-btn--sm px-2 py-0.5 text-meta" onClick={() => setOffered(null)}>{t('Not now')}</button>
        </div>
      )}
      {archived.length > 0 && (
        <div role="status" className="flex items-center gap-2 rounded-control border border-default bg-surface px-3 py-2 text-body shadow-2">
          <span className="flex-1">{t('Archived {join}: no open tasks for 30 days.', { join: archived.map((p) => p.name).join(', ') })}</span>
          <button className="ui-btn ui-btn--ghost ui-btn--sm px-2 py-0.5 text-meta" onClick={() => { const list = archived; setArchived([]); for (const p of list) void undoAutoArchive(p.id) }}>{t('Undo')}</button>
          <button className="ui-btn ui-btn--ghost ui-btn--sm px-2 py-0.5 text-meta" onClick={() => setArchived([])}>{t('Dismiss')}</button>
        </div>
      )}
    </div>
  )
}
