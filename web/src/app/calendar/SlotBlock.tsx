// A calendar slot on the Day and Week grid (OpenSpec change calendar-slots, design
// D4, D5): one block from its start for its length with a stack icon, its title
// and a count, then a checklist of its tasks, as many rows as fit and "+n" for the
// rest. The rows are task rows for the keyboard (arrows move, Space completes,
// Enter opens) and can be dragged out; the body moves the slot and its lower
// edge changes its length. The title or the count opens the slot's popover.
import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { DAY_MINUTES, MIN_BLOCK_MINUTES } from '../../lib/calendar'
import { formatMinutes } from '../../lib/duration'
import { t } from '../../lib/i18n'
import type { PlacedBlock } from '../../lib/layout'
import { slotCount, slotName, slotTitleRequest, type SlotView } from '../../lib/slots'
import type { Task } from '../../lib/types'
import { hueFor, Icon, Popover } from '../../ui'
import type { useCalendarDrag } from '../calendarDrag'
import { completeWithUndo } from '../undoable'
import { act } from '../actionError'
import { formatTime, PX_PER_MIN, RESIZE_ZONE_PX } from './grid'
import { SlotDetails } from './SlotDetails'

type DragStart = ReturnType<typeof useCalendarDrag>['start']

/** One checklist row's height in pixels (a 24 px target). */
const ROW_PX = 24
/** The header line's height in pixels. */
const HEAD_PX = 22

export function SlotBlock({ view, b, past, selected, dragging, dropTarget, onSelect, onOpen, onDragStart }: {
  view: SlotView
  b: PlacedBlock
  past: boolean
  selected: boolean
  dragging: boolean
  /** A task is dragged over the slot: dropping adds it. */
  dropTarget: boolean
  onSelect: (id: string) => void
  onOpen: (id: string) => void
  onDragStart: DragStart
}) {
  const [open, setOpen] = useState(false)
  const [editTitle, setEditTitle] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const rowsRef = useRef<HTMLUListElement>(null)
  const [active, setActive] = useState(0)
  const request = slotTitleRequest.use()
  useEffect(() => {
    if (request !== view.slot.id) return
    slotTitleRequest.set(null)
    setEditTitle(true)
    setOpen(true)
  }, [request, view.slot.id])

  const top = b.start * PX_PER_MIN
  const height = Math.max(MIN_BLOCK_MINUTES * PX_PER_MIN, (Math.min(b.end, DAY_MINUTES) - b.start) * PX_PER_MIN)
  const rows = [...view.open, ...view.done]
  const room = Math.max(0, Math.floor((height - HEAD_PX - 2) / ROW_PX))
  const fits = rows.length <= room ? rows.length : Math.max(0, room - 1)
  const more = rows.length - fits
  const name = slotName(view.slot)
  const times = `${formatTime(view.start)}–${formatTime(view.end === DAY_MINUTES ? DAY_MINUTES - 1 : view.end)}`
  const count = slotCount(view)

  const focusRow = (i: number) => {
    const els = rowsRef.current?.querySelectorAll<HTMLElement>('[data-slot-row]')
    if (!els?.length) return
    const n = Math.max(0, Math.min(els.length - 1, i))
    setActive(n)
    els[n].focus()
  }
  const rowKey = (e: KeyboardEvent, task: Task, i: number) => {
    const stop = () => { e.preventDefault(); e.stopPropagation() }
    if (e.key === 'ArrowDown' && !e.shiftKey && !e.altKey) { stop(); focusRow(i + 1) }
    else if (e.key === 'ArrowUp' && !e.shiftKey && !e.altKey) { stop(); focusRow(i - 1) }
    else if (e.key === ' ') { stop(); act(completeWithUndo(task.id, !task.completed_at)) }
    else if (e.key === 'Enter') { stop(); onOpen(task.id) }
  }

  return (
    <div
      data-cal-id={view.key}
      data-slot={view.slot.id}
      data-drop-slot={view.slot.id}
      data-overlap={b.overlap || undefined}
      data-overfull={view.overfull || undefined}
      data-hue={hueFor(view.slot.color)}
      role="group"
      aria-label={t('Slot {title}, {times}, {count}', { title: name, times, count })}
      onPointerDown={(e) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const zone = Math.min(RESIZE_ZONE_PX, rect.height / 3)
        if (e.clientY >= rect.bottom - zone) onDragStart(e, { taskId: view.key, kind: 'resize', blockStart: view.start, blockDate: view.slot.date! })
        else onDragStart(e, { taskId: view.key, kind: 'move', grabOffset: e.clientY - rect.top })
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onSelect(view.key) }}
      className={`ui-block absolute z-10 flex cursor-grab touch-manipulation flex-col overflow-hidden px-1 ${past ? 'ui-block--past' : ''} ${selected ? 'ring-2 ring-accent' : ''} ${dropTarget ? 'ring-2 ring-accent ring-offset-1' : ''} ${dragging ? 'opacity-40' : ''}`} // tone-lint-allow: the dragged slot's ghost
      style={{ top, height, left: `calc(${(b.lane / b.lanes) * 100}% + 2px)`, width: `calc(${100 / b.lanes}% - 4px)` }}
    >
      <div className="flex min-h-[22px] shrink-0 items-center gap-1" onClick={() => onSelect(view.key)}>
        <button ref={anchor} type="button" data-slot-name={view.slot.id} aria-haspopup="dialog" aria-expanded={open}
          className="flex min-h-6 min-w-0 flex-1 items-center gap-1 rounded-chip text-left text-meta font-medium outline-none focus-visible:ring-2 focus-visible:ring-focus"
          onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onSelect(view.key); setOpen(true) }}
          onKeyDown={(e) => { if (e.key === 'ArrowDown' && rows.length) { e.preventDefault(); e.stopPropagation(); focusRow(0) } }}>
          <Icon name="layers" size="xs" className="shrink-0" />
          <span className="min-w-0 truncate">{name}</span>
          <span data-slot-count className={`ml-auto shrink-0 text-hint font-normal tabular-nums ${view.overfull ? 'text-warning' : ''}`}>{count}</span>
        </button>
        {b.overlap && <span data-overlap-marker className="shrink-0 text-warning" aria-hidden>⧉</span>}
      </div>
      {fits > 0 && (
        <ul ref={rowsRef} className="min-h-0 shrink-0" aria-label={t('Tasks in {title}', { title: name })}>
          {rows.slice(0, fits).map((task, i) => (
            <SlotRow key={task.id} task={task} tabIndex={i === Math.min(active, fits - 1) ? 0 : -1} onKeyDown={(e) => rowKey(e, task, i)}
              onFocus={() => setActive(i)} onOpen={onOpen} onDragStart={onDragStart} />
          ))}
        </ul>
      )}
      {/* Only where a row fits: a short slot opens its full list from the title. */}
      {more > 0 && room > 0 && (
        <button type="button" data-slot-more={more} className="inline-flex min-h-6 min-w-6 shrink-0 items-center justify-center self-start rounded-chip px-1 text-hint font-medium text-muted outline-none hover:text-strong focus-visible:ring-2 focus-visible:ring-focus"
          aria-label={t('{n} more tasks in {title}', { n: more, title: name })}
          onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setOpen(true) }}>
          +{more}
        </button>
      )}
      <div data-slot-resize aria-hidden className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize touch-none hover:bg-accent/30" />
      <Popover open={open} onClose={() => { setOpen(false); setEditTitle(false) }} anchor={anchor} label={name} align="start" width="sm:w-80" className="p-3">
        <SlotDetails view={view} editTitle={editTitle} onOpenTask={(id) => { setOpen(false); onOpen(id) }} onDone={() => { setOpen(false); setEditTitle(false) }} />
      </Popover>
    </div>
  )
}

/** One checklist row: 24 px, a check, the title and the estimate; drag it out to take it out. */
function SlotRow({ task, tabIndex, onKeyDown, onFocus, onOpen, onDragStart }: {
  task: Task
  tabIndex: number
  onKeyDown: (e: KeyboardEvent) => void
  onFocus: () => void
  onOpen: (id: string) => void
  onDragStart: DragStart
}) {
  const done = !!task.completed_at
  const title = task.title || t('Untitled')
  return (
    <li>
      <div data-slot-row={task.id} data-cal-id={task.id} role="checkbox" aria-checked={done} aria-label={title} tabIndex={tabIndex}
        className="flex h-6 cursor-grab items-center gap-1 rounded-chip px-0.5 text-meta outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-focus"
        onKeyDown={onKeyDown} onFocus={onFocus}
        onPointerDown={(e) => { e.stopPropagation(); if (!done) onDragStart(e, { taskId: task.id, kind: 'move' }) }}
        onDoubleClick={() => onOpen(task.id)}>
        <span aria-hidden data-slot-check className={`inline-flex h-3.5 w-3.5 shrink-0 cursor-pointer items-center justify-center rounded-full border ${done ? 'border-transparent bg-hue-solid text-on-accent' : 'border-current'}`}
          onClick={(e) => { e.stopPropagation(); act(completeWithUndo(task.id, !done)) }}>
          {done && <Icon name="check" size="xs" />}
        </span>
        <span className={`min-w-0 flex-1 truncate ${done ? 'text-faint line-through' : ''}`}>{title}</span>
        {task.estimate_minutes && !done ? <span className="shrink-0 text-hint tabular-nums">{formatMinutes(task.estimate_minutes)}</span> : null}
      </div>
    </li>
  )
}
