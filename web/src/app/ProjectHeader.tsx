import { useState } from 'react'
import { deleteProject, updateProject } from '../lib/ops'
import type { Project } from '../lib/types'
import { navigate } from './router'

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b']

export function ProjectHeader({ project }: { project: Project }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(project.name)

  async function save() {
    setEditing(false)
    if (name.trim() && name.trim() !== project.name) await updateProject(project.id, { name: name.trim() })
    else setName(project.name)
  }

  async function remove() {
    if (!confirm(`Delete "${project.name}"? Its open tasks move to the Inbox.`)) return
    await deleteProject(project.id)
    navigate({ view: 'inbox' })
  }

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
      <details className="relative">
        <summary className="btn-ghost cursor-pointer list-none text-xs">Project ⌄</summary>
        <div className="absolute right-0 z-10 mt-1 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <p className="px-1 pb-1 text-xs text-slate-400">Color</p>
          <div className="mb-2 flex flex-wrap gap-1 px-1">
            {COLORS.map((c) => (
              <button key={c} className={`h-5 w-5 rounded-full ${c === project.color ? 'ring-2 ring-offset-1 ring-emerald-500' : ''}`} style={{ backgroundColor: c }}
                aria-label={`Set color ${c}`} onClick={() => void updateProject(project.id, { color: c })} />
            ))}
          </div>
          <button className="btn-ghost w-full justify-start" onClick={() => setEditing(true)}>Rename</button>
          <button className="btn-ghost w-full justify-start" onClick={() => void updateProject(project.id, { archived: true }).then(() => navigate({ view: 'inbox' }))}>Archive</button>
          <button className="btn-danger w-full justify-start" onClick={() => void remove()}>Delete project</button>
        </div>
      </details>
    </div>
  )
}
