import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../lib/db'
import { archiveProject, deleteProject, moveProject, updateProject } from '../lib/ops'
import { buildProjectTree, descendantIds } from '../lib/projects'
import { canDeleteProject, canEditProject, canManageMembers } from '../lib/sharing'
import { flattenTree } from '../lib/tree'
import type { Project } from '../lib/types'
import { navigate } from './router'
import { ShareDialog } from './ShareDialog'
import { HistoryPanel } from './HistoryPanel'
import { ProjectActivity } from './ProjectActivity'
import { Menu } from './overlay'

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b']

export function ProjectHeader({ project, userId }: { project: Project; userId?: string }) {
  const [editing, setEditing] = useState(false)
  const [sharing, setSharing] = useState(false)
  // Cached membership (project-sharing): roles render the same offline.
  const membership = useLiveQuery(() => db.memberships.get(project.id), [project.id])
  const role = membership?.role ?? 'owner'
  const editable = canEditProject(role)
  const [name, setName] = useState(project.name)
  const [moveError, setMoveError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const moveRef = useRef<HTMLSelectElement>(null)

  // "Move to" candidates: every live, non-archived project in tree order, minus the
  // project itself and its descendants (a single device can never form a cycle).
  const projects = useLiveQuery(() => db.projects.filter((p) => !p.deleted_at).toArray(), [], [] as Project[])
  const targets = useMemo(() => {
    const excluded = descendantIds(project.id, projects)
    return flattenTree(buildProjectTree(projects).roots).filter((n) => n.id !== project.id && !excluded.has(n.id))
  }, [projects, project.id])
  const subCount = useMemo(() => projects.filter((p) => p.parent_id === project.id).length, [projects, project.id])

  useEffect(() => setMoveError(null), [project.id])

  // `m` opens the menu on the Move picker, so a move is reachable without a mouse;
  // Shift+S opens the share dialog (members, roles, leave, transfer).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key !== 'm' && e.key !== 'S') || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (e.key === 'S') {
        e.preventDefault()
        setSharing(true)
        return
      }
      if (!editable) return
      e.preventDefault()
      setMenuOpen(true)
      // The panel mounts on the next render; focus the Move picker then.
      requestAnimationFrame(() => requestAnimationFrame(() => moveRef.current?.focus()))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editable])

  async function save() {
    setEditing(false)
    if (name.trim() && name.trim() !== project.name) await updateProject(project.id, { name: name.trim() })
    else setName(project.name)
  }

  async function move(value: string) {
    setMoveError(null)
    try {
      await moveProject(project.id, value || null)
      setMenuOpen(false)
    } catch (err) {
      setMoveError(err instanceof Error ? err.message : String(err))
    }
  }

  async function remove() {
    const subs = subCount ? ` Its ${subCount === 1 ? 'sub-project moves' : `${subCount} sub-projects move`} up one level.` : ''
    const what = membership
      ? `Delete "${project.name}" for every member? Copies of its open tasks go to your Inbox.${subs}`
      : `Move "${project.name}" and its tasks to the Trash? You can restore them from the Trash.${subs}`
    if (!confirm(what)) return
    await deleteProject(project.id)
    navigate({ view: 'inbox' })
  }

  const parentKnown = targets.some((n) => n.id === project.parent_id)

  return (
    <div className="mb-4">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
      {editing ? (
        <input className="input max-w-xs text-lg font-semibold" autoFocus value={name} onChange={(e) => setName(e.target.value)}
          onBlur={() => void save()} onKeyDown={(e) => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') { setName(project.name); setEditing(false) } }} />
      ) : (
        <h1 className={`user-text min-w-0 text-xl font-semibold ${editable ? 'cursor-text' : ''}`} onClick={() => editable && setEditing(true)} title={editable ? 'Click to rename' : undefined}>{project.name}</h1>
      )}
      {membership && (
        <button className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300" onClick={() => setSharing(true)}
          title={membership.members.map((m) => `${m.name || m.email} (${m.role})`).join('\n')} aria-label="Members">
          <span className="flex -space-x-1">
            {membership.members.slice(0, 4).map((m) => (
              <span key={m.userId} className="flex h-5 w-5 items-center justify-center rounded-full border border-white bg-slate-200 text-[10px] font-semibold uppercase text-slate-600 dark:border-slate-900 dark:bg-slate-700 dark:text-slate-200">
                {(m.name || m.email).slice(0, 1)}
              </span>
            ))}
          </span>
          <span>{membership.members.length} · {role}</span>
        </button>
      )}
      {role === 'viewer' && <span role="note" className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 dark:bg-slate-800">Read-only</span>}
      <div className="flex-1" />
      <button className="btn-ghost text-xs" onClick={() => setSharing(true)} title="Share and manage members (Shift+S)" aria-haspopup="dialog">
        {canManageMembers(role) ? 'Share' : 'Members'} <span className="kbd ml-1">S</span>
      </button>
      {sharing && <ShareDialog project={project} userId={userId ?? ''} cached={membership} onClose={() => setSharing(false)} />}
      {editable && <Menu label="Project menu" title={project.name} trigger={<>Project ⌄</>} triggerClassName="btn-ghost text-xs" className="p-2"
        open={menuOpen} onOpenChange={setMenuOpen}>
          <p className="px-1 pb-1 text-xs text-slate-400">Color</p>
          <div className="mb-2 flex flex-wrap gap-1 px-1">
            {COLORS.map((c) => (
              <button key={c} className="touch-target inline-flex items-center justify-center rounded-full" aria-label={`Set color ${c}`} aria-pressed={c === project.color} onClick={() => void updateProject(project.id, { color: c })}>
                <span className={`block h-5 w-5 rounded-full ${c === project.color ? 'ring-2 ring-offset-1 ring-emerald-500' : ''}`} style={{ backgroundColor: c }} />
              </button>
            ))}
          </div>
          <label className="block px-1 pb-2">
            <span className="block pb-1 text-xs text-slate-400">Move to <span className="kbd ml-1">m</span></span>
            <select ref={moveRef} className="input py-1 text-sm" aria-label="Move to" value={parentKnown ? project.parent_id ?? '' : ''} onChange={(e) => void move(e.target.value)}>
              <option value="">Top level</option>
              {targets.map((n) => (
                <option key={n.id} value={n.id}>{'  '.repeat(n.depth)}{n.item.name}</option>
              ))}
            </select>
            {moveError && <span className="mt-1 block text-xs text-red-600">{moveError}</span>}
          </label>
          <button className="btn-ghost w-full justify-start" onClick={() => { setMenuOpen(false); setEditing(true) }}>Rename</button>
          <button className="btn-ghost w-full justify-start" title={subCount ? 'Archives its sub-projects too' : undefined}
            onClick={() => void archiveProject(project.id).then(() => navigate({ view: 'inbox' }))}>
            Archive{subCount ? ' (with sub-projects)' : ''}
          </button>
          {canDeleteProject(role) && <button className="btn-danger w-full justify-start" onClick={() => void remove()}>Delete project</button>}
      </Menu>}
    </div>
    <HistoryPanel entity="project" id={project.id} readOnly={!editable} />
    <ProjectActivity project={project} />
    </div>
  )
}
