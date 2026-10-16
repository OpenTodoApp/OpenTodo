import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { db } from '../lib/db'
import { buildProjectTree, subtreeOpenCounts } from '../lib/projects'
import type { Project, Task } from '../lib/types'
import { ListGroupHeader } from '../ui'
import { navigate } from './router'
import { ProjectMark } from './Sidebar'
import { visibleTasks } from '../lib/trash'
import { t } from '../lib/i18n'

const KEY = 'ot.subprojects.collapsed'
function readCollapsed(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]) } catch { return new Set() }
}
function writeCollapsed(set: Set<string>): void {
  try { localStorage.setItem(KEY, JSON.stringify([...set])) } catch { /* device state only */ }
}

/**
 * "Sub-projects" group at the top of a project view (project-organization
 * "Sub-projects inside a project view"): each direct, non-archived sub-project
 * with the open-task total of its whole subtree, under the shared group header,
 * collapsible per device. Derived from local data, so it is live and correct
 * offline. Renders nothing for a leaf project.
 */
export function SubProjects({ projectId }: { projectId: string }) {
  const projects = useLiveQuery(() => db.projects.filter((p) => !p.deleted_at).toArray(), [], [] as Project[])
  const open = useLiveQuery(() => visibleTasks().then((l) => l.filter((task) => !task.completed_at)), [], [] as Task[])
  const tree = useMemo(() => buildProjectTree(projects), [projects])
  const children = tree.nodes.get(projectId)?.children ?? []
  const counts = useMemo(() => subtreeOpenCounts(open, tree), [open, tree])
  const [collapsedSet, setCollapsedSet] = useState(readCollapsed)
  const collapsed = collapsedSet.has(projectId)
  const toggle = () => {
    const next = new Set(collapsedSet)
    if (collapsed) next.delete(projectId)
    else next.add(projectId)
    setCollapsedSet(next)
    writeCollapsed(next)
  }
  if (children.length === 0) return null
  return (
    <section className="mb-3" aria-label={t('Sub-projects')} data-sub-projects>
      <ListGroupHeader title={t('Sub-projects')} count={children.length} collapsed={collapsed} onToggle={toggle} />
      {!collapsed && (
        <ul>
          {children.map((n) => (
            <li key={n.id}>
              <button type="button" onClick={() => navigate({ view: 'project', id: n.id })} data-sub-project={n.id}
                className="flex min-h-9 w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-body hover:bg-sunken dark:hover:bg-raised">
                <span className="flex w-5 shrink-0 items-center justify-center"><ProjectMark project={n.item} /></span>
                <span className="min-w-0 flex-1 truncate">{n.item.name}</span>
                <span className="text-meta tabular-nums text-faint" aria-label={t('Open tasks including sub-projects')}>{counts.get(n.id) ?? 0}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
