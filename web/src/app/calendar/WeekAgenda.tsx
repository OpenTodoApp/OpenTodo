import { dayLoad, formatLoad, type GridPrefs } from '../../lib/calendar'
import type { DayData } from '../../lib/calendarDays'
import { dateLocaleOf } from '../../lib/dates'
import { formatMinutes } from '../../lib/duration'
import { t } from '../../lib/i18n'
import type { Project, Task } from '../../lib/types'
import { hueFor } from '../../ui'
import { formatTime } from './grid'

/**
 * The Week below 640 px: the days listed vertically, each with its capacity, its
 * unscheduled tasks and its timed blocks in time order; no seven-column grid. The
 * same selection, keyboard order and panel as the grid.
 */
export function WeekAgenda({ days, today, prefs, tasks, taskMap, projectMap, selectedId, onSelect, onOpen }: {
  days: DayData[]
  today: string
  prefs: GridPrefs
  tasks: Task[]
  taskMap: Map<string, Task>
  projectMap: Map<string, Project>
  selectedId: string | null
  onSelect: (id: string) => void
  onOpen: (id: string) => void
}) {
  const row = (task: Task, time: string | null) => (
    <li key={task.id}>
      <button type="button" data-cal-id={task.id} data-agenda-task={task.id} onClick={() => onSelect(task.id)} onDoubleClick={() => onOpen(task.id)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onOpen(task.id) } }}
        className={`flex min-h-11 w-full items-center gap-2 rounded-control px-2 py-1 text-left text-body ${selectedId === task.id ? 'bg-accent-soft ring-1 ring-accent' : 'hover:bg-sunken dark:hover:bg-raised'} border-l-3 border-l-hue-solid`}
        data-hue={hueFor(task.project_id ? projectMap.get(task.project_id)?.color : null)}>
        <span className="w-14 shrink-0 font-mono text-meta text-muted">{time ?? t('all day')}</span>
        <span className="min-w-0 flex-1 truncate">{task.title || t('Untitled')}</span>
        {task.estimate_minutes ? <span className="shrink-0 font-mono text-hint text-muted">{formatMinutes(task.estimate_minutes)}</span> : null}
      </button>
    </li>
  )
  return (
    <div className="space-y-3 px-1 py-2" data-week-agenda>
      {days.map((d) => {
        const [y, m, dd] = d.date.split('-').map(Number)
        const name = new Intl.DateTimeFormat(dateLocaleOf(), { weekday: 'long' }).format(new Date(y, m - 1, dd))
        const load = dayLoad(tasks, d.date, prefs.dayLength)
        const blocks = d.layout.blocks.map((b) => ({ b, t: taskMap.get(b.id) })).filter((x): x is { b: typeof x.b; t: Task } => !!x.t)
        return (
          <section key={d.date} data-agenda-day={d.date} aria-labelledby={`agenda-${d.date}`}>
            <div className="flex items-baseline justify-between gap-2 border-b border-default px-2 pb-1">
              <h2 id={`agenda-${d.date}`} className={`text-body font-semibold ${d.date === today ? 'text-accent' : 'text-strong'}`}>{name} {dd}</h2>
              <span className={`font-mono text-hint ${load.over ? 'text-danger' : 'text-muted'}`} data-capacity data-over={load.over || undefined}>{formatLoad(load, prefs.dayLength)}</span>
            </div>
            {d.lane.length === 0 && blocks.length === 0
              ? <p className="px-2 py-2 text-meta text-faint">{t('Nothing planned')}</p>
              : (
                <ul className="mt-1 space-y-0.5">
                  {d.lane.map((tk) => row(tk, null))}
                  {blocks.map(({ b, t: item }) => row(item, formatTime(b.start)))}
                </ul>
              )}
          </section>
        )
      })}
    </div>
  )
}
