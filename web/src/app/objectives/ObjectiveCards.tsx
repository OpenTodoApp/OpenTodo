// Objective cards (OpenSpec change plan-objectives, design D3 and D4): one line
// each, a done checkbox and the title, edited in place. On a focused title Enter
// edits, Space toggles done, Delete asks in place before dropping (with Undo),
// Alt+Up/Down moves it; cards also reorder by drag, or with Move up and Move down
// from the handle shown on hover or focus (accessibility-aa D3). A group ends with Add while
// fewer than five are open. No dialog: every editor is inline.
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { t } from '../../lib/i18n'
import { MAX_OBJECTIVE_TITLE, OBJECTIVE_COUNTDOWN } from '../../lib/objectives'
import type { Objective } from '../../lib/types'
import { Button, MoveHandle, Tooltip } from '../../ui'

export interface ObjectiveActions {
  onToggle: (o: Objective, done: boolean) => void
  onRename: (o: Objective, title: string) => void
  onDrop: (o: Objective) => void
  onMove: (o: Objective, by: -1 | 1) => void
  onPlace: (id: string, to: number) => void
  onAdd: (period: string, title: string) => void
}

const DRAG_TYPE = 'application/x-opentodo-objective'

/** The one-line title input, counting down from 20 characters left. */
export function ObjectiveInput({ initial = '', label, onCommit, onCancel }: {
  initial?: string
  label: string
  onCommit: (title: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)
  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])
  const left = MAX_OBJECTIVE_TITLE - value.length
  const finish = (commit: boolean) => {
    if (done.current) return
    done.current = true
    if (commit && value.trim()) onCommit(value)
    else onCancel()
  }
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <input ref={ref} value={value} maxLength={MAX_OBJECTIVE_TITLE} aria-label={label} data-objective-input
        className="h-7 min-w-0 flex-1 rounded-control border border-input bg-surface px-2 text-body text-default focus-visible:outline-2 focus-visible:outline-focus"
        onChange={(e) => setValue(e.target.value.replace(/[\r\n]+/g, ' '))}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') { e.preventDefault(); finish(true) }
          if (e.key === 'Escape') { e.preventDefault(); finish(false) }
        }}
        onBlur={() => finish(true)} />
      {left <= OBJECTIVE_COUNTDOWN && (
        <span className={`shrink-0 text-meta tabular-nums ${left <= 5 ? 'text-danger' : 'text-muted'}`} aria-live="polite">
          <span aria-hidden="true">{left}</span>
          <span className="sr-only">{t('{n, plural, one {# character left} other {# characters left}}', { n: left })}</span>
        </span>
      )}
    </span>
  )
}

function ObjectiveCard({ o, index, count, readOnly, actions, dragging, onDragging, hintId }: {
  hintId?: string
  o: Objective
  index: number
  /** Cards in the group: Move up and Move down know the ends. */
  count: number
  readOnly?: boolean
  actions: ObjectiveActions
  dragging: string | null
  onDragging: (id: string | null) => void
}) {
  const [mode, setMode] = useState<'view' | 'edit' | 'confirm'>('view')
  const titleRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLButtonElement>(null)
  const done = !!o.done_at
  const title = o.title || t('Untitled')
  useEffect(() => { if (mode === 'confirm') dropRef.current?.focus() }, [mode])
  const back = () => { setMode('view'); requestAnimationFrame(() => titleRef.current?.focus()) }
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (readOnly) return
    let handled = true
    if (e.key === ' ') actions.onToggle(o, !done)
    else if (e.key === 'Delete' || e.key === 'Backspace') setMode('confirm')
    else if (e.altKey && e.key === 'ArrowUp') { actions.onMove(o, -1); requestAnimationFrame(() => titleRef.current?.focus()) }
    else if (e.altKey && e.key === 'ArrowDown') { actions.onMove(o, 1); requestAnimationFrame(() => titleRef.current?.focus()) }
    else handled = false
    if (handled) { e.preventDefault(); e.stopPropagation() }
    // Enter is the button's click: edit. Keep it from the page's own keys.
    if (e.key === 'Enter') e.stopPropagation()
  }
  return (
    <li data-objective={o.id} data-objective-done={done || undefined} data-drag-id="objective"
      className={`group flex min-h-9 items-center gap-2 rounded-control px-2 ${dragging === o.id ? 'bg-sunken' : ''} ${mode === 'view' ? 'hover:bg-sunken' : ''}`}
      draggable={!readOnly && mode === 'view'}
      onDragStart={(e) => { e.dataTransfer.setData(DRAG_TYPE, o.id); e.dataTransfer.effectAllowed = 'move'; onDragging(o.id) }}
      onDragEnd={() => onDragging(null)}
      onDragOver={(e) => { if (dragging && dragging !== o.id) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } }}
      onDrop={(e) => { const id = e.dataTransfer.getData(DRAG_TYPE); if (id && id !== o.id) { e.preventDefault(); actions.onPlace(id, index) } onDragging(null) }}>
      <input type="checkbox" checked={done} disabled={readOnly} data-objective-check
        aria-label={done ? t('Mark “{title}” not done', { title }) : t('Mark “{title}” done', { title })}
        className="h-4 w-4 shrink-0 rounded-chip border-input accent-(--ot-accent) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        onChange={() => actions.onToggle(o, !done)} />
      {mode === 'edit' ? (
        <ObjectiveInput initial={o.title} label={t('Objective')} onCancel={back} onCommit={(v) => { actions.onRename(o, v); back() }} />
      ) : mode === 'confirm' ? (
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2" role="group" aria-label={t('Drop “{title}”?', { title })}>
          <span className="min-w-0 truncate text-body text-default">{t('Drop “{title}”?', { title })}</span>
          <Button ref={dropRef} size="sm" variant="danger" data-objective-drop onClick={() => { setMode('view'); actions.onDrop(o) }}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); back() } }}>{t('Drop')}</Button>
          <Button size="sm" variant="ghost" onClick={back}>{t('Keep')}</Button>
        </span>
      ) : (
        <Tooltip label={title}><button ref={titleRef} type="button" aria-label={title} data-objective-title
          aria-describedby={readOnly ? undefined : hintId}
          className={`min-w-0 flex-1 truncate rounded-chip text-left text-body focus-visible:outline-2 focus-visible:outline-focus ${done ? 'text-muted line-through' : 'text-default'} ${readOnly ? 'cursor-default' : ''}`}
          onClick={() => { if (!readOnly) setMode('edit') }} onKeyDown={onKey}>{title}</button></Tooltip>
      )}
      {/* The card drags; with one pointer and no drag, its handle offers Move up and Move down
          (accessibility-aa D3, WCAG 2.5.7), shown on hover or focus like a row's actions. */}
      {!readOnly && mode === 'view' && count > 1 && (
        <MoveHandle label={t('Move {name}', { name: title })} first={index === 0} last={index === count - 1}
          onMove={(by) => actions.onMove(o, by)} className="hover-reveal text-faint" />
      )}
    </li>
  )
}

/** One period's cards: a heading, the cards in order, then Add or the limit note. */
export function ObjectiveGroup({ heading, dates, period, items, canAdd, readOnly, actions, children, id, hintId }: {
  /** The id of the keys hint the cards' titles point to. */
  hintId?: string
  heading: string
  /** The period's days ("2–8 Nov"), beside the heading. */
  dates?: string
  period: string
  items: readonly Objective[]
  canAdd: boolean
  readOnly?: boolean
  actions: ObjectiveActions
  /** Rows after the cards (the review's carry-over offers). */
  children?: ReactNode
  id: string
}) {
  const [adding, setAdding] = useState(false)
  const [dragging, setDragging] = useState<string | null>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  return (
    <section aria-labelledby={id} data-objective-group={period} className="min-w-0">
      <h3 id={id} className="flex items-baseline gap-2 px-2 text-meta font-semibold text-muted">
        <span>{heading}</span>
        {dates && <span className="font-normal text-faint">{dates}</span>}
      </h3>
      {items.length > 0 && (
        <ul className="mt-1">
          {items.map((o, i) => <ObjectiveCard key={o.id} o={o} index={i} count={items.length} readOnly={readOnly} actions={actions} dragging={dragging} onDragging={setDragging} hintId={hintId} />)}
        </ul>
      )}
      {items.length === 0 && readOnly && <p className="mt-1 px-2 text-meta text-faint">{t('No objectives yet.')}</p>}
      {!readOnly && (adding ? (
        <div className="mt-1 flex min-h-9 items-center gap-2 px-2">
          <ObjectiveInput label={t('New objective for {period}', { period: heading })}
            onCancel={() => { setAdding(false); requestAnimationFrame(() => addRef.current?.focus()) }}
            onCommit={(v) => { actions.onAdd(period, v); setAdding(false); requestAnimationFrame(() => addRef.current?.focus()) }} />
        </div>
      ) : canAdd ? (
        <Button ref={addRef} size="sm" variant="ghost" icon="plus" className="mt-1" data-objective-add={period} onClick={() => setAdding(true)}>{t('Add')}</Button>
      ) : (
        <p className="mt-1 px-2 text-meta text-muted" data-objective-limit>{t('Five is plenty. Finish or drop one first.')}</p>
      ))}
      {children}
    </section>
  )
}
