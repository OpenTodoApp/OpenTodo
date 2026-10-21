// Section headings, per-section quick add and "Add section" (OpenSpec `board-view`).
// Shared by the grouped list and the board columns. Every write goes through
// lib/sections, so all of it works offline and converges like any other edit.
import { CatalogueIcon, HUES, hueFor, IconButton, IconPicker, isCatalogueIcon, ListGroupHeader } from '../ui'
import { hueName } from '../lib/colourNames'
import { ActionMenu, type ActionGroup } from './menus/ActionMenu'
import { colourPickerSpec, iconPickerSpec } from './menus/stylePickers'
import { useRowMenuShortcut } from './menus/useRowMenuShortcut'
import { type FormEvent, type KeyboardEvent, useState } from 'react'
import { createTask } from '../lib/ops'
import { createSection, deleteSection, renameSection, reorderSection, setSectionStyle } from '../lib/sections'
import type { Label, Project, Section } from '../lib/types'
import { QuickAdd, type QuickAddInput } from './QuickAdd'
import { t } from '../lib/i18n'
import { act } from './actionError'

/** The section menu as data (labels-and-menus 3.1). */
export function sectionMenuGroups(title: string, o: { first: boolean; last: boolean; layout: 'list' | 'board'; count: number },
  a: { rename: () => void; move: (delta: -1 | 1) => unknown; remove: () => unknown; section?: Section }): ActionGroup[] {
  const board = o.layout === 'board'
  const section = a.section
  // Colour and icon (icons-and-section-style): steps inside the same overlay.
  const style: ActionGroup['items'] = section ? [
    { kind: 'step', id: 'colour', label: t('Colour'), icon: 'palette', step: {
      title: t('Colour'),
      render: (done) => <SectionColours section={section} onPicked={done} />,
      palette: colourPickerSpec(section.color, (color) => act(setSectionStyle(section.id, { color }))),
    } },
    { kind: 'step', id: 'icon', label: t('Icon'), icon: 'image', step: {
      title: t('Icon'),
      render: (done, back) => (
        <span data-hue={section.color ? hueFor(section.color) : undefined} className={section.color ? 'text-hue' : undefined}>
          <IconPicker value={section.icon} onClose={back} onPick={(icon) => { act(setSectionStyle(section.id, { icon })); done() }} />
        </span>
      ),
      palette: iconPickerSpec(section.icon, (icon) => act(setSectionStyle(section.id, { icon }))),
    } },
  ] : []
  return [
    { items: [{ kind: 'action', id: 'rename', label: t('Rename'), icon: 'pencil', shortcut: 'F2', onSelect: a.rename }, ...style] },
    { items: [
      { kind: 'action', id: 'before', label: board ? t('Move left') : t('Move up'), icon: 'arrow-up', disabled: o.first, reason: t('Already first'), onSelect: () => a.move(-1) },
      { kind: 'action', id: 'after', label: board ? t('Move right') : t('Move down'), icon: 'arrow-down', disabled: o.last, reason: t('Already last'), onSelect: () => a.move(1) },
    ] },
    { items: [{ kind: 'confirm', id: 'delete', label: t('Delete section'), icon: 'trash-2', tone: 'danger', confirm: {
      title: t('Delete section “{name}”?', { name: title }),
      body: o.count ? t('{n, plural, one {Its open task moves to “No section” in this project.} other {Its # open tasks move to “No section” in this project.}}', { n: o.count }) : t('It has no open tasks.'),
      confirmLabel: t('Delete section'),
      onConfirm: a.remove,
    } }] },
  ]
}

/** The section colours: the project palette and "No colour". */
function SectionColours({ section, onPicked }: { section: Section; onPicked: () => void }) {
  const current = section.color ? hueFor(section.color) : null
  const pick = (color: string | null) => { act(setSectionStyle(section.id, { color })); onPicked() }
  return (
    <div role="radiogroup" aria-label={t('Colour')} className="flex flex-wrap gap-1 px-1.5 py-1.5" data-section-colours>
      <button type="button" role="radio" aria-checked={current === null} aria-label={t('No colour')} autoFocus={current === null}
        className="touch-target inline-flex items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus"
        onClick={() => pick(null)}>
        <span className={`block h-5 w-5 rounded-full border border-dashed border-default ${current === null ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface' : ''}`} />
      </button>
      {HUES.map((h) => (
        <button key={h.name} type="button" role="radio" aria-checked={h.name === current} aria-label={t('Colour {name}', { name: hueName(h.name) })} autoFocus={h.name === current}
          className="touch-target inline-flex items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus"
          onClick={() => pick(h.hex)}>
          <span data-hue={h.name} className={`block h-5 w-5 rounded-full bg-hue-solid ${h.name === current ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface' : ''}`} />
        </button>
      ))}
    </div>
  )
}

/**
 * Before a section's title (sections-and-boards "Section colour and icon"): its icon,
 * in its colour when it has one; else a dot of its colour; else nothing.
 */
export function SectionMark({ section }: { section: Pick<Section, 'color' | 'icon'> }) {
  const hue = section.color ? hueFor(section.color) : undefined
  const dot = hue ? <span data-hue={hue} className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-hue-solid" data-section-mark="dot" /> : null
  if (section.icon && isCatalogueIcon(section.icon)) {
    return (
      <span data-hue={hue} className={`inline-flex shrink-0 items-center ${hue ? 'text-hue' : ''}`} data-section-mark="icon">
        <CatalogueIcon name={section.icon} fallback={dot} />
      </span>
    )
  }
  return dot
}

export function SectionHeader({ section, count, layout, editable, first, last, collapsed, onToggleCollapse, onAdd, completed = 0, revealed = false, onReveal }: {
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
  /** Completed tasks under the section; with no open task the header reads "n completed" and offers to show them. */
  completed?: number
  revealed?: boolean
  onReveal?: () => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(section?.name ?? '')
  const title = section ? section.name || t('Untitled section') : t('No section')

  async function commit() {
    setRenaming(false)
    if (section && name.trim() && name.trim() !== section.name) await renameSection(section.id, name)
    else setName(section?.name ?? '')
  }
  const [menuOpen, setMenuOpen] = useState(false)
  const startRename = () => { if (section) { setName(section.name); setRenaming(true) } }
  const groups = section ? sectionMenuGroups(title, { first, last, layout, count }, {
    section,
    rename: startRename,
    move: (d) => reorderSection(section.id, d),
    remove: () => deleteSection(section.id),
  }) : []
  const onRowKey = useRowMenuShortcut({
    openMenu: () => setMenuOpen(true),
    rename: startRename,
    move: (to) => { if (section && (to === -1 || to === 1)) act(reorderSection(section.id, to)) },
  })

  const titleNode = renaming && section ? (
    <input className="ui-input max-w-xs py-0.5 text-body font-semibold" autoFocus aria-label={t('Section name')} value={name}
      onChange={(e) => setName(e.target.value)} onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') void commit()
        if (e.key === 'Escape') { e.stopPropagation(); setName(section.name); setRenaming(false) }
      }} />
  ) : section && (section.icon || section.color) ? (
    <span className="inline-flex min-w-0 items-center gap-1.5"><SectionMark section={section} /><span className="truncate">{title}</span></span>
  ) : title

  // One group header for every list (task-list-presentation "Group headers"); a
  // section with only completed tasks keeps its header with "n completed" and Show.
  return (
    <div data-section-heading={section?.id ?? ''} onKeyDown={editable && section && !renaming ? onRowKey : undefined}>
      <ListGroupHeader title={titleNode} count={count} tone={section ? 'default' : 'muted'}
        collapsed={collapsed} onToggle={onToggleCollapse}
        note={count === 0 && completed > 0 ? (
          <span className="flex items-center gap-1">
            {t('{completed} completed', { completed })}
            <button type="button" className="rounded-chip px-1.5 py-0.5 text-meta text-accent hover:bg-sunken dark:hover:bg-raised" aria-expanded={revealed} onClick={onReveal} data-reveal-completed>
              {revealed ? t('Hide') : t('Show')}
            </button>
          </span>
        ) : undefined}
        actions={(editable && (onAdd || section)) ? (
          <>
            {editable && onAdd && (
              <IconButton icon="plus" size="sm" label={t('Add a task to {title}', { title })} onClick={onAdd} />
            )}
            {editable && section && (
              <ActionMenu label={t('Section menu for {title}', { title })} title={title} groups={groups} width="sm:w-60" open={menuOpen} onOpenChange={setMenuOpen}
                triggerClassName="ui-btn ui-btn--ghost ui-btn--sm touch-target px-1.5 py-0.5 text-meta" />
            )}
          </>
        ) : undefined} />
    </div>
  )
}

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
      <QuickAdd onAdd={onAdd} projects={projects} labels={labels} hideHint autoFocus placeholder={t('Add a task to {sectionName}…', { sectionName })} label={t('Add a task to {sectionName}', { sectionName })} />
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
      <button type="button" className={`ui-btn ui-btn--ghost ui-btn--sm text-meta text-muted ${layout === 'board' ? 'w-72 shrink-0 justify-start self-start' : ''}`} onClick={() => setOpen(true)}>
        {t('+ Add section')}
      </button>
    )
  }
  return (
    <form onSubmit={(e) => void submit(e)} className={layout === 'board' ? 'w-72 shrink-0 self-start' : 'max-w-xs'}>
      <input className="ui-input py-1 text-body" autoFocus placeholder={t('Section name, Enter to add')} aria-label={t('New section name')} value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); setName('') } }}
        onBlur={() => { if (!name.trim()) setOpen(false) }} />
    </form>
  )
}
