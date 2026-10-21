// Labels: the overview (`g l`), the sidebar rows, the label menu and the edit panel
// (OpenSpec change labels-and-menus, group 5). Every write goes through lib/labels,
// so it works offline and converges like any other edit.
import { keysOf } from '../lib/shortcuts'
import { Kbd } from './shortcuts/Kbd'
import { type FormEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useLabels, useProjects } from '../lib/localData'
import { beginDrag } from '../lib/dnd'
import {
  LabelExistsError, countOpenByLabel, createLabel, deleteLabel, duplicateLabelIds, labelKey, labelUsage,
  mergeLabels, moveLabelTo, reorderLabel, updateLabel,
} from '../lib/labels'
import { useOpenTasks } from '../lib/liveTasks'
import type { Label } from '../lib/types'
import { Badge, Button, PageBody, PageHeader, ReadAs, Popover } from '../ui'
import { ComboboxPanel } from '../ui'
import { Icon } from '../ui'
import { EmptyState } from '../ui'
import { HUES, hueFor } from '../ui'
import { ActionMenu, useConfirm, type ActionGroup, type ConfirmSpec } from './menus/ActionMenu'
import { useRowMenuShortcut } from './menus/useRowMenuShortcut'
import { navigate, type Route } from './router'
import { t } from '../lib/i18n'
import { act } from './actionError'
import { taskDrop } from './taskDrop'
import { favouriteEdges, moveFavourite, setFavourite } from '../lib/favourites'
import { useFavourites, useIsFavourite } from './useFavourites'
import { NamePrompt } from './NamePrompt'
import { pinItem } from './menus/pinItem'


/** Labels in sidebar order with per-label open counts (same project filter as the views). */
export function useLabelData() {
  const labels = useLabels()
  // Same rule as TaskListView: tasks of archived projects and of trashed projects are
  // hidden. The tasks come from the shared snapshot (large-list-performance D2).
  const projects = useProjects()
  const openTasks = useOpenTasks()
  const counts = useMemo(() => {
    const skip = new Set(projects.filter((p) => p.archived).map((p) => p.id))
    return countOpenByLabel(openTasks.filter((task) => !task.project_id || !skip.has(task.project_id)))
  }, [projects, openTasks])
  return { labels, counts, duplicates: duplicateLabelIds(labels) }
}

/** Inline "new label" form shared by the sidebar and the overview. */
export function NewLabelForm({ onDone, className = '' }: { onDone: () => void; className?: string }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<{ message: string; id?: string } | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return onDone()
    try {
      const id = await createLabel({ name })
      setName('')
      onDone()
      navigate({ view: 'label', id })
    } catch (err) {
      setError(err instanceof LabelExistsError ? { message: err.message, id: err.existing.id } : { message: err instanceof Error ? err.message : String(err) })
    }
  }
  return (
    <form onSubmit={(e) => void submit(e)} className={className}>
      <input className="ui-input" autoFocus placeholder={t('Label name')} aria-label={t('New label name')} value={name}
        onChange={(e) => { setName(e.target.value); setError(null) }}
        onKeyDown={(e) => e.key === 'Escape' && onDone()} onBlur={() => !name && onDone()} />
      {error && (
        <p className="mt-1 text-meta text-danger">
          {error.message}{error.id && <>. <button type="button" className="underline" onMouseDown={(e) => e.preventDefault()} onClick={() => navigate({ view: 'label', id: error.id! })}>{t('Open it')}</button></>}
        </p>
      )}
    </form>
  )
}

/** The confirmation for merging `source` into `target`, naming both and the tasks that change. */
export function mergeConfirm(source: Label, target: Label): ConfirmSpec {
  return {
    title: t('Merge “{source}” into “{target}”?', { source: source.name, target: target.name }),
    body: async () => {
      const n = await labelUsage(source.id)
      return t('{n, plural, one {# task carrying “{source}” will carry “{target}” instead, and “{source}” is deleted on all your devices.} other {# tasks carrying “{source}” will carry “{target}” instead, and “{source}” is deleted on all your devices.}}', { n, source: source.name, target: target.name })
    },
    confirmLabel: t('Merge'),
    onConfirm: async () => {
      await mergeLabels(source.id, target.id)
      navigate({ view: 'label', id: target.id })
    },
  }
}

/** The delete confirmation, with the number of tasks that lose the label. */
export function deleteConfirm(label: Label): ConfirmSpec {
  return {
    title: t('Delete label “{name}”?', { name: label.name }),
    body: async () => {
      const n = await labelUsage(label.id)
      return n ? t('{n, plural, one {It is removed from # task. The tasks themselves stay.} other {It is removed from # tasks. The tasks themselves stay.}}', { n }) : t('No task carries it.')
    },
    confirmLabel: t('Delete label'),
    onConfirm: () => deleteLabel(label.id),
  }
}

/**
 * The label menu as data (labels-and-menus 5.1). `pin` adds the checkable "Pin to sidebar"
 * (sidebar-favourites D3); `edges` replaces the label order for Move up and Move down when
 * the menu is opened from the Favourites group.
 */
export function labelMenuGroups(label: Label, labels: Label[], a: { edit: () => void; rename: () => void; move: (to: -1 | 1) => unknown; pin?: { checked: boolean; toggle: () => unknown } }, edges?: { first: boolean; last: boolean }): ActionGroup[] {
  const i = labels.findIndex((l) => l.id === label.id)
  const others = labels.filter((l) => l.id !== label.id)
  const first = edges ? edges.first : i <= 0
  const last = edges ? edges.last : i < 0 || i === labels.length - 1
  return [
    { items: [
      { kind: 'action', id: 'edit', label: t('Edit…'), icon: 'palette', onSelect: a.edit },
      { kind: 'action', id: 'rename', label: t('Rename'), icon: 'pencil', shortcut: 'F2', onSelect: a.rename },
    ] },
    ...(a.pin ? [{ items: [pinItem(a.pin.checked, a.pin.toggle)] }] : []),
    { items: [
      { kind: 'action', id: 'up', label: t('Move up'), icon: 'arrow-up', shortcut: 'Alt+↑', disabled: first, reason: t('Already first'), onSelect: () => a.move(-1) },
      { kind: 'action', id: 'down', label: t('Move down'), icon: 'arrow-down', shortcut: 'Alt+↓', disabled: last, reason: t('Already last'), onSelect: () => a.move(1) },
    ] },
    { items: [
      { kind: 'picker', id: 'merge', label: t('Merge into'), icon: 'merge', tone: 'danger', disabled: others.length === 0, reason: t('There is no other label'), picker: {
        title: t('Merge into'), placeholder: t('Find a label…'), source: others, getKey: (l: Label) => l.id, getLabel: (l: Label) => l.name,
        rankContext: 'label-merge', renderLeading: (l: Label) => <span data-hue={hueFor(l.color)} className="inline-block h-2.5 w-2.5 rounded-full bg-hue-solid" />,
        onPick: (target: Label) => mergeConfirm(label, target),
      } },
      { kind: 'confirm', id: 'delete', label: t('Delete label'), icon: 'trash-2', tone: 'danger', confirm: deleteConfirm(label) },
    ] },
  ]
}

/** Edit panel (labels-and-menus 5.2): name, colour, order and the destructive actions. */
export function LabelEditPanel({ label, labels, anchor, onClose }: { label: Label; labels: Label[]; anchor: React.RefObject<HTMLElement | null>; onClose: () => void }) {
  const [name, setName] = useState(label.name)
  const [error, setError] = useState<string | null>(null)
  const [merging, setMerging] = useState(false)
  const confirm = useConfirm()
  const current = hueFor(label.color)
  const others = labels.filter((l) => l.id !== label.id)
  const swatches = useRef<HTMLDivElement>(null)

  const nameError = (n: string): string | null => {
    if (!n.trim()) return t('A label needs a name')
    const other = labels.find((l) => l.id !== label.id && labelKey(l.name) === labelKey(n))
    return other ? t('A label named “{name}” already exists', { name: other.name }) : null
  }
  async function saveName() {
    const err = nameError(name)
    if (err) { setError(err); return }
    if (name.trim() === label.name) return
    try {
      await updateLabel(label.id, { name })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  function onSwatchKey(e: KeyboardEvent<HTMLDivElement>) {
    const i = HUES.findIndex((h) => h.name === current)
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const next = HUES[(i + delta + HUES.length) % HUES.length]
    act(updateLabel(label.id, { color: next.hex }))
    swatches.current?.querySelector<HTMLButtonElement>(`[data-hue-option="${next.name}"]`)?.focus()
  }
  return (
    <Popover open onClose={onClose} anchor={anchor} label={t('Edit label {name}', { name: label.name })} width="sm:w-80" className="p-3" align="start">
      <div className="space-y-4" data-testid="label-edit">
        <section className="space-y-2">
          <h3 className="text-hint font-semibold uppercase tracking-wide text-faint">{t('Appearance')}</h3>
          <label className="block text-meta">
            <span className="mb-1 block text-muted">{t('Name')}</span>
            <input className="ui-input" value={name} aria-invalid={!!error} aria-describedby={error ? `label-name-error-${label.id}` : undefined}
              onChange={(e) => { setName(e.target.value); setError(null) }}
              onBlur={() => void saveName()} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void saveName() } }} />
            {error && <span id={`label-name-error-${label.id}`} role="alert" className="mt-1 block text-meta text-danger">{t('{error}. The name stays “{name}”.', { error, name: label.name })}</span>}
          </label>
          <div ref={swatches} role="radiogroup" aria-label={t('Colour')} className="flex flex-wrap gap-1" onKeyDown={onSwatchKey}>
            {HUES.map((h) => (
              <button key={h.name} type="button" role="radio" aria-checked={h.name === current} aria-label={h.name} data-hue-option={h.name}
                tabIndex={h.name === current ? 0 : -1}
                className="touch-target inline-flex h-9 w-9 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus"
                onClick={() => act(updateLabel(label.id, { color: h.hex }))}>
                <span data-hue={h.name} className={`block h-6 w-6 rounded-full bg-hue-solid ${h.name === current ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface' : ''}`} />
              </button>
            ))}
          </div>
          {!HUES.some((h) => h.hex === label.color.toLowerCase()) && (
            <p className="text-meta text-muted">{t('Shown as {current}, the nearest palette colour. Pick one to store it.', { current })}</p>
          )}
        </section>
        <section className="space-y-1">
          <h3 className="text-hint font-semibold uppercase tracking-wide text-faint">{t('Organize')}</h3>
          <div className="grid grid-cols-2 gap-1">
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm justify-between text-meta" onClick={() => act(reorderLabel(label.id, -1))}>{t('Move up')} <kbd className="ui-kbd">Alt+↑</kbd></button>
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm justify-between text-meta" onClick={() => act(reorderLabel(label.id, 1))}>{t('Move down')} <kbd className="ui-kbd">Alt+↓</kbd></button>
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm justify-between text-meta" onClick={() => act(reorderLabel(label.id, 'top'))}>{t('To the top')}</button>
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm justify-between text-meta" onClick={() => act(reorderLabel(label.id, 'bottom'))}>{t('To the bottom')}</button>
          </div>
        </section>
        <section className="space-y-1 border-t border-default pt-3">
          <h3 className="text-hint font-semibold uppercase tracking-wide text-danger">{t('Danger zone')}</h3>
          {merging ? (
            <div className="space-y-1">
              <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm text-meta" onClick={() => setMerging(false)}><Icon name="arrow-left" /> {t('Back')}</button>
              <ComboboxPanel label={t('Merge into')} placeholder={t('Find a label…')} source={others} getKey={(l) => l.id} getLabel={(l) => l.name} rankContext="label-merge"
                onPick={(item) => { setMerging(false); onClose(); confirm.ask(mergeConfirm(label, item)) }} />
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm text-meta" disabled={others.length === 0} onClick={() => setMerging(true)}><Icon name="merge" /> {t('Merge into…')}</button>
              <button type="button" className="ui-btn ui-btn--danger ui-btn--sm text-meta" onClick={() => { onClose(); confirm.ask(deleteConfirm(label)) }}><Icon name="trash-2" /> {t('Delete label…')}</button>
            </div>
          )}
        </section>
      </div>
      {confirm.element}
    </Popover>
  )
}

/** Where a dragged label would land relative to a row. */
export type LabelDrop = { id: string; zone: 'before' | 'after' } | null

/** The drop for a pointer at `y` over a row spanning [top, top + height]: the halves place before / after. */
export function labelDropAt(id: string, y: number, top: number, height: number): LabelDrop {
  return { id, zone: height > 0 && y - top < height / 2 ? 'before' : 'after' }
}

/** Nudges the nearest scrollable ancestor while dragging near its top or bottom edge. */
function autoScroll(row: Element | null, y: number) {
  let el = row?.parentElement ?? null
  while (el && !(el.scrollHeight > el.clientHeight && /(auto|scroll)/.test(getComputedStyle(el).overflowY))) el = el.parentElement
  if (!el) return
  const r = el.getBoundingClientRect()
  if (y < r.top + 32) el.scrollBy(0, -12)
  else if (y > r.bottom - 32) el.scrollBy(0, 12)
}

/** Pointer drag of label rows (labels-and-menus 5.4), handle-only, via moveLabelTo. */
export function useLabelDrag() {
  const [drop, setDrop] = useState<LabelDrop>(null)
  function start(e: ReactPointerEvent, label: Label) {
    let current: LabelDrop = null
    beginDrag(e, {
      label: label.name,
      onMove: (target, _x, y) => {
        const id = target?.startsWith('label:') ? target.slice('label:'.length) : null
        const row = id ? document.querySelector(`[data-label-row="${CSS.escape(id)}"]`) : null
        autoScroll(row, y)
        const next = id && id !== label.id && row ? labelDropAt(id, y, row.getBoundingClientRect().top, row.getBoundingClientRect().height) : null
        if (next?.id !== current?.id || next?.zone !== current?.zone) { current = next; setDrop(next) }
      },
      onDrop: () => {
        if (current) act(moveLabelTo(label.id, current.zone === 'before' ? { before: current.id } : { after: current.id }))
      },
      onEnd: () => { current = null; setDrop(null) },
    })
  }
  return { drop, start }
}

export function LabelRow({ label, labels, count, duplicate, route, drop, onDragStart, findActive = false, quiet = false }: {
  label: Label
  labels: Label[]
  count?: number
  duplicate: boolean
  route: Route
  drop?: LabelDrop
  onDragStart?: (e: ReactPointerEvent, label: Label) => void
  /** The active match of the sidebar's find field (sidebar-groups). */
  findActive?: boolean
  /** The sidebar's row: the count is in the accessible name only (quiet-sidebar D2); the overview shows it. */
  quiet?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(label.name)
  const [error, setError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [announce, setAnnounce] = useState('')
  const row = useRef<HTMLDivElement>(null)
  const refocus = useRef(false)
  const active = route.view === 'label' && route.id === label.id
  const index = labels.findIndex((l) => l.id === label.id)

  // After a keyboard move the row re-renders in its new place: keep focus on it and announce where it went.
  useEffect(() => {
    if (!refocus.current) return
    refocus.current = false
    row.current?.querySelector<HTMLButtonElement>('[data-label-open]')?.focus()
    setAnnounce(t('{name} moved to position {n} of {count}', { name: label.name, n: index + 1, count: labels.length }))
  }, [index, labels.length, label.name])

  async function save() {
    setEditing(false)
    const n = name.trim()
    if (!n || n === label.name) return setName(label.name)
    try {
      await updateLabel(label.id, { name: n })
    } catch (err) {
      setName(label.name)
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  const startRename = () => { setName(label.name); setEditing(true) }
  const move = (to: -1 | 1 | 'top' | 'bottom') => { refocus.current = true; act(reorderLabel(label.id, to)) }
  const onKeyDown = useRowMenuShortcut({ openMenu: () => setMenuOpen(true), rename: startRename, move })
  const pinned = useIsFavourite('label', label.id)
  const groups = labelMenuGroups(label, labels, { edit: () => setPanelOpen(true), rename: startRename, move, pin: { checked: pinned, toggle: () => setFavourite('label', label.id, !pinned) } })

  return (
    <div ref={row} data-label-row={label.id} data-drop-target={`label:${label.id}`} data-task-drop={taskDrop.label(label.id)} data-active={active || undefined} data-find-active={findActive || undefined}
      className={`group relative rounded-control data-drop-active:ring-2 data-drop-active:ring-accent ${active ? 'bg-accent-soft' : 'hover:bg-sunken dark:hover:bg-raised'}${findActive ? ' ring-2 ring-focus' : ''}`}>
      {drop?.id === label.id && <span aria-hidden="true" className={`pointer-events-none absolute inset-x-1 h-0.5 rounded-control bg-accent ${drop.zone === 'before' ? '-top-px' : '-bottom-px'}`} />}
      <div className="flex items-center gap-1 pr-1">
        {onDragStart && (
          <span className="hover-reveal flex cursor-grab touch-none items-center pl-1 text-faint" aria-hidden="true"
            onPointerDown={(e) => onDragStart(e, label)} data-label-handle>
            <Icon name="grip-vertical" size="xs" />
          </span>
        )}
        {editing ? (
          <input className="ui-input my-0.5 ml-1 py-0.5" autoFocus aria-label={t('Label name')} value={name} onChange={(e) => setName(e.target.value)} onBlur={() => void save()}
            onKeyDown={(e) => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') { e.stopPropagation(); setName(label.name); setEditing(false) } }} />
        ) : (
          <button data-label-open onClick={() => navigate({ view: 'label', id: label.id })} onDoubleClick={startRename} onKeyDown={onKeyDown}
            className={`flex min-w-0 flex-1 items-center gap-2 px-1.5 py-1.5 text-left text-body ${active ? 'font-medium text-on-accent-soft' : 'text-muted'}`}>
            <span data-hue={hueFor(label.color)} className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-hue-solid" />
            <span className="flex-1 truncate">{label.name}</span>
            {duplicate && <Badge hue="yellow" title={t('Another label has this name. Merge them from the menu or the banner on the labels page.')}>{t('duplicate')}</Badge>}
            {count && quiet ? <span className="sr-only" data-open-count={count}>{`, ${t('{n, plural, one {# open task} other {# open tasks}}', { n: count })}`}</span> : null}
            {count && !quiet ? <span className="text-meta text-faint" data-open-count={count}><ReadAs label={t('{n, plural, one {# open task} other {# open tasks}}', { n: count })}>{count}</ReadAs></span> : null}
          </button>
        )}
        <ActionMenu label={t('Menu for label {name}', { name: label.name })} title={label.name} groups={groups} open={menuOpen} onOpenChange={setMenuOpen}
          triggerClassName="hover-reveal touch-target rounded-control px-1.5 py-0.5 text-faint hover:bg-sunken dark:hover:bg-raised" />
      </div>
      {error && <p className="px-2 pb-1 text-meta text-danger">{error}</p>}
      <span role="status" aria-live="polite" className="sr-only">{announce}</span>
      {panelOpen && <LabelEditPanel label={label} labels={labels} anchor={row} onClose={() => setPanelOpen(false)} />}
    </div>
  )
}

/**
 * A label's menu outside its row (sidebar-favourites): the label view header and the
 * Favourites group. Rename asks in a dialog, Edit opens the panel beside the trigger;
 * from the Favourites group (`within`) Move up and Move down reorder the favourites.
 */
export function LabelMenu({ label, within, className = '' }: { label: Label; within?: 'favourites'; className?: string }) {
  const labels = useLabels()
  const favourites = useFavourites()
  const pinned = useIsFavourite('label', label.id)
  const [renaming, setRenaming] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const anchor = useRef<HTMLSpanElement>(null)
  const inFavourites = within === 'favourites'
  const groups = labelMenuGroups(label, labels, {
    edit: () => setPanelOpen(true),
    rename: () => setRenaming(true),
    move: (d) => (inFavourites ? moveFavourite('label', label.id, d) : reorderLabel(label.id, d)),
    pin: { checked: pinned, toggle: () => setFavourite('label', label.id, !pinned) },
  }, inFavourites ? favouriteEdges(favourites, 'label', label.id) : undefined)
  return (
    <span ref={anchor} className="inline-flex">
      {inFavourites ? (
        <ActionMenu label={t('Menu for label {name}', { name: label.name })} title={label.name} groups={groups}
          triggerClassName={`touch-target rounded-control px-1.5 py-0.5 text-faint hover:bg-sunken dark:hover:bg-raised ${className}`} />
      ) : (
        // The page header's menu (app-shell "Page template"), styled like the project header's.
        <ActionMenu label={t('Label menu')} title={label.name} groups={groups} trigger={<Icon name="ellipsis" size="md" />}
          triggerClassName="ui-btn ui-btn--ghost ui-btn--sm touch-target px-2 py-1.5" />
      )}
      {renaming && (
        <NamePrompt title={t('Rename label')} label={t('Label name')} initial={label.name} onCancel={() => setRenaming(false)}
          onSubmit={async (name) => { await updateLabel(label.id, { name }); setRenaming(false) }} />
      )}
      {panelOpen && <LabelEditPanel label={label} labels={labels} anchor={anchor} onClose={() => setPanelOpen(false)} />}
    </span>
  )
}

/** The first pair of labels sharing a name, for the duplicate banner. */
export function duplicatePair(labels: Label[]): [Label, Label] | null {
  const seen = new Map<string, Label>()
  for (const l of labels) {
    const k = labelKey(l.name)
    const other = seen.get(k)
    if (other) return [other, l]
    seen.set(k, l)
  }
  return null
}

/** The `g l` overview (labels-and-menus 5.3): a list you manage. */
export function LabelsView({ route }: { route: Route }) {
  const { labels, counts, duplicates } = useLabelData()
  const [adding, setAdding] = useState(false)
  const [swapped, setSwapped] = useState(false)
  const confirm = useConfirm()
  const { drop, start } = useLabelDrag()
  const pair = useMemo(() => duplicatePair(labels), [labels])
  const [source, target] = pair ? (swapped ? [pair[1], pair[0]] : pair) : [null, null]
  return (
    <PageBody width="form">
      <PageHeader title={t('Labels')} meta={labels.length} help="labels"
        actions={<Button variant="primary" size="sm" icon="plus" onClick={() => setAdding(true)}>{t('New label')}</Button>} />
      {adding && <NewLabelForm onDone={() => setAdding(false)} className="mb-3 max-w-xs" />}
      {source && target && (
        <div role="note" className="mb-3 flex flex-wrap items-center gap-2 rounded-control bg-warning-soft px-3 py-2 text-meta text-on-warning-soft" data-testid="duplicate-banner">
          <span className="flex-1">
            {t('{size} labels share a name. Merge “{name}” into “{name2}”?', { size: duplicates.size, name: source.name, name2: target.name })}
          </span>
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm text-meta" onClick={() => setSwapped((v) => !v)} aria-label={t('Swap which label is kept')}>{t('Swap')}</button>
          <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm text-meta" onClick={() => confirm.ask(mergeConfirm(source, target))}><Icon name="merge" /> {t('Merge…')}</button>
        </div>
      )}
      <div className="space-y-0.5">
        {labels.map((l) => <LabelRow key={l.id} label={l} labels={labels} count={counts.get(l.id)} duplicate={duplicates.has(l.id)} route={route} drop={drop} onDragStart={start} />)}
      </div>
      {labels.length === 0 && !adding && (
        <EmptyState icon="tag" title={t('No labels yet')} body={<>{t.rich('Labels group tasks across projects. Add one to a selected task with {kbd}, or create one here.', { kbd: <Kbd k={keysOf('list.labels')} /> })}</>}
          control={<button className="ui-btn ui-btn--primary ui-btn--sm text-meta" onClick={() => setAdding(true)}><Icon name="plus" /> {t('New label')}</button>} />
      )}
      {confirm.element}
    </PageBody>
  )
}
