// All projects (OpenSpec change sidebar-favourites, design D6; project-organization
// "All projects page"): the whole tree with counts and menus, a find field that keeps
// ancestors, New project and From a template, and the archived projects behind a
// disclosure. Everything is read from local data, so it works offline and follows sync.
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useProjects, useProjectsLoaded, useMembershipMap } from '../lib/localData'
import { useOpenTasks } from '../lib/liveTasks'
import { createProject } from '../lib/ops'
import { buildProjectTree, openCountsByProject, siblingEdges, visibleProjects } from '../lib/projects'
import { canEditProject, roleOf } from '../lib/sharing'
import { matchSidebar } from '../lib/sidebarFind'
import { flattenTree } from '../lib/tree'
import { openCount } from '../lib/views'
import { t } from '../lib/i18n'
import { Button, Icon, MenuItem, PageBody, PageHeader, ReadAs, Skeleton } from '../ui'
import { ArchivedProjectsSection } from './ArchivedProjects'
import { NamePrompt } from './NamePrompt'
import { ProjectRowMenu } from './ProjectRowMenu'
import { navigate } from './router'
import { ProjectMark } from './Sidebar'
import { requestTemplateDialog } from './TemplateDialogs'
import { MAX_INDENT } from './TaskRow'
import { useToday } from './useViews'

/** Whether the page was opened at its archived projects (`/projects#archived`, Settings → Data). */
function wantsArchived(prop?: boolean): boolean {
  return !!prop || (typeof location !== 'undefined' && location.hash === '#archived')
}

export function ProjectsView({ archived }: { archived?: boolean }) {
  const all = useProjects()
  const loaded = useProjectsLoaded() !== undefined
  const projects = useMemo(() => visibleProjects(all), [all])
  const archivedCount = useMemo(() => all.filter((p) => p.archived).length, [all])
  const tree = useMemo(() => buildProjectTree(projects), [projects])
  const memberMap = useMembershipMap()
  const openTasks = useOpenTasks()
  const today = useToday()
  // Folding on this page is its own (Collapse all / Expand all); the page opens with the whole tree.
  const [folded, setFolded] = useState<Set<string>>(() => new Set())
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [archivedOpen, setArchivedOpen] = useState(() => wantsArchived(archived))
  const disclosure = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const reveal = () => {
      if (!wantsArchived(archived)) return
      setArchivedOpen(true)
      requestAnimationFrame(() => disclosure.current?.scrollIntoView?.({ block: 'start' }))
    }
    reveal()
    // A link to #archived while the page is open changes only the fragment.
    window.addEventListener('hashchange', reveal)
    return () => window.removeEventListener('hashchange', reveal)
  }, [archived, loaded])

  const everyRow = useMemo(() => flattenTree(tree.roots, () => false), [tree])
  const found = useMemo(() => (query.trim() ? matchSidebar(query, {
    rows: everyRow.map((n) => ({ id: n.id, parent: n.parent, name: n.item.name })), labels: [], views: [],
  }) : null), [query, everyRow])
  const rows = useMemo(() => {
    const shown = flattenTree(tree.roots, (id) => !found && folded.has(id))
    return found ? shown.filter((n) => found.projects.has(n.id)) : shown
  }, [tree, folded, found])
  const counts = useMemo(
    () => openCountsByProject(openTasks.filter((tk) => openCount(tk, today)), tree, found ? new Set<string>() : folded),
    [openTasks, today, tree, folded, found],
  )

  const toggle = (id: string) => setFolded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const onFindKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && found?.order[0]) { e.preventDefault(); navigate({ view: 'project', id: found.order[0].id }) }
    else if (e.key === 'Escape' && query) { e.preventDefault(); e.stopPropagation(); setQuery('') }
  }
  // The find field takes focus where a keyboard is likely (`g r`, then type); a touch screen keeps its keyboard closed.
  const autoFocus = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches

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
      <div className="mb-3">
        <input className="ui-input" type="search" placeholder={t('Find a project…')} aria-label={t('Find a project')} value={query}
          onChange={(e) => setQuery(e.target.value)} onKeyDown={onFindKey} autoFocus={autoFocus} enterKeyHint="go" autoComplete="off" data-projects-find />
        {found?.empty && <p className="px-2 pt-2 text-meta text-faint" role="status">{t('Nothing matches.')}</p>}
      </div>
      {/* Until the projects are read, the skeleton: the archived disclosure below would jump (motion-polish D2). */}
      {!loaded && <Skeleton shape="row" count={5} label={t('Loading the list…')} />}
      <ul className="space-y-0.5" aria-label={t('Projects')} data-projects-tree>
        {rows.map((n) => {
          const p = n.item
          const has = n.children.length > 0
          const isFolded = !found && folded.has(n.id)
          const count = counts.get(n.id)
          return (
            <li key={n.id} data-projects-row={n.id} className="group flex items-center rounded-control hover:bg-sunken dark:hover:bg-raised"
              style={{ paddingLeft: `${Math.min(n.depth, MAX_INDENT) * 1.25}rem` }}>
              <span className="flex h-8 w-6 shrink-0 items-center justify-center pointer-coarse:h-11 pointer-coarse:w-11">
                {has && !found && (
                  <button type="button" onClick={() => toggle(n.id)} aria-expanded={!isFolded}
                    aria-label={isFolded ? t('Expand {name}', { name: p.name }) : t('Collapse {name}', { name: p.name })}
                    className="flex h-6 w-6 items-center justify-center rounded-chip text-faint hover:text-muted">
                    <Icon name="chevron-right" size="xs" className={`transition-transform duration-(--duration-ui) ${isFolded ? '' : 'rotate-90'}`} />
                  </button>
                )}
              </span>
              <button type="button" className={`flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-2 text-left text-body ${found && !found.matched.has(n.id) ? 'text-faint' : ''}`}
                onClick={() => navigate({ view: 'project', id: n.id })} data-project-open={n.id}>
                <span className="flex w-5 shrink-0 justify-center"><ProjectMark project={p} /></span>
                <span className="user-text min-w-0 flex-1 truncate">{p.name}</span>
                {count ? <span className="text-meta tabular-nums text-faint"><ReadAs label={t('{n, plural, one {# open task} other {# open tasks}}', { n: count })}>{count}</ReadAs></span> : null}
              </button>
              <ProjectRowMenu project={p} movable={canEditProject(roleOf(n.id, memberMap))} edges={siblingEdges(tree, n)} className="hover-reveal" />
            </li>
          )
        })}
      </ul>
      {loaded && projects.length === 0 && <p className="px-2 py-2 text-body text-faint">{t('No projects yet.')}</p>}
      {loaded && <details ref={disclosure} id="archived" open={archivedOpen} onToggle={(e) => setArchivedOpen(e.currentTarget.open)}
        className="mt-6 border-t border-default pt-3" data-archived-disclosure>
        <summary className="rounded-control px-2 py-1.5 text-body font-medium text-default">
          {t('Archived projects')} <span className="text-meta font-normal tabular-nums text-faint" data-archived-count>{archivedCount}</span>
        </summary>
        <div className="pt-2">{archivedOpen && <ArchivedProjectsSection bare />}</div>
      </details>}
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
