// The Habits screen (OpenSpec change habits-home, design D9): every open habit by
// part of the day (Morning, Afternoon, This Evening, then Any time), ordered by time
// and title, then a folded Graduated group. One title row of chrome; rendered from
// the device's rows only, offline too. While Habits is not on, the address says so.
import { useMemo, useState } from 'react'
import { continuedIds, habitRowsOf, habitStats, isGraduated, isOpenHabit, keptDays } from '../../lib/habits'
import { resume } from '../../lib/habitActions'
import { useHabitsEnabled } from '../../lib/habitPrefs'
import { t } from '../../lib/i18n'
import { useLiveTasks } from '../../lib/liveTasks'
import { useProjects } from '../../lib/localData'
import type { Task } from '../../lib/types'
import { Button, EmptyState, ListGroupHeader, PageBody, PageHeader } from '../../ui'
import { act } from '../actionError'
import { showUndoToast } from '../bulk/toastStore'
import { navigate } from '../router'
import { useToday } from '../useViews'
import { openHabitForm } from './habitFormStore'
import { habitHue } from './habitText'
import { HabitRow } from './HabitRow'

type Group = 'morning' | 'afternoon' | 'evening' | 'any'

function groupOf(task: Task): Group {
  if (task.evening) return 'evening'
  if (task.day_part === 'morning' || task.day_part === 'afternoon') return task.day_part
  return 'any'
}

const GROUP_TITLE: Record<Group, () => string> = {
  morning: () => t('Morning'), afternoon: () => t('Afternoon'), evening: () => t('This Evening'), any: () => t('Any time'),
}
const ORDER: Group[] = ['morning', 'afternoon', 'evening', 'any']

/** By time of day, then title (D9: no manual order). */
function compareHabits(a: Task, b: Task): number {
  const ta = a.due?.time ?? '99:99'
  const tb = b.due?.time ?? '99:99'
  return ta < tb ? -1 : ta > tb ? 1 : a.title.localeCompare(b.title) || (a.id < b.id ? -1 : 1)
}

const STARTERS = [() => t('Drink water'), () => t('Read 10 minutes'), () => t('Walk after lunch')]

export function HabitsOff() {
  return (
    <PageBody width="form" data-habits-off>
      <PageHeader title={t('Habits')} />
      <EmptyState icon="leaf" title={t('Habits is off')}
        control={<Button size="sm" variant="secondary" onClick={() => navigate({ view: 'settings', section: 'account', page: 'profile', anchor: 'how-you-work' })}>{t('How you work')}</Button>} />
    </PageBody>
  )
}

export default function HabitsScreen() {
  const on = useHabitsEnabled()
  const tasks = useLiveTasks()
  const projects = useProjects()
  const today = useToday()
  const [graduatedOpen, setGraduatedOpen] = useState(false)
  const colours = useMemo(() => new Map(projects.map((p) => [p.id, p.color])), [projects])
  const model = useMemo(() => {
    const all = tasks ?? []
    const rowsOf = habitRowsOf(all)
    const continued = continuedIds(all)
    const habits = all.filter((x) => isOpenHabit(x) && !continued.has(x.id))
    const open = habits.filter((x) => !isGraduated(x)).sort(compareHabits)
    const graduated = habits.filter(isGraduated).sort((a, b) => (b.habit_graduated_at ?? 0) - (a.habit_graduated_at ?? 0))
    return {
      rowsOf, graduated,
      groups: ORDER.map((g) => ({ g, items: open.filter((x) => groupOf(x) === g) })).filter((x) => x.items.length > 0),
      count: open.length,
    }
  }, [tasks])
  if (!on) return tasks === undefined ? null : <HabitsOff />
  const hue = (x: Task) => habitHue(x, x.project_id ? colours.get(x.project_id) : null)
  return (
    <PageBody width="form" data-habits-page>
      <PageHeader title={t('Habits')} help="habits"
        actions={<Button variant="primary" size="sm" icon="plus" onClick={() => openHabitForm()} data-new-habit>{t('New habit')}</Button>} />
      {model.count === 0 && model.graduated.length === 0 && (
        <EmptyState title={t('Start with something small')}
          control={(
            <div className="flex flex-wrap justify-center gap-2" data-habit-starters>
              {STARTERS.map((s) => <Button key={s()} size="sm" variant="secondary" onClick={() => openHabitForm({ title: s() })}>{s()}</Button>)}
            </div>
          )} />
      )}
      {model.groups.map(({ g, items }) => (
        <section key={g} aria-label={GROUP_TITLE[g]()} data-habit-group={g}>
          <ListGroupHeader title={GROUP_TITLE[g]()} />
          <ul className="space-y-0.5">
            {items.map((x) => {
              const rows = model.rowsOf(x)
              return <HabitRow key={x.id} series={x} rows={rows} stats={habitStats(x, rows, today)} hue={hue(x)} today={today} />
            })}
          </ul>
        </section>
      ))}
      {model.graduated.length > 0 && (
        <section aria-label={t('Graduated')} data-habit-group="graduated">
          <ListGroupHeader title={t('Graduated')} count={model.graduated.length} countLabel={(n) => t('{n, plural, one {# graduated habit} other {# graduated habits}}', { n })}
            collapsed={!graduatedOpen} onToggle={() => setGraduatedOpen((v) => !v)} />
          {graduatedOpen && (
            <ul className="space-y-0.5">
              {model.graduated.map((x) => (
                <li key={x.id} data-hue={hue(x)} data-graduated={x.id} className="flex min-h-11 items-center gap-3 rounded-control px-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-hue-soft ring-1 ring-hue-solid" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body text-default">{x.title || t('Untitled')}</span>
                    <span className="block text-meta text-muted" data-kept-for>{t('{n, plural, one {Kept for # day} other {Kept for # days}}', { n: keptDays(x, model.rowsOf(x)) })}</span>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => act(resume(x.id).then((r) => { if (r?.entry) showUndoToast(r.label, r.entry.id) }))} data-resume>{t('Resume')}</Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </PageBody>
  )
}
