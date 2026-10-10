import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../lib/db'
import { archiveProject, deleteProject, moveProject, updateProject } from '../lib/ops'
import { buildProjectTree, descendantIds } from '../lib/projects'
import { flattenTree } from '../lib/tree'
import type { Project } from '../lib/types'
import { navigate } from './router'

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b']

export function ProjectHeader({ project }: { project: Project }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(project.name)
  const [moveError, setMoveError] = useState<string | null>(null)
  const menuRef = useRef<HTMLDetailsElement>(null)
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

  // `m` opens the menu on the Move picker, so a move is reachable without a mouse.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'm' || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      e.preventDefault()
      if (menuRef.current) menuRef.current.open = true
      moveRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function save() {
    setEditing(false)
    if (name.trim() && name.trim() !== project.name) await updateProject(project.id, { name: name.trim() })
    else setName(project.name)
  }

  async function move(value: string) {
    setMoveError(null)
    try {
      await moveProject(project.id, value || null)
      if (menuRef.current) menuRef.current.open = false
    } catch (err) {
      setMoveError(err instanceof Error ? err.message : String(err))
    }
  }

  async function remove() {
    const subs = subCount ? ` Its ${subCount === 1 ? 'sub-project moves' : `${subCount} sub-projects move`} up one level.` : ''
    if (!confirm(`Delete "${project.name}"? Its open tasks move to the Inbox.${subs}`)) return
    await deleteProject(project.id)
    navigate({ view: 'inbox' })
  }

  const parentKnown = targets.some((n) => n.id === project.parent_id)

  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: project.color }} />
      {editing ? (
        <input className="input max-w-xs text-lg font-semibold" autoFocus value={name} onChange={(e) => setName(e.target.value)}
          onBlur={() => void save()} onKeyDown={(e) => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') { setName(project.name); setEditing(false) } }} />
      ) : (
        <h1 className="cursor-text text-xl font-semibold" onClick={() => setEditing(true)} title="Click to rename">{project.name}</h1>
      )}
      <div className="flex-1" />
      <details className="relative" ref={menuRef}>
        <summary className="btn-ghost cursor-pointer list-none text-xs">Project ⌄</summary>
        <div className="absolute right-0 z-10 mt-1 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <p className="px-1 pb-1 text-xs text-slate-400">Color</p>
          <div className="mb-2 flex flex-wrap gap-1 px-1">
            {COLORS.map((c) => (
              <button key={c} className={`h-5 w-5 rounded-full ${c === project.color ? 'ring-2 ring-offset-1 ring-emerald-500' : ''}`} style={{ backgroundColor: c }}
                aria-label={`Set color ${c}`} onClick={() => void updateProject(project.id, { color: c })} />
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
          <button className="btn-ghost w-full justify-start" onClick={() => setEditing(true)}>Rename</button>
          <button className="btn-ghost w-full justify-start" title={subCount ? 'Archives its sub-projects too' : undefined}
            onClick={() => void archiveProject(project.id).then(() => navigate({ view: 'inbox' }))}>
            Archive{subCount ? ' (with sub-projects)' : ''}
          </button>
          <button className="btn-danger w-full justify-start" onClick={() => void remove()}>Delete project</button>
        </div>
      </details>
    </div>
  )
}
