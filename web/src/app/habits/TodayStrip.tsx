// The Habits strip of Today (OpenSpec change habits-home, design D3): while Habits
// is on, the habits whose current occurrence is due today or earlier, as compact
// chips in part-of-the-day order, above Today's first group; a habit kept today stays
// as a filled chip until the day ends. One line, two at most below 768 px, the rest
// folded into a "+N" chip that opens the Habits screen. The heading folds it on this
// device. On the first load: no thread, no menu, no form.
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { continuedIds, habitRowsOf, isGraduated, isOpenHabit, threadDays } from '../../lib/habits'
import { t } from '../../lib/i18n'
import type { Project, Task } from '../../lib/types'
import { Icon, ListGroupHeader, useMediaQuery } from '../../ui'
import { act } from '../actionError'
import { navigate } from '../router'
import { habitHue } from './habitText'
import { checkInWithUndo } from './habitUndo'

/** The per-device key of the folded strip (in the list's collapse store). */
export const HABITS_STRIP_KEY = 'today:habits'

const PART_ORDER = (x: Task) => (x.day_part === 'morning' ? 0 : x.day_part === 'afternoon' ? 1 : x.evening ? 2 : 3)

export interface StripHabit { task: Task; kept: boolean }

/** The strip's habits (D3): due today or earlier and open, or kept today; in part-of-the-day order, then time and title. */
export function stripHabits(tasks: readonly Task[], today: string): StripHabit[] {
  const rowsOf = habitRowsOf(tasks)
  const continued = continuedIds(tasks)
  const out: StripHabit[] = []
  for (const x of tasks) {
    if (!isOpenHabit(x) || isGraduated(x) || continued.has(x.id) || !x.due) continue
    const last = threadDays(x, rowsOf(x), today).at(-1)
    const kept = last?.state === 'done' || last?.state === 'tiny'
    if (kept || x.due.date <= today) out.push({ task: x, kept })
  }
  return out.sort((a, b) => PART_ORDER(a.task) - PART_ORDER(b.task) || (a.task.due?.time ?? '99').localeCompare(b.task.due?.time ?? '99') || a.task.title.localeCompare(b.task.title))
}

export function TodayStrip({ tasks, projects, today, collapsed, onToggle }: {
  tasks: readonly Task[]
  projects: readonly Project[]
  today: string
  collapsed: boolean
  onToggle: () => void
}) {
  const habits = useMemo(() => stripHabits(tasks, today), [tasks, today])
  const colours = useMemo(() => new Map(projects.map((p) => [p.id, p.color])), [projects])
  const narrow = !useMediaQuery('(min-width: 48rem)')
  const box = useRef<HTMLUListElement>(null)
  const [cap, setCap] = useState<number | null>(null)
  const [width, setWidth] = useState(0)
  const key = habits.map((h) => `${h.task.id}:${h.kept}`).join(',')
  useLayoutEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [collapsed])
  // Measure with every chip drawn, then keep what fits on the allowed lines with room for "+N".
  useLayoutEffect(() => { setCap(null) }, [key, width, narrow])
  useLayoutEffect(() => {
    const el = box.current
    if (cap !== null || !el) return
    const items = [...el.querySelectorAll<HTMLElement>('[data-strip-chip]')]
    const tops = [...new Set(items.map((i) => i.offsetTop))].sort((a, b) => a - b)
    const lines = narrow ? 2 : 1
    if (tops.length <= lines) return
    const limit = tops[lines - 1]
    const fits = items.filter((i) => i.offsetTop <= limit).length
    setCap(Math.max(0, fits - 1))
  }, [cap, key, width, narrow])
  if (habits.length === 0) return null
  const shown = cap === null ? habits : habits.slice(0, cap)
  const more = habits.length - shown.length
  return (
    <section aria-label={t('Habits')} className="mb-2" data-today-habits>
      <ListGroupHeader title={t('Habits')} count={habits.filter((h) => !h.kept).length} countLabel={(n) => t('{n, plural, one {# habit to do} other {# habits to do}}', { n })}
        collapsed={collapsed} onToggle={onToggle} />
      {!collapsed && (
        <ul ref={box} className="flex flex-wrap gap-1.5 px-1 pt-1" data-strip>
          {shown.map(({ task, kept }) => {
            const title = task.title || t('Untitled')
            return (
              <li key={task.id} data-strip-chip={task.id} data-hue={habitHue(task, task.project_id ? colours.get(task.project_id) : null)}>
                <button type="button" disabled={kept} aria-label={kept ? t('{title}, done today', { title }) : t('Check in {title}', { title })}
                  onClick={() => act(checkInWithUndo(task.id, false))} data-kept={kept || undefined}
                  className={`flex min-h-8 max-w-56 items-center gap-1.5 rounded-full border px-2.5 text-meta transition-colors duration-(--duration-moment)
                    ${kept ? 'border-hue-solid bg-hue-solid text-surface' : 'border-default bg-surface text-default hover:bg-hue-soft'} focus-visible:outline-2 focus-visible:outline-focus`}>
                  <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-2 ${kept ? 'border-surface' : 'border-hue-solid'}`} aria-hidden="true">
                    {kept && <Icon name="check" size="xs" />}
                  </span>
                  <span className="truncate">{title}</span>
                </button>
              </li>
            )
          })}
          {more > 0 && (
            <li data-strip-chip="more">
              <button type="button" onClick={() => navigate({ view: 'habits' })} aria-label={t('{n, plural, one {# more habit} other {# more habits}}', { n: more })}
                className="flex min-h-8 items-center rounded-full border border-default px-2.5 text-meta text-muted hover:bg-sunken focus-visible:outline-2 focus-visible:outline-focus" data-strip-more>
                +{more}
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  )
}
