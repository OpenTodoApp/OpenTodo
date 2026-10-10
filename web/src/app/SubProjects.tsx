import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db } from '../lib/db'
import { buildProjectTree, subtreeOpenCounts } from '../lib/projects'
import type { Project, Task } from '../lib/types'
import { navigate } from './router'

/**
 * "Sub-projects" section at the bottom of a project view: each direct, non-archived
 * sub-project with the open-task total of its whole subtree. Derived from local
 * data, so it is live and correct offline. Renders nothing for a leaf project.
 */
export function SubProjects({ projectId }: { projectId: string }) {
  const projects = useLiveQuery(() => db.projects.filter((p) => !p.deleted_at).toArray(), [], [] as Project[])
  const open = useLiveQuery(() => db.tasks.filter((t) => !t.deleted_at && !t.completed_at).toArray(), [], [] as Task[])
  const tree = useMemo(() => buildProjectTree(projects), [projects])
  const children = tree.nodes.get(projectId)?.children ?? []
  const counts = useMemo(() => subtreeOpenCounts(open, tree), [open, tree])
  if (children.length === 0) return null
  return (
    <section className="mt-6 border-t border-slate-200 pt-3 dark:border-slate-800" aria-label="Sub-projects">
      <h2 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Sub-projects</h2>
      <ul>
        {children.map((n) => (
          <li key={n.id}>
            <button type="button" onClick={() => navigate({ view: 'project', id: n.id })}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-900">
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: n.item.color }} />
              <span className="flex-1 truncate">{n.item.name}</span>
              <span className="text-xs text-slate-400" title="Open tasks including sub-projects">{counts.get(n.id) ?? 0}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
