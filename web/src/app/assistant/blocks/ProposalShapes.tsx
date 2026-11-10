// A proposal in its own shape (OpenSpec change assistant-generative-ui D5): the
// item area of the review card as a calendar, an outline or a map. Every item keeps
// its checkbox and, when it has editable fields, the pencil with the list's editor
// (assistant-proposal-editing D2); in the calendar a proposed item drags, or moves
// with Alt+arrows, to another day (D1). The head, the counts, Enter, Esc and
// "changed since proposed" stay in ChangeSetReview. Also the before-and-after view
// (D3). Lazy chunk.
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { Review, ReviewItem } from '../../../lib/assistant'
import { useBlockTasks, useDatedTasks, useDayLength } from '../../../lib/assistantBlockData'
import { calendarDays, editableFields, placedDate, type ProposalShape } from '../../../lib/assistantShape'
import { moveEdits } from '../../../lib/assistantAmend'
import { addDaysISO, formatDate } from '../../../lib/dates'
import { t } from '../../../lib/i18n'
import type { Task } from '../../../lib/types'
import { Icon, IconButton } from '../../../ui'
import { useCalendarDrag } from '../../calendarDrag'
import { LocationMap } from '../../locations/LocationMap'
import { ItemEditor, type OnEdit } from '../ItemEditor'
import { AgendaDays, type AgendaItem } from './CalendarBlock'

type Toggle = (index: number, checked: boolean) => void

export interface ShapeEdits {
  onEdit?: OnEdit
  /** The item whose editor is open, one at a time across the card. */
  editing: number | null
  setEditing: (index: number | null) => void
}

const marks = (item: ReviewItem) => [item.state === 'stale' ? t('(changed since proposed)') : '', item.shared ? t('(shared project)') : '', item.edited ? t('(edited)') : '',
  item.turn === 'added' ? t('(added this turn)') : item.turn === 'changed' ? t('(changed this turn)') : ''].filter(Boolean).join(' ')
export const labelOf = (item: ReviewItem) => `${item.title}${item.lines.length ? ': ' + item.lines.join('; ') : ''}${marks(item) ? ` ${marks(item)}` : ''}`

/** The small marks after an item's title: changed since proposed, edited, added or changed this turn. */
export function ItemMarks({ item }: { item: ReviewItem }) {
  const mark = 'ml-1.5 rounded-control border px-1 text-hint font-medium'
  return (
    <>
      {item.state === 'stale' && <span className={`${mark} border-warning text-on-warning-soft`}>{t('changed since proposed')}</span>}
      {item.edited && <span className={`${mark} border-default text-muted`} data-edited>{t('edited')}</span>}
      {item.turn && <span className={`${mark} border-accent text-accent`} data-turn={item.turn}>{item.turn === 'added' ? t('added') : t('changed')}</span>}
    </>
  )
}

const canEdit = (item: ReviewItem, e: ShapeEdits) => !!e.onEdit && editableFields(item).length > 0

/** One item with its checkbox and pencil, for the outline and the map. */
function CheckRow({ item, index, onToggle, edits, depth = 0, children }: { item: ReviewItem; index: number; onToggle: Toggle; edits: ShapeEdits; depth?: number; children?: ReactNode }) {
  const open = edits.editing === index
  return (
    <li data-review-item={item.change.entityId}>
      <div className="flex items-start">
        <label className="flex min-w-0 flex-1 items-start gap-2 py-1 pr-3 text-body hover:bg-hover" style={{ paddingLeft: `${0.75 + depth * 1.25}rem` }}>
          <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-(--ot-accent)" checked={item.checked} aria-label={labelOf(item)} onChange={(e) => onToggle(index, e.target.checked)} />
          <span className={`min-w-0 flex-1 user-text ${item.checked ? '' : 'text-muted'}`}>{item.title}<ItemMarks item={item} /></span>
        </label>
        {canEdit(item, edits) && <IconButton icon="pencil" size="sm" className="touch-target mr-1 text-muted" label={t('Edit {title}', { title: item.title })} aria-expanded={open} onClick={() => edits.setEditing(open ? null : index)} data-edit-item />}
      </div>
      {open && edits.onEdit && <ItemEditor item={item} index={index} onEdit={edits.onEdit} onClose={() => edits.setEditing(null)} />}
      {children}
    </li>
  )
}

/** The days the changes land on, with the tasks already there and the proposed ones marked; proposed ones move by drag or Alt+arrows. */
function CalendarShape({ review, onToggle, edits }: { review: Review; onToggle: Toggle; edits: ShapeEdits }) {
  const days = calendarDays(review.items)
  const existing = useDatedTasks(days)
  const rows = useBlockTasks(review.items.map((i) => i.change.entityId))
  const dayLength = useDayLength()
  const scroller = useRef<HTMLElement | null>(null)
  const [moved, setMoved] = useState('')
  const indexOf = (taskId: string) => review.items.findIndex((i) => i.change.entity === 'task' && i.change.entityId === taskId)
  const move = (index: number, date: string) => {
    const item = review.items[index]
    const e = item && edits.onEdit ? moveEdits(item, date) : null
    if (!e) return
    edits.onEdit!(index, e)
    setMoved(t('Moved “{title}” to {date}.', { title: item.title, date: formatDate(date, 'long') }))
  }
  const { drag, start } = useCalendarDrag({ pxPerMinute: 1, scroller, onDrop: (taskId, target) => {
    if (target.type === 'lane' || target.type === 'slot') move(indexOf(taskId), target.date)
  } })
  if (!existing || !rows) return null
  const proposedIds = new Set(review.items.map((i) => i.change.entityId))
  const items: AgendaItem[] = existing.filter((tk) => !proposedIds.has(tk.id)).map((task) => ({ task }))
  review.items.forEach((item, index) => {
    const p = item.change.patch
    const base = rows[index] ?? ({ id: item.change.entityId, title: String(p.title ?? '') } as Task)
    const due = (p.due as Task['due'] | undefined) ?? { date: placedDate(item)! }
    const movable = !!edits.onEdit && !!moveEdits(item, addDaysISO(placedDate(item)!, 1))
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || e.shiftKey || e.ctrlKey || e.metaKey) return
      const step = e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : 0
      if (!step) return
      // Alt+arrows move the item here, not a task in the list behind the panel.
      e.preventDefault()
      e.stopPropagation()
      move(index, addDaysISO(placedDate(item)!, step))
    }
    const open = edits.editing === index
    items.push({ task: { ...base, ...p, due } as Task, proposed: true, check: { checked: item.checked, label: labelOf(item), onChange: (c) => onToggle(index, c) },
      edit: canEdit(item, edits) ? {
        title: item.title, open, onToggle: () => edits.setEditing(open ? null : index),
        mark: item.turn === 'added' ? t('added') : item.turn === 'changed' ? t('changed') : item.edited ? t('edited') : undefined,
        editor: <ItemEditor item={item} index={index} onEdit={edits.onEdit!} onClose={() => edits.setEditing(null)} />,
        ...(movable ? { onPointerDown: (e) => start(e, { taskId: item.change.entityId, kind: 'move' }), onKeyDown, dragging: drag?.taskId === item.change.entityId } : {}),
      } : undefined })
  })
  const dropDay = drag?.target && (drag.target.type === 'lane' || drag.target.type === 'slot') ? drag.target.date : null
  return (
    <>
      <AgendaDays days={days} items={items} dayLength={dayLength} dropDay={edits.onEdit ? dropDay : undefined} />
      <p className="sr-only" aria-live="polite" data-proposal-moved>{moved}</p>
    </>
  )
}

/** The new project with its new sections and tasks as a tree; other changes after it. */
function OutlineShape({ review, onToggle, edits }: { review: Review; onToggle: Toggle; edits: ShapeEdits }) {
  const indexed = review.items.map((item, index) => ({ item, index }))
  const project = indexed.find(({ item }) => item.change.entity === 'project' && item.change.create)!
  const pid = project.item.change.entityId
  const inProject = (x: { item: ReviewItem }) => x.item.change.patch.project_id === pid
  const sections = indexed.filter((x) => x.item.change.entity === 'section' && inProject(x))
  const tasks = indexed.filter((x) => x.item.change.entity === 'task' && x.item.change.create && inProject(x))
  const taskIds = new Set(tasks.map((x) => x.item.change.entityId))
  // What the tree draws; everything else is listed after it, so every item keeps its checkbox.
  const drawn = new Set<number>([project.index, ...sections.map((s) => s.index)])
  const tree = (parent: string | null, section: string | null, depth: number): ReactNode => {
    const level = tasks.filter(({ item }) => {
      const p = item.change.patch
      const parentId = p.parent_id && taskIds.has(String(p.parent_id)) ? String(p.parent_id) : null
      return parentId === parent && (parent !== null || (p.section_id ?? null) === section)
    })
    if (!level.length) return null
    for (const x of level) drawn.add(x.index)
    return <ul>{level.map((x) => <CheckRow key={x.index} item={x.item} index={x.index} onToggle={onToggle} edits={edits} depth={depth}>{tree(x.item.change.entityId, null, depth + 1)}</CheckRow>)}</ul>
  }
  const loose = tree(null, null, 1)
  const bySection = sections.map((s) => ({ s, children: tree(null, s.item.change.entityId, 2) }))
  const others = indexed.filter((x) => !drawn.has(x.index))
  return (
    <div className="py-1" data-proposal-outline>
      <ul>
        <CheckRow item={project.item} index={project.index} onToggle={onToggle} edits={edits}>
          {loose}
          {bySection.length > 0 && (
            <ul>
              {bySection.map(({ s, children }) => (
                <CheckRow key={s.index} item={s.item} index={s.index} onToggle={onToggle} edits={edits} depth={1}>{children}</CheckRow>
              ))}
            </ul>
          )}
        </CheckRow>
      </ul>
      {others.length > 0 && (
        <>
          <p className="border-t border-soft px-3 pt-2 text-meta font-medium text-muted">{t('Other changes')}</p>
          <ul>{others.map((x) => <CheckRow key={x.index} item={x.item} index={x.index} onToggle={onToggle} edits={edits} />)}</ul>
        </>
      )}
    </div>
  )
}

/** The places the changes set, on the map, with the items as a numbered list. */
function MapShape({ review, onToggle, edits }: { review: Review; onToggle: Toggle; edits: ShapeEdits }) {
  const points = review.items.flatMap((item, i) => {
    const loc = item.change.patch.location as { lat?: number; lon?: number; name?: string } | null | undefined
    return loc && typeof loc.lat === 'number' && typeof loc.lon === 'number' ? [{ lat: loc.lat, lon: loc.lon, label: `${i + 1}. ${item.title}` }] : []
  })
  return (
    <div data-proposal-map>
      <LocationMap label={t('{n, plural, one {Map, # place} other {Map, # places}}', { n: points.length })} className="h-48 w-full border-b border-default" points={points} />
      <ol>
        {review.items.map((item, index) => (
          <CheckRow key={index} item={item} index={index} onToggle={onToggle} edits={edits}>
            <p className="flex items-center gap-1 pb-1 pl-9 text-meta text-muted user-text"><Icon name="map-pin" size="xs" />{String((item.change.patch.location as { name?: string } | null)?.name ?? '')}</p>
          </CheckRow>
        ))}
      </ol>
    </div>
  )
}

export default function ProposalShapeView({ shape, review, onToggle, edits }: { shape: ProposalShape; review: Review; onToggle: Toggle; edits: ShapeEdits }) {
  if (shape === 'calendar') return <div data-proposal-calendar><CalendarShape review={review} onToggle={onToggle} edits={edits} /></div>
  if (shape === 'outline') return <OutlineShape review={review} onToggle={onToggle} edits={edits} />
  if (shape === 'map') return <MapShape review={review} onToggle={onToggle} edits={edits} />
  return null
}

export { BeforeAfter } from './BeforeAfter'
