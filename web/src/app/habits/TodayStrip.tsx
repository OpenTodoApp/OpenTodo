// Today's habits (OpenSpec changes habits-home D3, habits-polish D1): while Habits is
// on, one quiet line above Today's first group: a "Habits" link to the Habits screen,
// then each habit due today or earlier as a small ring in its hue and its title, in
// part-of-the-day order; a habit kept today keeps a filled ring until the day ends.
// The ring checks in, the title opens the habit. One line at every width; what does
// not fit folds into a "+N" link to Habits. No heading, count or fold. On the first
// load: no thread, no menu, no form.
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { continuedIds, habitRowsOf, isGraduated, isOpenHabit, threadDays } from '../../lib/habits'
import { t } from '../../lib/i18n'
import type { Project, Task } from '../../lib/types'
import { Icon } from '../../ui'
import { act } from '../actionError'
import { navigate } from '../router'
import { habitHue } from './habitText'
import { checkInWithUndo } from './habitUndo'

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

export function TodayStrip({ tasks, projects, today }: { tasks: readonly Task[]; projects: readonly Project[]; today: string }) {
  const habits = useMemo(() => stripHabits(tasks, today), [tasks, today])
  const colours = useMemo(() => new Map(projects.map((p) => [p.id, p.color])), [projects])
  const box = useRef<HTMLUListElement>(null)
  const [cap, setCap] = useState<number | null>(null)
  const [width, setWidth] = useState(0)
  const key = habits.map((h) => `${h.task.id}:${h.kept}`).join(',')
  const any = habits.length > 0
  useLayoutEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [any])
  // Measure with every habit drawn, then keep what fits on the one line with room for "+N".
  useLayoutEffect(() => { setCap(null) }, [key, width])
  useLayoutEffect(() => {
    const el = box.current
    if (cap !== null || !el) return
    const items = [...el.querySelectorAll<HTMLElement>('[data-strip-chip]')]
    const first = items[0]?.offsetTop
    if (first === undefined || items.every((i) => i.offsetTop === first)) return
    setCap(Math.max(0, items.filter((i) => i.offsetTop === first).length - 1))
  }, [cap, key, width])
  if (habits.length === 0) return null
  const shown = cap === null ? habits : habits.slice(0, cap)
  const more = habits.length - shown.length
  const link = 'rounded-control text-meta outline-none hover:text-default hover:underline focus-visible:outline-2 focus-visible:outline-focus'
  return (
    <section aria-label={t('Habits')} className="mb-3 flex min-h-8 items-center gap-3 px-2" data-today-habits>
      <button type="button" onClick={() => navigate({ view: 'habits' })} className={`shrink-0 font-medium text-muted ${link}`} data-strip-habits>{t('Habits')}</button>
      <ul ref={box} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 overflow-hidden" data-strip>
        {shown.map(({ task, kept }) => {
          const title = task.title || t('Untitled')
          return (
            <li key={task.id} data-strip-chip={task.id} data-hue={habitHue(task, task.project_id ? colours.get(task.project_id) : null)} className="flex min-w-0 max-w-48 items-center gap-1.5">
              <button type="button" disabled={kept} aria-label={kept ? t('{title}, done today', { title }) : t('Check in {title}', { title })}
                onClick={() => act(checkInWithUndo(task.id, false))} data-kept={kept || undefined} data-strip-check
                className={`touch-target flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-[1.5px] border-hue-solid transition-colors duration-(--duration-moment)
                  ${kept ? 'bg-hue-solid text-surface' : 'hover:bg-hue-soft'} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus`}>
                {kept && <Icon name="check" size="xs" />}
              </button>
              <button type="button" onClick={() => navigate({ view: 'habits', id: task.id })} data-strip-open
                className={`min-w-0 truncate ${kept ? 'text-muted' : 'text-default'} ${link}`}>{title}</button>
            </li>
          )
        })}
        {more > 0 && (
          <li data-strip-chip="more" className="shrink-0">
            <button type="button" onClick={() => navigate({ view: 'habits' })} aria-label={t('{n, plural, one {# more habit} other {# more habits}}', { n: more })}
              className={`text-muted tabular-nums ${link}`} data-strip-more>+{more}</button>
          </li>
        )}
      </ul>
    </section>
  )
}
