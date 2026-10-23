// All projects (OpenSpec change sidebar-favourites, design D6; projects-table, design
// D1 to D7; project-organization "All projects page"): the whole tree as a table with
// each project's health, progress, open tasks, next due date, people and last change,
// a find field that keeps ancestors, New project and From a template, and the
// archived projects in their own tab. Everything is read from local data, so it works
// offline and follows sync.
import { type KeyboardEvent, useEffect, useMemo, useState } from 'react'
import { useAllTaskRows, useMembershipMap, useProjects, useProjectsLoaded } from '../lib/localData'
import { createProject } from '../lib/ops'
import { compareProjects, firstDirection, summarizeProjects, type ProjectSortKey } from '../lib/projectHealth'
import { buildProjectTree, siblingEdges, visibleProjects, type ProjectNode } from '../lib/projects'
import { canEditProject, roleOf } from '../lib/sharing'
import { matchSidebar } from '../lib/sidebarFind'
import { flattenTree } from '../lib/tree'
import { useMinuteNow } from '../lib/timeEntries'
import { t } from '../lib/i18n'
import { Button, MenuItem, PageBody, PageHeader, Skeleton, Tabs } from '../ui'
import { ArchivedProjectsSection } from './ArchivedProjects'
import { NamePrompt } from './NamePrompt'
import { ProjectsTable, type ProjectsSort } from './ProjectsTable'
import { navigate } from './router'
import { requestTemplateDialog } from './TemplateDialogs'
import { useToday, useViewerZone } from './useViews'

/** Whether the page was opened at its archived projects (`/projects#archived`, Settings → Data). */
function wantsArchived(prop?: boolean): boolean {
  return !!prop || (typeof location !== 'undefined' && location.hash === '#archived')
}

/** The tree with every level's siblings in the chosen column's order (design D4). */
function sortedTree(roots: ProjectNode[], cmp: (a: ProjectNode, b: ProjectNode) => number): ProjectNode[] {
  return roots.map((n) => ({ ...n, children: sortedTree(n.children, cmp) })).sort(cmp)
}

export function ProjectsView({ archived }: { archived?: boolean }) {
  const all = useProjects()
  const loaded = useProjectsLoaded() !== undefined
  const projects = useMemo(() => visibleProjects(all), [all])
  const archivedCount = useMemo(() => all.filter((p) => p.archived && !p.deleted_at).length, [all])
  const tree = useMemo(() => buildProjectTree(projects), [projects])
  const memberMap = useMembershipMap()
  const tasks = useAllTaskRows()
  const today = useToday()
  const zone = useViewerZone()
  const now = useMinuteNow(true)
  // Folding on this page is its own (Collapse all / Expand all); the page opens with the whole tree.
  const [folded, setFolded] = useState<Set<string>>(() => new Set())
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<ProjectsSort | null>(null)
  const [creating, setCreating] = useState(false)
  const [tab, setTab] = useState<'active' | 'archived'>(() => (wantsArchived(archived) ? 'archived' : 'active'))
  useEffect(() => {
    // A link to #archived while the page is open changes only the fragment.
    const reveal = () => { if (wantsArchived(archived)) setTab('archived') }
    reveal()
    window.addEventListener('hashchange', reveal)
    return () => window.removeEventListener('hashchange', reveal)
  }, [archived])

  const everyRow = useMemo(() => flattenTree(tree.roots, () => false), [tree])
  const found = useMemo(() => (query.trim() ? matchSidebar(query, {
    rows: everyRow.map((n) => ({ id: n.id, parent: n.parent, name: n.item.name })), labels: [], views: [],
  }) : null), [query, everyRow])
  // A folded row sums its sub-projects, an expanded one counts its own (project-organization "Open task counts").
  const summaries = useMemo(
    () => summarizeProjects({ projects: all, tasks, today, now, zone, rollUp: (id) => !found && folded.has(id) }),
    [all, tasks, today, now, zone, found, folded],
  )
  const rows = useMemo(() => {
    const roots = sort ? sortedTree(tree.roots, (a, b) => compareProjects(sort.key, sort.dir,
      { name: a.item.name, summary: summaries.get(a.id) }, { name: b.item.name, summary: summaries.get(b.id) }, zone)) : tree.roots
    const shown = flattenTree(roots, (id) => !found && folded.has(id))
    return found ? shown.filter((n) => found.projects.has(n.id)) : shown
  }, [tree, sort, summaries, zone, folded, found])
  const dimmed = useMemo(() => (found ? new Set(rows.filter((n) => !found.matched.has(n.id)).map((n) => n.id)) : undefined), [found, rows])

  const fold = (id: string, on: boolean) => setFolded((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n })
  // First click sorts in the column's natural direction, the second reverses it, the third returns to your own order.
  const onSort = (key: ProjectSortKey) => setSort((s) => (s?.key !== key ? { key, dir: firstDirection(key) }
    : s.dir === firstDirection(key) ? { key, dir: s.dir === 1 ? -1 : 1 } : null))
  const onFindKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && found?.order[0]) { e.preventDefault(); navigate({ view: 'project', id: found.order[0].id }) }
    else if (e.key === 'Escape' && query) { e.preventDefault(); e.stopPropagation(); setQuery('') }
    else if (e.key === 'ArrowDown') { e.preventDefault(); document.querySelector<HTMLElement>('[data-projects-table] [data-project-open]')?.focus() }
  }
  // The find field takes focus where a keyboard is likely (`g r`, then type); a touch screen keeps its keyboard closed.
  const autoFocus = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches && tab === 'active'

  return (
    <PageBody width="list" data-testid="projects-page">
      <PageHeader title={t('Projects')} meta={projects.length} help="projects"
        actions={<>
          <Button variant="secondary" size="sm" icon="copy" onClick={requestTemplateDialog}>{t('From a template…')}</Button>
          <Button variant="primary" size="sm" icon="plus" onClick={() => setCreating(true)}>{t('New project')}</Button>
        </>}
        overflow={<>
          <MenuItem label={t('Collapse all')} icon="chevrons-down-up" onSelect={() => setFolded(new Set(tree.nodes.keys()))} />
          <MenuItem label={t('Expand all')} icon="chevrons-up-down" onSelect={() => setFolded(new Set())} />
        </>} />
      <Tabs label={t('Projects')} value={tab} rowClassName="border-soft"
        onChange={(id) => {
          setTab(id as 'active' | 'archived')
          // The fragment follows the tab, so a reload or a shared link opens the same one.
          history.replaceState(history.state, '', id === 'archived' ? '#archived' : location.pathname + location.search)
        }}
        tabs={[{ id: 'active', label: t('Active'), count: projects.length }, { id: 'archived', label: t('Archived'), count: archivedCount }]}>
        {tab === 'active' ? <>
          <div className="mb-2 max-w-sm">
            <input className="ui-input" type="search" placeholder={t('Find a project…')} aria-label={t('Find a project')} value={query}
              onChange={(e) => setQuery(e.target.value)} onKeyDown={onFindKey} autoFocus={autoFocus} enterKeyHint="go" autoComplete="off" data-projects-find />
            {found?.empty && <p className="px-2 pt-2 text-meta text-faint" role="status">{t('Nothing matches.')}</p>}
          </div>
          {/* Until the projects are read, the skeleton (motion-polish D2). */}
          {!loaded && <Skeleton shape="row" count={5} label={t('Loading the list…')} />}
          {loaded && projects.length > 0 && <ProjectsTable rows={rows} summaries={summaries} memberships={memberMap} dimmed={dimmed}
            folded={folded} foldable={!found} onFold={fold} sort={sort} onSort={onSort} today={today} now={now}
            canMove={(n) => canEditProject(roleOf(n.id, memberMap))} edges={(n) => siblingEdges(tree, n)} />}
          {loaded && projects.length === 0 && <p className="px-2 py-2 text-body text-faint">{t('No projects yet.')}</p>}
          {loaded && projects.length > 0 && <p className="px-2 pt-4 text-meta text-faint" data-health-note>
            {t('Health is worked out on your device from late tasks, deadlines and recent activity.')}
          </p>}
        </> : <div data-archived-tab><ArchivedProjectsSection bare /></div>}
      </Tabs>
      {creating && (
        <NamePrompt title={t('New project')} label={t('Project name')} confirm={t('Create')} onCancel={() => setCreating(false)}
          onSubmit={async (name) => {
            const id = await createProject({ name })
            setCreating(false)
            navigate({ view: 'project', id })
          }} />
      )}
    </PageBody>
  )
}
