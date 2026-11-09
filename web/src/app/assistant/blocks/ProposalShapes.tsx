// A proposal in its own shape (OpenSpec change assistant-generative-ui D5): the
// item area of the review card as a calendar, an outline or a map. Every item keeps
// its checkbox; the head, the counts, Enter, Esc and "changed since proposed" stay
// in ChangeSetReview. Lazy chunk.
import type { ReactNode } from 'react'
import type { Review, ReviewItem } from '../../../lib/assistant'
import { useBlockTasks, useDatedTasks, useDayLength } from '../../../lib/assistantBlockData'
import { calendarDays, placedDate, type ProposalShape } from '../../../lib/assistantShape'
import { t } from '../../../lib/i18n'
import type { Task } from '../../../lib/types'
import { Icon } from '../../../ui'
import { LocationMap } from '../../locations/LocationMap'
import { AgendaDays, type AgendaItem } from './CalendarBlock'

type Toggle = (index: number, checked: boolean) => void

const marks = (item: ReviewItem) => [item.state === 'stale' ? t('(changed since proposed)') : '', item.shared ? t('(shared project)') : '', item.edited ? t('(edited)') : ''].filter(Boolean).join(' ')
const labelOf = (item: ReviewItem) => `${item.title}${item.lines.length ? ': ' + item.lines.join('; ') : ''}${marks(item) ? ` ${marks(item)}` : ''}`

/** One item with its checkbox, for the outline and the map. */
function CheckRow({ item, index, onToggle, depth = 0, children }: { item: ReviewItem; index: number; onToggle: Toggle; depth?: number; children?: ReactNode }) {
  return (
    <li data-review-item={item.change.entityId}>
      <label className="flex items-start gap-2 py-1 pr-3 text-body hover:bg-hover" style={{ paddingLeft: `${0.75 + depth * 1.25}rem` }}>
        <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-(--ot-accent)" checked={item.checked} aria-label={labelOf(item)} onChange={(e) => onToggle(index, e.target.checked)} />
        <span className={`min-w-0 flex-1 user-text ${item.checked ? '' : 'text-muted'}`}>{item.title}</span>
        {item.state === 'stale' && <span className="rounded-control border border-warning px-1 text-hint font-medium text-on-warning-soft">{t('changed since proposed')}</span>}
      </label>
      {children}
    </li>
  )
}

/** The days the changes land on, with the tasks already there and the proposed ones marked. */
function CalendarShape({ review, onToggle }: { review: Review; onToggle: Toggle }) {
  const days = calendarDays(review.items)
  const existing = useDatedTasks(days)
  const rows = useBlockTasks(review.items.map((i) => i.change.entityId))
  const dayLength = useDayLength()
  if (!existing || !rows) return null
  const proposedIds = new Set(review.items.map((i) => i.change.entityId))
  const items: AgendaItem[] = existing.filter((tk) => !proposedIds.has(tk.id)).map((task) => ({ task }))
  review.items.forEach((item, index) => {
    const p = item.change.patch
    const base = rows[index] ?? ({ id: item.change.entityId, title: String(p.title ?? '') } as Task)
    const due = (p.due as Task['due'] | undefined) ?? { date: placedDate(item)! }
    items.push({ task: { ...base, ...p, due } as Task, proposed: true, check: { checked: item.checked, label: labelOf(item), onChange: (c) => onToggle(index, c) } })
  })
  return <AgendaDays days={days} items={items} dayLength={dayLength} />
}

/** The new project with its new sections and tasks as a tree; other changes after it. */
function OutlineShape({ review, onToggle }: { review: Review; onToggle: Toggle }) {
  const indexed = review.items.map((item, index) => ({ item, index }))
  const project = indexed.find(({ item }) => item.change.entity === 'project' && item.change.create)!
  const pid = project.item.change.entityId
  const inProject = (x: { item: ReviewItem }) => x.item.change.patch.project_id === pid
  const sections = indexed.filter((x) => x.item.change.entity === 'section' && inProject(x))
  const tasks = indexed.filter((x) => x.item.change.entity === 'task' && x.item.change.create && inProject(x))
  const taskIds = new Set(tasks.map((x) => x.item.change.entityId))
  const tree = (parent: string | null, section: string | null, depth: number): ReactNode => {
    const level = tasks.filter(({ item }) => {
      const p = item.change.patch
      const parentId = p.parent_id && taskIds.has(String(p.parent_id)) ? String(p.parent_id) : null
      return parentId === parent && (parent !== null || (p.section_id ?? null) === section)
    })
    if (!level.length) return null
    return <ul>{level.map((x) => <CheckRow key={x.index} item={x.item} index={x.index} onToggle={onToggle} depth={depth}>{tree(x.item.change.entityId, null, depth + 1)}</CheckRow>)}</ul>
  }
  const placed = new Set([project, ...sections, ...tasks].map((x) => x.index))
  const others = indexed.filter((x) => !placed.has(x.index))
  return (
    <div className="py-1" data-proposal-outline>
      <ul>
        <CheckRow item={project.item} index={project.index} onToggle={onToggle}>
          {tree(null, null, 1)}
          {sections.length > 0 && (
            <ul>
              {sections.map((s) => (
                <CheckRow key={s.index} item={s.item} index={s.index} onToggle={onToggle} depth={1}>{tree(null, s.item.change.entityId, 2)}</CheckRow>
              ))}
            </ul>
          )}
        </CheckRow>
      </ul>
      {others.length > 0 && (
        <>
          <p className="border-t border-soft px-3 pt-2 text-meta font-medium text-muted">{t('Other changes')}</p>
          <ul>{others.map((x) => <CheckRow key={x.index} item={x.item} index={x.index} onToggle={onToggle} />)}</ul>
        </>
      )}
    </div>
  )
}

/** The places the changes set, on the map, with the items as a numbered list. */
function MapShape({ review, onToggle }: { review: Review; onToggle: Toggle }) {
  const points = review.items.flatMap((item, i) => {
    const loc = item.change.patch.location as { lat?: number; lon?: number; name?: string } | null | undefined
    return loc && typeof loc.lat === 'number' && typeof loc.lon === 'number' ? [{ lat: loc.lat, lon: loc.lon, label: `${i + 1}. ${item.title}` }] : []
  })
  return (
    <div data-proposal-map>
      <LocationMap label={t('{n, plural, one {Map, # place} other {Map, # places}}', { n: points.length })} className="h-48 w-full border-b border-default" points={points} />
      <ol>
        {review.items.map((item, index) => (
          <CheckRow key={index} item={item} index={index} onToggle={onToggle}>
            <p className="flex items-center gap-1 pb-1 pl-9 text-meta text-muted user-text"><Icon name="map-pin" size="xs" />{String((item.change.patch.location as { name?: string } | null)?.name ?? '')}</p>
          </CheckRow>
        ))}
      </ol>
    </div>
  )
}

export default function ProposalShapeView({ shape, review, onToggle }: { shape: ProposalShape; review: Review; onToggle: Toggle }) {
  if (shape === 'calendar') return <div data-proposal-calendar><CalendarShape review={review} onToggle={onToggle} /></div>
  if (shape === 'outline') return <OutlineShape review={review} onToggle={onToggle} />
  if (shape === 'map') return <MapShape review={review} onToggle={onToggle} />
  return null
}
