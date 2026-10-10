// Section headings, per-section quick add and "Add section" (OpenSpec `board-view`).
// Shared by the grouped list and the board columns. Every write goes through
// lib/sections, so all of it works offline and converges like any other edit.
import { type FormEvent, type KeyboardEvent, useRef, useState } from 'react'
import { createTask } from '../lib/ops'
import { createSection, deleteSection, renameSection, reorderSection } from '../lib/sections'
import type { Label, Project, Section } from '../lib/types'
import { QuickAdd, type QuickAddInput } from './QuickAdd'

export function SectionHeader({ section, count, layout, editable, first, last, collapsed, onToggleCollapse, onAdd }: {
  /** null: the "No section" heading. */
  section: Section | null
  count: number
  layout: 'list' | 'board'
  /** Editors and above (project-sharing roles); viewers get no menu or quick add. */
  editable: boolean
  first: boolean
  last: boolean
  collapsed?: boolean
  onToggleCollapse?: () => void
  onAdd?: () => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(section?.name ?? '')
  const menuRef = useRef<HTMLDetailsElement>(null)
  const title = section ? section.name || 'Untitled section' : 'No section'
  const close = () => { if (menuRef.current) menuRef.current.open = false }

  async function commit() {
    setRenaming(false)
    if (section && name.trim() && name.trim() !== section.name) await renameSection(section.id, name)
    else setName(section?.name ?? '')
  }
  async function remove() {
    if (!section) return
    close()
    const what = count ? ` Its ${count === 1 ? 'open task moves' : `${count} open tasks move`} to “No section”.` : ''
    if (!confirm(`Delete section “${title}”?${what}`)) return
    await deleteSection(section.id)
  }
  const before = layout === 'board' ? 'left' : 'up'
  const after = layout === 'board' ? 'right' : 'down'

  return (
    <div className="group/section flex items-center gap-1 px-1 py-1" data-section-heading={section?.id ?? ''}>
      {onToggleCollapse && (
        <button type="button" className="flex h-5 w-5 items-center justify-center rounded text-xs text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
          aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`} aria-expanded={!collapsed} onClick={onToggleCollapse}>
          {collapsed ? '▸' : '▾'}
        </button>
      )}
      {renaming && section ? (
        <input className="input max-w-xs py-0.5 text-sm font-semibold" autoFocus aria-label="Section name" value={name}
          onChange={(e) => setName(e.target.value)} onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commit()
            if (e.key === 'Escape') { e.stopPropagation(); setName(section.name); setRenaming(false) }
          }} />
      ) : (
        <h2 className={`truncate text-sm font-semibold ${section ? '' : 'text-slate-500'}`}>{title}</h2>
      )}
      <span className="text-xs text-slate-400" aria-label={`${count} open ${count === 1 ? 'task' : 'tasks'}`}>{count}</span>
      <div className="flex-1" />
      {editable && onAdd && (
        <button type="button" className="btn-ghost px-1.5 py-0.5 text-xs" onClick={onAdd} aria-label={`Add a task to ${title}`} title="Add a task here">+</button>
      )}
      {editable && section && (
        <details className="relative" ref={menuRef}>
          <summary className="btn-ghost cursor-pointer list-none px-1.5 py-0.5 text-xs" aria-label={`Section menu for ${title}`}>⋯</summary>
          <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
            <button type="button" className="btn-ghost w-full justify-start" onClick={() => { close(); setName(section.name); setRenaming(true) }}>Rename</button>
            <button type="button" className="btn-ghost w-full justify-start" disabled={first} onClick={() => { close(); void reorderSection(section.id, -1) }}>Move {before}</button>
            <button type="button" className="btn-ghost w-full justify-start" disabled={last} onClick={() => { close(); void reorderSection(section.id, 1) }}>Move {after}</button>
            <button type="button" className="btn-danger w-full justify-start" onClick={() => void remove()}>Delete section</button>
          </div>
        </details>
      )}
    </div>
  )
}

/** Quick add under a heading or at the bottom of a column: creates the task in that section. */
export function SectionQuickAdd({ project, sectionId, sectionName, projects, labels, onClose }: {
  project: Project
  sectionId: string | null
  sectionName: string
  projects: Project[]
  labels: Label[]
  onClose: () => void
}) {
  const onAdd = async ({ project_id, ...rest }: QuickAddInput) => {
    // A #project typed in the line wins; the section only applies inside this project.
    const target = project_id ?? project.id
    await createTask({ ...rest, project_id: target, section_id: target === project.id ? sectionId : null })
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }
  return (
    <div className="px-1 py-1" onKeyDown={onKeyDown} onBlur={(e) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null) && !(e.target as HTMLInputElement).value) onClose()
    }}>
      <QuickAdd onAdd={onAdd} projects={projects} labels={labels} hideHint autoFocus placeholder={`Add a task to ${sectionName}…`} label={`Add a task to ${sectionName}`} />
    </div>
  )
}

/** "+ Add section" button that turns into a name input. */
export function AddSection({ projectId, layout }: { projectId: string; layout: 'list' | 'board' }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setName('')
    await createSection(projectId, name)
  }
  if (!open) {
    return (
      <button type="button" className={`btn-ghost text-xs text-slate-500 ${layout === 'board' ? 'w-72 shrink-0 justify-start self-start' : ''}`} onClick={() => setOpen(true)}>
        + Add section
      </button>
    )
  }
  return (
    <form onSubmit={(e) => void submit(e)} className={layout === 'board' ? 'w-72 shrink-0 self-start' : 'max-w-xs'}>
      <input className="input py-1 text-sm" autoFocus placeholder="Section name, Enter to add" aria-label="New section name" value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); setName('') } }}
        onBlur={() => { if (!name.trim()) setOpen(false) }} />
    </form>
  )
}
