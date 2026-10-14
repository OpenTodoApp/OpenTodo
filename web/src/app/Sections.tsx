// Section headings, per-section quick add and "Add section" (OpenSpec `board-view`).
// Shared by the grouped list and the board columns. Every write goes through
// lib/sections, so all of it works offline and converges like any other edit.
import { Icon } from '../ui/Icon'
import { ActionMenu, type ActionGroup } from './menus/ActionMenu'
import { useRowMenuShortcut } from './menus/useRowMenuShortcut'
import { type FormEvent, type KeyboardEvent, useState } from 'react'
import { createTask } from '../lib/ops'
import { createSection, deleteSection, renameSection, reorderSection } from '../lib/sections'
import type { Label, Project, Section } from '../lib/types'
import { QuickAdd, type QuickAddInput } from './QuickAdd'

/** The section menu as data (labels-and-menus 3.1). */
export function sectionMenuGroups(title: string, o: { first: boolean; last: boolean; layout: 'list' | 'board'; count: number },
  a: { rename: () => void; move: (delta: -1 | 1) => unknown; remove: () => unknown }): ActionGroup[] {
  const before = o.layout === 'board' ? 'left' : 'up'
  const after = o.layout === 'board' ? 'right' : 'down'
  const moves = o.count === 1 ? 'Its open task moves' : `Its ${o.count} open tasks move`
  return [
    { items: [{ kind: 'action', id: 'rename', label: 'Rename', icon: 'pencil', shortcut: 'F2', onSelect: a.rename }] },
    { items: [
      { kind: 'action', id: 'before', label: `Move ${before}`, icon: 'arrow-up', disabled: o.first, reason: 'Already first', onSelect: () => a.move(-1) },
      { kind: 'action', id: 'after', label: `Move ${after}`, icon: 'arrow-down', disabled: o.last, reason: 'Already last', onSelect: () => a.move(1) },
    ] },
    { items: [{ kind: 'confirm', id: 'delete', label: 'Delete section', icon: 'trash-2', tone: 'danger', confirm: {
      title: `Delete section “${title}”?`,
      body: o.count ? `${moves} to “No section” in this project.` : 'It has no open tasks.',
      confirmLabel: 'Delete section',
      onConfirm: a.remove,
    } }] },
  ]
}

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
  const title = section ? section.name || 'Untitled section' : 'No section'

  async function commit() {
    setRenaming(false)
    if (section && name.trim() && name.trim() !== section.name) await renameSection(section.id, name)
    else setName(section?.name ?? '')
  }
  const [menuOpen, setMenuOpen] = useState(false)
  const startRename = () => { if (section) { setName(section.name); setRenaming(true) } }
  const groups = section ? sectionMenuGroups(title, { first, last, layout, count }, {
    rename: startRename,
    move: (d) => reorderSection(section.id, d),
    remove: () => deleteSection(section.id),
  }) : []
  const onRowKey = useRowMenuShortcut({
    openMenu: () => setMenuOpen(true),
    rename: startRename,
    move: (to) => { if (section && (to === -1 || to === 1)) void reorderSection(section.id, to) },
  })

  return (
    <div className="group/section flex items-center gap-1 px-1 py-1" data-section-heading={section?.id ?? ''}
      onKeyDown={editable && section && !renaming ? onRowKey : undefined}>
      {onToggleCollapse && (
        <button type="button" className="flex h-5 w-5 items-center justify-center rounded text-xs text-faint hover:bg-sunken dark:hover:bg-raised"
          aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`} aria-expanded={!collapsed} onClick={onToggleCollapse}>
          <Icon name="chevron-right" size="xs" className={`transition-transform duration-(--duration-ui) ${collapsed ? '' : 'rotate-90'}`} />
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
        <h2 className={`truncate text-sm font-semibold ${section ? '' : 'text-muted'}`}>{title}</h2>
      )}
      <span className="text-xs text-faint" aria-label={`${count} open ${count === 1 ? 'task' : 'tasks'}`}>{count}</span>
      <div className="flex-1" />
      {editable && onAdd && (
        <button type="button" className="btn-ghost px-1.5 py-0.5 text-xs" onClick={onAdd} aria-label={`Add a task to ${title}`} title="Add a task here">+</button>
      )}
      {editable && section && (
        <ActionMenu label={`Section menu for ${title}`} title={title} groups={groups} width="sm:w-60" open={menuOpen} onOpenChange={setMenuOpen}
          triggerClassName="btn-ghost touch-target px-1.5 py-0.5 text-xs" />
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
      <button type="button" className={`btn-ghost text-xs text-muted ${layout === 'board' ? 'w-72 shrink-0 justify-start self-start' : ''}`} onClick={() => setOpen(true)}>
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
