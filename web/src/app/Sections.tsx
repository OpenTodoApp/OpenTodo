// Section headings, per-section quick add and "Add section" (OpenSpec `board-view`).
// Shared by the grouped list and the board columns. Every write goes through
// lib/sections, so all of it works offline and converges like any other edit.
import { CatalogueIcon, HUES, hueFor, Icon, IconButton, IconPicker, isCatalogueIcon, ListGroupHeader } from '../ui'
import { hueName } from '../lib/colourNames'
import { ActionMenu, type ActionGroup, type ActionItem } from './menus/ActionMenu'
import { sectionFlowItem } from './menus/flowMenu'
import { useMethodMode } from '../lib/method/mode'
import { useProjects } from '../lib/localData'
import { colourPickerSpec, iconPickerSpec } from './menus/stylePickers'
import { useRowMenuShortcut } from './menus/useRowMenuShortcut'
import { type FormEvent, type KeyboardEvent, useRef, useState } from 'react'
import { createTask } from '../lib/ops'
import { preferredPlacement } from '../lib/userPrefs'
import { selectTask } from './signals'
import { addTasksUndoable } from '../lib/pasteTasks'
import { showBulkToast } from './bulk/toastStore'
import { createSection, deleteSection, renameSection, reorderSection, setSectionStyle } from '../lib/sections'
import type { Label, Project, Section } from '../lib/types'
import { QuickAdd, type QuickAddInput } from './QuickAdd'
import { t } from '../lib/i18n'
import { act } from './actionError'

/** The section menu as data (labels-and-menus 3.1). */
export function sectionMenuGroups(title: string, o: { first: boolean; last: boolean; layout: 'list' | 'board'; count: number },
  a: { rename: () => void; move: (delta: -1 | 1) => unknown; remove: () => unknown; section?: Section; flow?: ActionItem | null }): ActionGroup[] {
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
    { items: [{ kind: 'action', id: 'rename', label: t('Rename'), icon: 'pencil', shortcut: 'F2', onSelect: a.rename }, ...style, ...(a.flow ? [a.flow] : [])] },
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

export function SectionHeader({ section, count, layout, editable, first, last, collapsed, onToggleCollapse, onAdd, completed = 0, revealed = false, onReveal, onFold }: {
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
  /** On a board: "Fold column" in the column menu, for every role and "No section" too (board-polish D2). */
  onFold?: () => void
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
  // "Flow…" (project-flow-modes D7): for whoever may rename the section.
  const mode = useMethodMode()
  const project = useProjects().find((p) => p.id === section?.project_id)
  const fold: ActionGroup[] = onFold ? [{ items: [{ kind: 'action', id: 'fold', label: t('Fold column'), icon: 'panel-left-close', shortcut: 'z', onSelect: onFold }] }] : []
  const groups = [...fold, ...(section && editable ? sectionMenuGroups(title, { first, last, layout, count }, {
    section,
    flow: sectionFlowItem(section, project, { mode, canEdit: editable }),
    rename: startRename,
    move: (d) => reorderSection(section.id, d),
    remove: () => deleteSection(section.id),
  }) : [])]
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
      <ListGroupHeader title={titleNode} count={count} countTone={layout === 'board' ? 'muted' : 'faint'} bar={layout !== 'board'} kind={section ? 'named' : 'generated'}
        collapsed={collapsed} onToggle={onToggleCollapse}
        note={count === 0 && completed > 0 ? (
          <span className="flex items-center gap-1">
            {t('{completed} completed', { completed })}
            <button type="button" className="rounded-chip px-1.5 py-0.5 text-meta text-accent hover:bg-sunken dark:hover:bg-raised" aria-expanded={revealed} onClick={onReveal} data-reveal-completed>
              {revealed ? t('Hide') : t('Show')}
            </button>
          </span>
        ) : undefined}
        actions={((editable && (onAdd || section)) || groups.length > 0) ? (
          <>
            {editable && onAdd && (
              <IconButton icon="plus" size="sm" label={t('Add a task to {title}', { title })} onClick={onAdd} />
            )}
            {groups.length > 0 && (
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
  const root = useRef<HTMLDivElement>(null)
  const onAdd = async ({ project_id, ...rest }: QuickAddInput) => {
    // A #project typed in the line wins; the section only applies inside this project.
    const target = project_id ?? project.id
    // Top or bottom of the section or column (add-position D3).
    const placement = await preferredPlacement()
    const id = await createTask({ ...rest, placement, project_id: target, section_id: target === project.id ? sectionId : null })
    // Out of sight in a long section or column: say where it went (add-position D5).
    const list = root.current?.closest<HTMLElement>('[data-list-page]')
    // Loaded with the first add: not needed on first load (web/bundle-budget.json).
    if (target === project.id && list) void import('./task-list/announceAdded').then((m) => m.announceIfOutOfSight(id, { list: sectionName, placement, root: list, select: (x) => selectTask.request(x) }))
  }
  // A pasted list (paste-to-tasks D3): every line in this section unless it names a #project; one batch, one Undo.
  const onAddMany = async (inputs: QuickAddInput[]) => {
    const placement = await preferredPlacement()
    const added = await addTasksUndoable(inputs.map(({ project_id, ...rest }) => {
      const target = project_id ?? project.id
      return { ...rest, project_id: target, section_id: target === project.id ? sectionId : null }
    }), { placement })
    showBulkToast(added.label, added.undoId)
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }
  return (
    <div ref={root} className="px-1 py-1" onKeyDown={onKeyDown} onBlur={(e) => {
      // Focus moving into the paste offer (an overlay) is not leaving the add row.
      const to = e.relatedTarget as Element | null
      if (to?.closest?.('[data-overlay-root]')) return
      if (!e.currentTarget.contains(to) && !(e.target as HTMLInputElement).value) onClose()
    }}>
      <QuickAdd onAdd={onAdd} onAddMany={onAddMany} projects={projects} labels={labels} hideHint autoFocus placeholder={t('Add a task to {sectionName}…', { sectionName })} label={t('Add a task to {sectionName}', { sectionName })} />
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
    // On the board, a dashed column the height of the board (precision-boards-timeline D4).
    if (layout === 'board') return (
      <button type="button" className="ui-column-add" data-add-section onClick={() => setOpen(true)}>
        <Icon name="plus" size="sm" />{t('Add a section')}
      </button>
    )
    return (
      <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm text-meta text-muted" onClick={() => setOpen(true)}>
        {t('+ Add section')}
      </button>
    )
  }
  return (
    <form onSubmit={(e) => void submit(e)} className={layout === 'board' ? 'ui-column-add' : 'max-w-xs'}>
      <input className="ui-input py-1 text-body" autoFocus placeholder={t('Section name, Enter to add')} aria-label={t('New section name')} value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); setName('') } }}
        onBlur={() => { if (!name.trim()) setOpen(false) }} />
    </form>
  )
}
