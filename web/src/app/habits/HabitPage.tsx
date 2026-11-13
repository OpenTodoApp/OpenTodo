// A habit's own page at /habits/<id> (OpenSpec change habits-polish, design D3): the
// title, one line of facts (how often, the part of the day, the anchor), the tiny
// version, its numbers, Check in, and the month history with editable past days.
// Edit opens the lean habit form; everything a habit leaves out (project, labels,
// reminders, notes) is one step away in Open as a task. Rendered from the device's
// rows only, offline too.
import { lazy, Suspense, useMemo } from 'react'
import { graduate, resume } from '../../lib/habitActions'
import { habitRowsOf, habitStats, isGraduated, keptDays, type HabitStats } from '../../lib/habits'
import { useHabitsChoice } from '../../lib/habitPrefs'
import { trackAsHabit } from '../../lib/habitPrefs'
import { t } from '../../lib/i18n'
import { useLiveTasks } from '../../lib/liveTasks'
import { useProjects } from '../../lib/localData'
import type { Task } from '../../lib/types'
import { trashUndoable } from '../../lib/undoActions'
import { Button, PageBody, PageHeader, Skeleton } from '../../ui'
import { act } from '../actionError'
import { showUndoToast } from '../bulk/toastStore'
import { ActionMenu, type ActionItem } from '../menus/ActionMenu'
import { navigate } from '../router'
import { useToday } from '../useViews'
import { openHabitForm } from './habitFormStore'
import { habitFacts } from './habitRule'
import { habitHue } from './habitText'
import { CheckButton, checkStateOf } from './HabitRow'
import { pickDay } from './habitUndo'

const HabitHistory = lazy(() => import('../HabitHistory').then((m) => ({ default: m.HabitHistory })))

type Undoable = Promise<{ entry: { id: string } | null; label: string } | null>
const undo = (p: Undoable) => act(p.then((r) => { if (r?.entry) showUndoToast(r.label, r.entry.id) }))

/** Strength, Kept, Streak and Best as four quiet numbers. */
function Numbers({ stats }: { stats: HabitStats }) {
  const cells = [
    { label: t('Strength'), value: String(stats.strength) },
    { label: t('Kept'), value: t('{kept} of {of}', { kept: stats.kept, of: stats.keptOf }) },
    { label: t('Streak'), value: String(stats.current) },
    { label: t('Best'), value: String(stats.best) },
  ]
  return (
    <dl className="grid grid-cols-4 gap-2" data-habit-numbers>
      {cells.map((c) => (
        <div key={c.label} className="min-w-0">
          <dt className="truncate text-meta text-muted">{c.label}</dt>
          <dd className="text-h3 tabular-nums text-strong">{c.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function menuItems(task: Task, graduated: boolean, choice: ReturnType<typeof useHabitsChoice>): ActionItem[] {
  return [
    { kind: 'action', id: 'edit', label: t('Edit'), icon: 'pencil', onSelect: () => openHabitForm({ taskId: task.id }) },
    graduated
      ? { kind: 'action', id: 'resume', label: t('Resume'), icon: 'rotate-ccw', onSelect: () => undo(resume(task.id)) }
      : { kind: 'action', id: 'graduate', label: t('Graduate'), icon: 'graduation-cap', onSelect: () => undo(graduate(task.id)) },
    { kind: 'action', id: 'as-task', label: t('Open as a task'), icon: 'external-link', onSelect: () => navigate({ view: 'task', id: task.id, asTask: true }) },
    { kind: 'action', id: 'stop', label: t('Stop tracking as a habit'),
      onSelect: () => act(trackAsHabit(task, false, choice ?? 'on').then(() => navigate({ view: 'task', id: task.id }))) },
    { kind: 'confirm', id: 'delete', label: t('Delete'), icon: 'trash-2', tone: 'danger',
      confirm: { title: t('Delete habit?'), body: t('{title} and its history move to the Trash.', { title: task.title || t('Untitled') }), confirmLabel: t('Delete'),
        onConfirm: () => { navigate({ view: 'habits' }); undo(trashUndoable(task.id)) } } },
  ]
}

export function HabitPage({ id }: { id: string }) {
  const tasks = useLiveTasks()
  const projects = useProjects()
  const today = useToday()
  const choice = useHabitsChoice()
  const task = tasks?.find((x) => x.id === id)
  const rows = useMemo(() => (tasks && task ? habitRowsOf(tasks)(task) : []), [tasks, task])
  const back = { label: t('Habits'), onClick: () => navigate({ view: 'habits' }) }
  if (tasks === undefined) return <PageBody width="form"><div className="py-6"><Skeleton shape="line" count={4} label={t('Loading habit')} /></div></PageBody>
  if (!task || task.deleted_at || !task.habit) {
    return (
      <PageBody width="form">
        <PageHeader title={t('Habits')} back={back} />
        <p className="py-6 text-body text-muted" data-habit-missing>{t('This habit no longer exists.')}</p>
      </PageBody>
    )
  }
  const graduated = isGraduated(task)
  const stats = graduated ? null : habitStats(task, rows, today)
  const colour = task.project_id ? projects.find((p) => p.id === task.project_id)?.color : null
  const state = checkStateOf(task, rows, today)
  return (
    <PageBody width="form" data-habit-page={task.id}>
      <div data-hue={habitHue(task, colour)}>
        <PageHeader title={task.title || t('Untitled')} back={back} meta={habitFacts(task)}
          leading={<span className="h-3 w-3 shrink-0 rounded-full bg-hue-solid" aria-hidden="true" />}
          actions={graduated ? undefined : <CheckButton series={task} state={state} today={today} />}
          menu={<ActionMenu label={t('Habit actions')} groups={[{ items: menuItems(task, graduated, choice) }]} />} />
        <div className="space-y-5 px-1 pb-8">
          {task.habit_tiny && (
            <p className="text-body text-muted" data-habit-tiny-line><span className="text-default">{t('Tiny version')}</span> · {task.habit_tiny}</p>
          )}
          {graduated && (
            <div className="flex items-center gap-2" data-habit-graduated>
              <p className="min-w-0 flex-1 text-meta text-muted">{t('Graduated')} · {t('{n, plural, one {Kept for # day} other {Kept for # days}}', { n: keptDays(task, rows) })}</p>
              <Button size="sm" variant="secondary" onClick={() => undo(resume(task.id))} data-resume>{t('Resume')}</Button>
            </div>
          )}
          {stats && <Numbers stats={stats} />}
          {stats?.backOnTrack && <p className="text-meta text-hue" data-habit-status>{t('Back on track')}</p>}
          <Suspense fallback={null}>
            <HabitHistory series={task} records={rows} today={today} onPick={graduated ? undefined : (date, c) => act(pickDay(task.id, date, c))} />
          </Suspense>
        </div>
      </div>
    </PageBody>
  )
}

export default HabitPage
