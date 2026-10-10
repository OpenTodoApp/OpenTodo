import { useLiveQuery } from 'dexie-react-hooks'
import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { db, getMeta } from '../lib/db'
import { todayISO } from '../lib/dates'
import { createProject } from '../lib/ops'
import { COLLAPSED_PROJECTS_KEY, buildProjectTree, expandAncestorsOf, openCountsByProject, toggleCollapsedProject, type ProjectNode } from '../lib/projects'
import { flattenTree } from '../lib/tree'
import type { User } from '../lib/types'
import { LabelRow, NewLabelForm, useLabelData } from './LabelsView'
import { MAX_INDENT } from './TaskRow'
import { navigate, type Route } from './router'

const ACTIVE = 'bg-emerald-100 font-medium text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100'
const IDLE = 'text-slate-700 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800'

/** Indentation per level in the sidebar; capped so a deep tree still fits a 360 px screen. */
const INDENT_REM = 0.75

export function Sidebar({ route, user }: { route: Route; user: User }) {
  const projects = useLiveQuery(() => db.projects.filter((p) => !p.deleted_at && !p.archived).toArray(), [], [])
  // Per-device collapse state lives in the local meta table (never synced); reading it
  // through a live query keeps every Sidebar instance in step.
  const collapsedIds = useLiveQuery(() => getMeta<string[]>(COLLAPSED_PROJECTS_KEY, []), [], [] as string[])
  const collapsed = useMemo(() => new Set(collapsedIds), [collapsedIds])
  const tree = useMemo(() => buildProjectTree(projects), [projects])
  const rows = useMemo(() => flattenTree(tree.roots, (id) => collapsed.has(id)), [tree, collapsed])

  const openTasks = useLiveQuery(() => db.tasks.filter((t) => !t.deleted_at && !t.completed_at).toArray(), [], [])
  const counts = useMemo(() => {
    const today = todayISO()
    let inbox = 0
    let due = 0
    for (const t of openTasks) {
      if (t.project_id === null) inbox++
      if (t.due && t.due.date <= today) due++
    }
    return { inbox, today: due, byProject: openCountsByProject(openTasks, tree, collapsed) }
  }, [openTasks, tree, collapsed])

  // Navigating to a sub-project reveals it: its ancestors leave the collapsed set.
  // Only on a real route change, not on mount or on project edits, so a reload (or a
  // remote op) never undoes what the user collapsed on this device.
  const lastRoute = useRef<string | null>(null)
  useEffect(() => {
    const key = route.view === 'project' ? route.id : null
    const prev = lastRoute.current
    lastRoute.current = key ?? ''
    if (key === null || prev === null || prev === key) return
    void db.projects.toArray().then((all) => expandAncestorsOf(key, all))
  }, [route])

  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const { labels, counts: labelCounts, duplicates } = useLabelData()
  const [labelsOpen, setLabelsOpen] = useState(true)
  const [addingLabel, setAddingLabel] = useState(false)
  const [parentId, setParentId] = useState('')

  function startAdding() {
    setParentId(route.view === 'project' && tree.nodes.has(route.id) ? route.id : '')
    setAdding(true)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const id = await createProject({ name, parent_id: parentId || null })
    if (parentId) await toggleCollapsedProject(parentId, false)
    setName('')
    setAdding(false)
    navigate({ view: 'project', id })
  }

  const focusRow = (id: string | null) => {
    if (id) document.querySelector<HTMLElement>(`[data-project-id="${id}"]`)?.focus()
  }

  /** Left collapses (or climbs to the parent), Right expands (or descends to the first child). */
  function onRowKey(e: KeyboardEvent<HTMLButtonElement>, n: ProjectNode) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    e.stopPropagation()
    const has = n.children.length > 0
    if (e.key === 'ArrowLeft') {
      if (has && !collapsed.has(n.id)) void toggleCollapsedProject(n.id, true)
      else focusRow(n.parent)
    } else if (has && collapsed.has(n.id)) void toggleCollapsedProject(n.id, false)
    else if (has) focusRow(n.children[0].id)
  }

  const item = (r: Route, label: string, icon: string, count?: number) => {
    const active = JSON.stringify(r) === JSON.stringify(route)
    return (
      <button key={label} onClick={() => navigate(r)} className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${active ? ACTIVE : IDLE}`}>
        <span className="w-5 text-center">{icon}</span>
        <span className="flex-1 truncate">{label}</span>
        {count ? <span className="text-xs text-slate-400">{count}</span> : null}
      </button>
    )
  }

  return (
    <div className="flex h-full flex-col p-3">
      <div className="mb-4 flex items-center gap-2 px-1">
        <img src="/favicon.svg" alt="" className="h-7 w-7" />
        <span className="font-semibold">OpenTodo</span>
      </div>
      <nav className="space-y-0.5">
        {item({ view: 'inbox' }, 'Inbox', '📥', counts.inbox)}
        {item({ view: 'today' }, 'Today', '📅', counts.today)}
        {item({ view: 'upcoming' }, 'Upcoming', '🗓️')}
        {item({ view: 'completed' }, 'Completed', '✅')}
      </nav>
      <div className="mt-5 mb-1 flex items-center justify-between px-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Projects
        <button className="rounded px-1 text-base leading-none hover:bg-slate-200 dark:hover:bg-slate-800" onClick={startAdding} title="New project">+</button>
      </div>
      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto" aria-label="Projects">
        <ul role="tree">
          {rows.map((n) => {
            const p = n.item
            const has = n.children.length > 0
            const isCollapsed = collapsed.has(n.id)
            const count = counts.byProject.get(n.id)
            return (
              <li key={n.id} role="treeitem" aria-level={n.depth + 1} aria-expanded={has ? !isCollapsed : undefined}
                className="flex items-center" style={{ paddingLeft: `${Math.min(n.depth, MAX_INDENT) * INDENT_REM}rem` }}>
                <span className="flex h-6 w-4 shrink-0 items-center justify-center">
                  {has && (
                    <button type="button" tabIndex={-1} aria-label={isCollapsed ? `Expand ${p.name}` : `Collapse ${p.name}`}
                      onClick={() => void toggleCollapsedProject(n.id)}
                      className="flex h-5 w-4 items-center justify-center rounded text-xs text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700">
                      {isCollapsed ? '▸' : '▾'}
                    </button>
                  )}
                </span>
                <button
                  data-project-id={n.id}
                  onClick={() => navigate({ view: 'project', id: n.id })}
                  onKeyDown={(e) => onRowKey(e, n)}
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${route.view === 'project' && route.id === n.id ? ACTIVE : IDLE}`}
                >
                  <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                  <span className="flex-1 truncate">{p.name}</span>
                  {count ? <span className="text-xs text-slate-400" title={isCollapsed && has ? 'Open tasks including sub-projects' : 'Open tasks'}>{count}</span> : null}
                </button>
              </li>
            )
          })}
        </ul>
        {adding && (
          <form onSubmit={(e) => void submit(e)} className="space-y-1 px-1 pt-1">
            <input className="input" autoFocus placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setAdding(false)} />
            <select className="input py-1 text-xs" aria-label="Parent project" value={parentId} onChange={(e) => setParentId(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}>
              <option value="">Top level</option>
              {flattenTree(tree.roots).map((n) => (
                <option key={n.id} value={n.id}>{'  '.repeat(n.depth)}{n.item.name}</option>
              ))}
            </select>
            <div className="flex gap-1">
              <button type="submit" className="btn-primary flex-1 text-xs">Create</button>
              <button type="button" className="btn-ghost text-xs" onClick={() => setAdding(false)}>Cancel</button>
            </div>
          </form>
        )}
        {projects.length === 0 && !adding && <p className="px-2 py-1 text-xs text-slate-400">No projects yet.</p>}

        <div className="mt-5 mb-1 flex items-center justify-between px-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <button className="flex items-center gap-1 uppercase hover:text-slate-600 dark:hover:text-slate-200" onClick={() => setLabelsOpen((v) => !v)} aria-expanded={labelsOpen}>
            <span className="inline-block w-3 text-[10px]">{labelsOpen ? '▾' : '▸'}</span>Labels
          </button>
          <span className="flex items-center gap-1">
            <button className={`rounded px-1 text-[10px] normal-case hover:bg-slate-200 dark:hover:bg-slate-800 ${route.view === 'labels' ? 'text-emerald-700 dark:text-emerald-300' : ''}`} onClick={() => navigate({ view: 'labels' })} title="All labels (g l)">All</button>
            <button className="rounded px-1 text-base leading-none hover:bg-slate-200 dark:hover:bg-slate-800" onClick={() => { setLabelsOpen(true); setAddingLabel(true) }} title="New label">+</button>
          </span>
        </div>
        {labelsOpen && (
          <div className="space-y-0.5">
            {labels.map((l) => <LabelRow key={l.id} label={l} labels={labels} count={labelCounts.get(l.id)} duplicate={duplicates.has(l.id)} route={route} />)}
            {addingLabel && <NewLabelForm onDone={() => setAddingLabel(false)} className="px-1 pt-1" />}
            {labels.length === 0 && !addingLabel && <p className="px-2 py-1 text-xs text-slate-400">No labels yet.</p>}
          </div>
        )}
      </nav>
      <button onClick={() => navigate({ view: 'settings' })}
        className={`mt-3 flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${route.view === 'settings' ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'hover:bg-slate-200/60 dark:hover:bg-slate-800'}`}>
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white">
          {(user.name || user.email).slice(0, 1).toUpperCase()}
        </span>
        <span className="flex-1 truncate text-slate-700 dark:text-slate-300">{user.name || user.email}</span>
        <span className="text-slate-400">⚙</span>
      </button>
    </div>
  )
}
