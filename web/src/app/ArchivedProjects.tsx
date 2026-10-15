// Settings → Data → Archived projects (OpenSpec `unarchive-projects`): every
// archived project with a Restore button. Restore is one op through `mutate()`
// (archive.ts), so it applies at once offline and converges like any edit.
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useRef } from 'react'
import { archivedProjects, unarchiveProject, type ArchivedProject } from '../lib/archive'
import { db } from '../lib/db'
import { Button } from '../ui'
import { EmptyState } from '../ui'
import { ListRow } from '../ui'

export function ArchivedProjectsSection() {
  const projects = useLiveQuery(() => db.projects.toArray(), [], [])
  const ids = useMemo(() => projects.filter((p) => p.archived && !p.deleted_at).map((p) => p.id), [projects])
  // Open counts need only the archived projects' tasks.
  const tasks = useLiveQuery(() => (ids.length ? db.tasks.where('project_id').anyOf(ids).toArray() : []), [ids.join()], [])
  const memberships = useLiveQuery(() => db.memberships.toArray(), [], [])
  const rows = useMemo(() => archivedProjects(projects, tasks, new Map(memberships.map((m) => [m.projectId, m]))), [projects, tasks, memberships])
  const listRef = useRef<HTMLUListElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  async function restore(id: string, index: number) {
    await unarchiveProject(id)
    // Keep the keyboard user's place: the next row's button, else the previous one, else the heading.
    requestAnimationFrame(() => {
      const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('button[data-restore]:not([disabled])')
      const next = buttons?.[Math.min(index, (buttons?.length ?? 1) - 1)]
      if (next) next.focus()
      else headingRef.current?.focus()
    })
  }

  return <ArchivedProjectsList rows={rows} onRestore={(id, i) => void restore(id, i)} listRef={listRef} headingRef={headingRef} />
}

export interface ArchivedProjectsListProps {
  rows: ArchivedProject[]
  onRestore: (id: string, index: number) => void
  listRef?: React.Ref<HTMLUListElement>
  headingRef?: React.Ref<HTMLHeadingElement>
}

/** The list itself, without data access, so it can be rendered in tests. */
export function ArchivedProjectsList({ rows, onRestore, listRef, headingRef }: ArchivedProjectsListProps) {
  return (
    <div className="space-y-2" data-testid="archived-projects">
      <h3 id="archived-projects" ref={headingRef} tabIndex={-1} className="text-body font-medium text-default outline-none">Archived projects</h3>
      {rows.length === 0 ? (
        <EmptyState icon="folder" title="No archived projects" body="Archive one from its Project menu; it comes back here with one click." />
      ) : (
        <ul ref={listRef} className="-mx-3">
          {rows.map((r, i) => (
            <li key={r.project.id}>
              <ListRow
                leading={<span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.project.color }} />}
                label={r.project.name}
                meta={<>{r.parentName ? `In ${r.parentName} · ` : ''}{r.open === 1 ? '1 open task' : `${r.open} open tasks`}{!r.canRestore && ' · Only the owner or an admin can restore it'}</>}
                menu={(
                  <Button size="sm" icon="rotate-ccw" data-restore aria-label={`Restore ${r.project.name}`} disabled={!r.canRestore} onClick={() => onRestore(r.project.id, i)}>Restore</Button>
                )}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
