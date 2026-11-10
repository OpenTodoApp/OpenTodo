// A project's timeline in an answer (OpenSpec change assistant-project-blocks, spec
// "Project view blocks"): the open tasks as the timeline's bars, from start to
// deadline or due day (lib/timeline's spans, the same bar styles, late tone, past
// part and deadline diamond), on an axis fitted to the block so it never scrolls
// sideways, with today marked. Read-only: nothing drags or resizes, and the
// timeline's keyboard scope is not taken. A row opens its task. Lazy chunk.
import type { AssistantBlock } from '../../../lib/assistantBlocks'
import { useBlockTimeline, type TimelineLine } from '../../../lib/assistantBlockData'
import { addDaysISO, daysBetweenISO, formatDate, formatDateRange, logicalToday } from '../../../lib/dates'
import { t } from '../../../lib/i18n'
import { hueFor, Icon } from '../../../ui'
import { openTaskPanel } from '../../panel'
import { navigate } from '../../router'

/** The most rows a block draws; the rest are counted. */
const MAX_ROWS = 15
/** The widest axis, in days: a longer project is cut to the weeks around today. */
const MAX_DAYS = 91

/** The axis: the bars' days and today, at most MAX_DAYS from two weeks before today. */
function axisOf(lines: readonly TimelineLine[], today: string): { from: string; days: number } {
  let from = today
  let to = addDaysISO(today, 6)
  for (const l of lines) {
    if (l.span.from < from) from = l.span.from
    if (l.span.to > to) to = l.span.to
  }
  if (daysBetweenISO(from, to) + 1 > MAX_DAYS) {
    const early = addDaysISO(today, -14)
    if (from < early) from = early
    if (daysBetweenISO(from, to) + 1 > MAX_DAYS) to = addDaysISO(from, MAX_DAYS - 1)
  }
  return { from, days: daysBetweenISO(from, to) + 1 }
}

export default function TimelineBlock({ block }: { block: Extract<AssistantBlock, { kind: 'timeline' }> }) {
  const today = logicalToday()
  const data = useBlockTimeline(block.id, today)
  if (!data) return null
  if (!data.project) return <p className="p-3 text-meta text-muted">{t('Removed')}</p>
  const lines = data.lines.slice(0, MAX_ROWS)
  const ax = axisOf(lines, today)
  const pct = (iso: string) => (Math.min(Math.max(daysBetweenISO(ax.from, iso), 0), ax.days) / ax.days) * 100
  const todayAt = ((daysBetweenISO(ax.from, today) + 0.5) / ax.days) * 100
  const last = addDaysISO(ax.from, ax.days - 1)
  const hue = hueFor(data.project.color)
  const more = data.lines.length - lines.length
  return (
    <div className="space-y-2 p-3" data-assistant-timeline>
      <p className="flex min-w-0 items-center gap-1.5 text-body font-semibold">
        <Icon name="calendar-range" size="sm" className="shrink-0 text-muted" />
        <span className="truncate user-text">{data.project.name}</span>
      </p>
      {lines.length === 0 ? (data.undated === 0 && <p className="text-meta text-faint">{t('No open tasks in this project.')}</p>) : (
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3">
          {/* The axis: its first and last day, today's pill on its day. */}
          <span aria-hidden="true" />
          <div aria-hidden="true" className="relative mb-1 flex h-5 items-center justify-between text-hint tabular-nums text-faint">
            <span>{formatDate(ax.from, 'compact')}</span><span>{formatDate(last, 'compact')}</span>
            <span data-today-mark className="absolute top-0 -translate-x-1/2 rounded-chip bg-accent px-1.5 font-medium leading-5 text-on-accent" style={{ left: `${todayAt}%` }}>{t('Today')}</span>
          </div>
          <ul className="contents" aria-label={t('Timeline')}>
            {lines.map(({ task, span }) => {
              const left = pct(span.from)
              const width = Math.max(pct(addDaysISO(span.to, 1)) - left, 100 / ax.days)
              const past = !span.late && span.to < today
              const range = span.from === span.to ? formatDate(span.from, 'long') : formatDateRange(span.from, span.to, { month: 'long', day: 'numeric' })
              const late = span.late ? t('{n, plural, one {# day late} other {# days late}}', { n: span.lateBy }) : ''
              return (
                <li key={task.id} className="contents" data-timeline-row={task.id} data-late={span.late || undefined}>
                  {/* The visible title is the button's name; the dates follow it as hidden text. */}
                  <button type="button" className="flex min-h-8 min-w-0 items-center text-left text-body hover:underline" onClick={() => openTaskPanel(task.id)}>
                    <span className="truncate user-text">{task.title || t('Untitled')}</span>
                    <span className="sr-only">, {range}{late ? `, ${late}` : ''}</span>
                  </button>
                  <div aria-hidden="true" className="relative min-h-8">
                    <span className="absolute inset-y-0 w-px bg-accent" style={{ left: `${todayAt}%` }} />
                    <span data-bar={task.id} data-hue={hue} className={`ui-block ui-block--row absolute top-1/2 h-4 -translate-y-1/2 ${span.late ? 'ui-block--late' : ''} ${past ? 'ui-block--past' : ''}`}
                      style={{ left: `${left}%`, width: `${width}%` }} />
                    {span.deadlineAt && span.deadlineAt >= ax.from && span.deadlineAt <= last && (
                      <span data-deadline-marker className={`absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] ${span.late ? 'bg-danger' : 'bg-warning'}`}
                        style={{ left: `${((daysBetweenISO(ax.from, span.deadlineAt) + 0.5) / ax.days) * 100}%` }} />
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {(more > 0 || data.undated > 0) && (
        <p className="text-meta text-muted">
          {[more > 0 ? t('{n, plural, one {# more task} other {# more tasks}}', { n: more }) : '', data.undated > 0 ? t('{n, plural, one {# task without dates} other {# tasks without dates}}', { n: data.undated }) : ''].filter(Boolean).join(' · ')}
        </p>
      )}
      <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm -ml-2 gap-1" onClick={() => navigate({ view: 'project', id: block.id })}>
        <Icon name="arrow-right" size="sm" />{t('Open project')}
      </button>
    </div>
  )
}
