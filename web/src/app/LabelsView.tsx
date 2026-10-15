// Labels: the overview (`g l`), the sidebar rows, the label menu and the edit panel
// (OpenSpec change labels-and-menus, group 5). Every write goes through lib/labels,
// so it works offline and converges like any other edit.
import { useLiveQuery } from 'dexie-react-hooks'
import { keysOf } from '../lib/shortcuts'
import { Kbd } from './shortcuts/Kbd'
import { type FormEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../lib/db'
import { beginDrag } from '../lib/dnd'
import {
  LabelExistsError, activeLabels, countOpenByLabel, createLabel, deleteLabel, duplicateLabelIds, labelKey, labelUsage,
  mergeLabels, moveLabelTo, reorderLabel, updateLabel,
} from '../lib/labels'
import { visibleTasks } from '../lib/trash'
import type { Label } from '../lib/types'
import { Badge, Button, PageBody, PageHeader } from '../ui'
import { ComboboxPanel } from '../ui'
import { Icon } from '../ui'
import { EmptyState } from '../ui'
import { HUES, hueFor } from '../ui'
import { ActionMenu, useConfirm, type ActionGroup, type ConfirmSpec } from './menus/ActionMenu'
import { useRowMenuShortcut } from './menus/useRowMenuShortcut'
import { Popover } from './overlay'
import { navigate, type Route } from './router'

const tasksText = (n: number) => `${n} ${n === 1 ? 'task' : 'tasks'}`

/** Labels in sidebar order with per-label open counts (same project filter as the views). */
export function useLabelData() {
  const labels = useLiveQuery(() => db.labels.toArray().then(activeLabels), [], [] as Label[])
  const counts = useLiveQuery(async () => {
    // Same rule as TaskListView: tasks of archived projects and of trashed projects are hidden.
    const hidden = new Set((await db.projects.filter((p) => !p.deleted_at && p.archived).toArray()).map((p) => p.id))
    const open = (await visibleTasks()).filter((t) => !t.completed_at && (!t.project_id || !hidden.has(t.project_id)))
    return countOpenByLabel(open)
  }, [], new Map<string, number>())
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
      <input className="input" autoFocus placeholder="Label name" aria-label="New label name" value={name}
        onChange={(e) => { setName(e.target.value); setError(null) }}
        onKeyDown={(e) => e.key === 'Escape' && onDone()} onBlur={() => !name && onDone()} />
      {error && (
        <p className="mt-1 text-xs text-danger">
          {error.message}{error.id && <>. <button type="button" className="underline" onMouseDown={(e) => e.preventDefault()} onClick={() => navigate({ view: 'label', id: error.id! })}>Open it</button></>}
        </p>
      )}
    </form>
  )
}

/** The confirmation for merging `source` into `target`, naming both and the tasks that change. */
export function mergeConfirm(source: Label, target: Label): ConfirmSpec {
  return {
    title: `Merge “${source.name}” into “${target.name}”?`,
    body: async () => {
      const n = await labelUsage(source.id)
      return `${tasksText(n)} carrying “${source.name}” will carry “${target.name}” instead, and “${source.name}” is deleted on all your devices.`
    },
    confirmLabel: 'Merge',
    onConfirm: async () => {
      await mergeLabels(source.id, target.id)
      navigate({ view: 'label', id: target.id })
    },
  }
}

/** The delete confirmation, with the number of tasks that lose the label. */
export function deleteConfirm(label: Label): ConfirmSpec {
  return {
    title: `Delete label “${label.name}”?`,
    body: async () => {
      const n = await labelUsage(label.id)
      return n ? `It is removed from ${tasksText(n)}. The tasks themselves stay.` : 'No task carries it.'
    },
    confirmLabel: 'Delete label',
    onConfirm: () => deleteLabel(label.id),
  }
}

/** The label menu as data (labels-and-menus 5.1). */
export function labelMenuGroups(label: Label, labels: Label[], a: { edit: () => void; rename: () => void; move: (to: -1 | 1) => unknown }): ActionGroup[] {
  const i = labels.findIndex((l) => l.id === label.id)
  const others = labels.filter((l) => l.id !== label.id)
  return [
    { items: [
      { kind: 'action', id: 'edit', label: 'Edit…', icon: 'palette', onSelect: a.edit },
      { kind: 'action', id: 'rename', label: 'Rename', icon: 'pencil', shortcut: 'F2', onSelect: a.rename },
    ] },
    { items: [
      { kind: 'action', id: 'up', label: 'Move up', icon: 'arrow-up', shortcut: 'Alt+↑', disabled: i <= 0, reason: 'Already first', onSelect: () => a.move(-1) },
      { kind: 'action', id: 'down', label: 'Move down', icon: 'arrow-down', shortcut: 'Alt+↓', disabled: i < 0 || i === labels.length - 1, reason: 'Already last', onSelect: () => a.move(1) },
    ] },
    { items: [
      { kind: 'picker', id: 'merge', label: 'Merge into', icon: 'merge', tone: 'danger', disabled: others.length === 0, reason: 'There is no other label', picker: {
        title: 'Merge into', placeholder: 'Find a label…', source: others, getKey: (l: Label) => l.id, getLabel: (l: Label) => l.name,
        rankContext: 'label-merge', renderLeading: (l: Label) => <span data-hue={hueFor(l.color)} className="inline-block h-2.5 w-2.5 rounded-full bg-hue-solid" />,
        onPick: (target: Label) => mergeConfirm(label, target),
      } },
      { kind: 'confirm', id: 'delete', label: 'Delete label', icon: 'trash-2', tone: 'danger', confirm: deleteConfirm(label) },
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
    if (!n.trim()) return 'A label needs a name'
    const other = labels.find((l) => l.id !== label.id && labelKey(l.name) === labelKey(n))
    return other ? `A label named “${other.name}” already exists` : null
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
    void updateLabel(label.id, { color: next.hex })
    swatches.current?.querySelector<HTMLButtonElement>(`[data-hue-option="${next.name}"]`)?.focus()
  }
  return (
    <Popover open onClose={onClose} anchor={anchor} label={`Edit label ${label.name}`} width="sm:w-80" className="p-3" align="start">
      <div className="space-y-4" data-testid="label-edit">
        <section className="space-y-2">
          <h3 className="text-hint font-semibold uppercase tracking-wide text-faint">Appearance</h3>
          <label className="block text-meta">
            <span className="mb-1 block text-muted">Name</span>
            <input className="input" value={name} aria-invalid={!!error} aria-describedby={error ? `label-name-error-${label.id}` : undefined}
              onChange={(e) => { setName(e.target.value); setError(null) }}
              onBlur={() => void saveName()} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void saveName() } }} />
            {error && <span id={`label-name-error-${label.id}`} role="alert" className="mt-1 block text-meta text-danger">{error}. The name stays “{label.name}”.</span>}
          </label>
          <div ref={swatches} role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-1" onKeyDown={onSwatchKey}>
            {HUES.map((h) => (
              <button key={h.name} type="button" role="radio" aria-checked={h.name === current} aria-label={h.name} data-hue-option={h.name}
                tabIndex={h.name === current ? 0 : -1}
                className="touch-target inline-flex h-9 w-9 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus"
                onClick={() => void updateLabel(label.id, { color: h.hex })}>
                <span data-hue={h.name} className={`block h-6 w-6 rounded-full bg-hue-solid ${h.name === current ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface' : ''}`} />
              </button>
            ))}
          </div>
          {!HUES.some((h) => h.hex === label.color.toLowerCase()) && (
            <p className="text-meta text-muted">Shown as {current}, the nearest palette colour. Pick one to store it.</p>
          )}
        </section>
        <section className="space-y-1">
          <h3 className="text-hint font-semibold uppercase tracking-wide text-faint">Organize</h3>
          <div className="grid grid-cols-2 gap-1">
            <button type="button" className="btn-ghost justify-between text-meta" onClick={() => void reorderLabel(label.id, -1)}>Move up <kbd className="kbd">Alt+↑</kbd></button>
            <button type="button" className="btn-ghost justify-between text-meta" onClick={() => void reorderLabel(label.id, 1)}>Move down <kbd className="kbd">Alt+↓</kbd></button>
            <button type="button" className="btn-ghost justify-between text-meta" onClick={() => void reorderLabel(label.id, 'top')}>To the top</button>
            <button type="button" className="btn-ghost justify-between text-meta" onClick={() => void reorderLabel(label.id, 'bottom')}>To the bottom</button>
          </div>
        </section>
        <section className="space-y-1 border-t border-default pt-3">
          <h3 className="text-hint font-semibold uppercase tracking-wide text-danger">Danger zone</h3>
          {merging ? (
            <div className="space-y-1">
              <button type="button" className="btn-ghost text-meta" onClick={() => setMerging(false)}><Icon name="arrow-left" /> Back</button>
              <ComboboxPanel label="Merge into" placeholder="Find a label…" source={others} getKey={(l) => l.id} getLabel={(l) => l.name} rankContext="label-merge"
                onPick={(t) => { setMerging(false); onClose(); confirm.ask(mergeConfirm(label, t)) }} />
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary text-meta" disabled={others.length === 0} onClick={() => setMerging(true)}><Icon name="merge" /> Merge into…</button>
              <button type="button" className="btn-danger text-meta" onClick={() => { onClose(); confirm.ask(deleteConfirm(label)) }}><Icon name="trash-2" /> Delete label…</button>
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
        if (current) void moveLabelTo(label.id, current.zone === 'before' ? { before: current.id } : { after: current.id })
      },
      onEnd: () => { current = null; setDrop(null) },
    })
  }
  return { drop, start }
}

export function LabelRow({ label, labels, count, duplicate, route, drop, onDragStart }: {
  label: Label
  labels: Label[]
  count?: number
  duplicate: boolean
  route: Route
  drop?: LabelDrop
  onDragStart?: (e: ReactPointerEvent, label: Label) => void
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
    setAnnounce(`${label.name} moved to position ${index + 1} of ${labels.length}`)
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
  const move = (to: -1 | 1 | 'top' | 'bottom') => { refocus.current = true; void reorderLabel(label.id, to) }
  const onKeyDown = useRowMenuShortcut({ openMenu: () => setMenuOpen(true), rename: startRename, move })
  const groups = labelMenuGroups(label, labels, { edit: () => setPanelOpen(true), rename: startRename, move })

  return (
    <div ref={row} data-label-row={label.id} data-drop-target={`label:${label.id}`} data-active={active || undefined}
      className={`group relative rounded-md ${active ? 'bg-accent-soft' : 'hover:bg-sunken dark:hover:bg-raised'}`}>
      {drop?.id === label.id && <span aria-hidden="true" className={`pointer-events-none absolute inset-x-1 h-0.5 rounded bg-accent ${drop.zone === 'before' ? '-top-px' : '-bottom-px'}`} />}
      <div className="flex items-center gap-1 pr-1">
        {onDragStart && (
          <span className="hover-reveal flex cursor-grab touch-none items-center pl-1 text-faint" aria-hidden="true" title="Drag to reorder (or Alt+↑ / Alt+↓)"
            onPointerDown={(e) => onDragStart(e, label)} data-label-handle>
            <Icon name="grip-vertical" size="xs" />
          </span>
        )}
        {editing ? (
          <input className="input my-0.5 ml-1 py-0.5" autoFocus aria-label="Label name" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => void save()}
            onKeyDown={(e) => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') { e.stopPropagation(); setName(label.name); setEditing(false) } }} />
        ) : (
          <button data-label-open onClick={() => navigate({ view: 'label', id: label.id })} onDoubleClick={startRename} onKeyDown={onKeyDown}
            className={`flex min-w-0 flex-1 items-center gap-2 px-1.5 py-1.5 text-left text-sm ${active ? 'font-medium text-on-accent-soft' : 'text-muted'}`}>
            <span data-hue={hueFor(label.color)} className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-hue-solid" />
            <span className="flex-1 truncate">{label.name}</span>
            {duplicate && <Badge hue="yellow" title="Another label has this name. Merge them from the menu or the banner on the labels page.">duplicate</Badge>}
            {count ? <span className="text-xs text-faint" aria-label={`${count} open ${count === 1 ? 'task' : 'tasks'}`}>{count}</span> : null}
          </button>
        )}
        <ActionMenu label={`Menu for label ${label.name}`} title={label.name} groups={groups} open={menuOpen} onOpenChange={setMenuOpen}
          triggerClassName="hover-reveal touch-target rounded px-1.5 py-0.5 text-faint hover:bg-sunken dark:hover:bg-raised" />
      </div>
      {error && <p className="px-2 pb-1 text-xs text-danger">{error}</p>}
      <span role="status" aria-live="polite" className="sr-only">{announce}</span>
      {panelOpen && <LabelEditPanel label={label} labels={labels} anchor={row} onClose={() => setPanelOpen(false)} />}
    </div>
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
      <PageHeader title="Labels" meta={labels.length} help="labels"
        actions={<Button variant="primary" size="sm" icon="plus" onClick={() => setAdding(true)}>New label</Button>} />
      {adding && <NewLabelForm onDone={() => setAdding(false)} className="mb-3 max-w-xs" />}
      {source && target && (
        <div role="note" className="mb-3 flex flex-wrap items-center gap-2 rounded-md bg-warning-soft px-3 py-2 text-xs text-on-warning-soft" data-testid="duplicate-banner">
          <span className="flex-1">
            {duplicates.size} labels share a name. Merge “{source.name}” into “{target.name}”?
          </span>
          <button type="button" className="btn-ghost text-xs" onClick={() => setSwapped((v) => !v)} aria-label="Swap which label is kept">Swap</button>
          <button type="button" className="btn-secondary text-xs" onClick={() => confirm.ask(mergeConfirm(source, target))}><Icon name="merge" /> Merge…</button>
        </div>
      )}
      <div className="space-y-0.5">
        {labels.map((l) => <LabelRow key={l.id} label={l} labels={labels} count={counts.get(l.id)} duplicate={duplicates.has(l.id)} route={route} drop={drop} onDragStart={start} />)}
      </div>
      {labels.length === 0 && !adding && (
        <EmptyState icon="tag" title="No labels yet" body={<>Labels group tasks across projects. Add one to a selected task with <Kbd k={keysOf('list.labels')} />, or create one here.</>}
          action={<button className="btn-primary text-xs" onClick={() => setAdding(true)}><Icon name="plus" /> New label</button>} />
      )}
      {confirm.element}
    </PageBody>
  )
}
