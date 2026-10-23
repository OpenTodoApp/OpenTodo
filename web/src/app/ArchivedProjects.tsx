// Archived projects (OpenSpec `unarchive-projects`; on the All projects page since
// `sidebar-favourites`, linked from Settings → Data): every archived project with a Restore button. Restore is one op through `mutate()`
// (archive.ts), so it applies at once offline and converges like any edit.
import { useMemo, useRef } from 'react'
import { archivedProjects, unarchiveProject, type ArchivedProject } from '../lib/archive'
import { useMembershipMap, useProjects, useTaskRowsOfProjects } from '../lib/localData'
import { Button } from '../ui'
import { EmptyState } from '../ui'
import { ListRow } from '../ui'
import { t } from '../lib/i18n'
import { act } from './actionError'

/** `bare`: inside a disclosure that already names the list, so no heading of its own. */
export function ArchivedProjectsSection({ bare = false }: { bare?: boolean } = {}) {
  const projects = useProjects()
  const ids = useMemo(() => projects.filter((p) => p.archived).map((p) => p.id), [projects])
  // Open counts need only the archived projects' tasks.
  const tasks = useTaskRowsOfProjects(ids)
  const memberMap = useMembershipMap()
  const rows = useMemo(() => archivedProjects(projects, tasks, memberMap), [projects, tasks, memberMap])
  const listRef = useRef<HTMLUListElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  async function restore(id: string, index: number) {
    await unarchiveProject(id)
    // Keep the keyboard user's place: the next row's button, else the previous one, else the heading.
    requestAnimationFrame(() => {
      const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('button[data-restore]:not([disabled])')
      const next = buttons?.[Math.min(index, (buttons?.length ?? 1) - 1)]
      if (next) next.focus()
      else (headingRef.current ?? document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]'))?.focus()
    })
  }

  return <ArchivedProjectsList rows={rows} onRestore={(id, i) => act(restore(id, i))} listRef={listRef} headingRef={bare ? undefined : headingRef} bare={bare} />
}

export interface ArchivedProjectsListProps {
  rows: ArchivedProject[]
  onRestore: (id: string, index: number) => void
  listRef?: React.Ref<HTMLUListElement>
  headingRef?: React.Ref<HTMLHeadingElement>
  /** No heading (the disclosure's summary names the list). */
  bare?: boolean
}

/** The list itself, without data access, so it can be rendered in tests. */
export function ArchivedProjectsList({ rows, onRestore, listRef, headingRef, bare = false }: ArchivedProjectsListProps) {
  return (
    <div className="space-y-2" data-testid="archived-projects">
      {!bare && <h3 id="archived-projects" ref={headingRef} tabIndex={-1} className="text-body font-medium text-default outline-none">{t('Archived projects')}</h3>}
      {rows.length === 0 ? (
        <EmptyState icon="folder" title={t('No archived projects')} body={t('Archive one from its Project menu; it comes back here with one click.')} />
      ) : (
        <ul ref={listRef} className="-mx-3">
          {rows.map((r, i) => (
            <li key={r.project.id}>
              <ListRow
                leading={<span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.project.color }} />}
                label={r.project.name}
                meta={[r.parentName ? t('In {name}', { name: r.parentName }) : '', t('{n, plural, one {# open task} other {# open tasks}}', { n: r.open }), r.canRestore ? '' : t('Only the owner or an admin can restore it')].filter(Boolean).join(' · ')}
                menu={(
                  <Button size="sm" icon="rotate-ccw" data-restore aria-label={t('Restore {name}', { name: r.project.name })} disabled={!r.canRestore} onClick={() => onRestore(r.project.id, i)}>{t('Restore')}</Button>
                )}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
