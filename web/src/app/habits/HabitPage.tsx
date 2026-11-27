// A habit's own page at /habits/<id> (OpenSpec change habits-polish, design D3): the
// title, one line of facts (how often, the part of the day, the anchor), the tiny
// version, its numbers, Check in, and the month history with editable past days;
// with habit-notes the habit's own note comes first and its Check-ins come last.
// Edit opens the lean habit form; everything a habit leaves out (project, labels,
// reminders, notes) is one step away in Open as a task. Rendered from the device's
// rows only, offline too.
import { useMemo } from 'react'
import { graduate, resume } from '../../lib/habitActions'
import { habitRowsOf, habitStats, habitTarget, isGraduated, keptDays, type HabitOptions, type HabitStats } from '../../lib/habits'
import { useHabitsChoice } from '../../lib/habitPrefs'
import { trackAsHabit } from '../../lib/habitPrefs'
import { t } from '../../lib/i18n'
import { useLiveTasks } from '../../lib/liveTasks'
import { useProjects } from '../../lib/localData'
import type { Task } from '../../lib/types'
import { trashUndoable } from '../../lib/undoActions'
import { Button, Icon, PageBody, PageHeader, Skeleton } from '../../ui'
import { act } from '../actionError'
import { showUndoToast } from '../bulk/toastStore'
import { HabitHistory } from '../HabitHistory'
import { ActionMenu, type ActionItem } from '../menus/ActionMenu'
import { navigate } from '../router'
import { useToday } from '../useViews'
import { openHabitForm } from './habitFormStore'
import { habitFacts } from './habitRule'
import { habitHue, measureText } from './habitText'
import { checkStateOf, onCheck, type CheckState } from './HabitRow'
import { checkInWithUndo, pickDay, skipWithUndo, stepAmount } from './habitUndo'
import { HabitYear } from './HabitYear'
import { WeekdayChart } from './WeekdayChart'
import { recentKept } from '../../lib/habitDay'
import { checkInsOf } from '../../lib/habitNotes'
import { openSetAmount } from './amountStore'
import { CheckInNote } from './CheckInNote'
import { CheckIns } from './CheckIns'
import { TaskNotes } from '../task-detail/TaskDetail'
import { DayNoteHost } from './DayNoteDialog'
import { openDayNote } from './dayNoteStore'
import { AmountHost } from './AmountDialog'
import { useHabitOptions } from './useHabitOptions'



type Undoable = Promise<{ entry: { id: string } | null; label: string } | null>
const undo = (p: Undoable) => act(p.then((r) => { if (r?.entry) showUndoToast(r.label, r.entry.id) }))

/** The streak with its flame, the best, the strength with its bar, the last 30 days (habits-board D4). */
function Tiles({ task, stats, rows, today, opts }: { task: Task; stats: HabitStats; rows: readonly Task[]; today: string; opts?: HabitOptions }) {
  const days = (n: number) => (stats.period ? String(n) : t('{n, plural, one {# day} other {# days}}', { n }))
  const recent = recentKept(task, rows, today, 30, opts)
  const measure = stats.period || stats.goal ? measureText({ ...stats, backOnTrack: false }, task.habit_unit) : undefined
  const tile = 'surface-card min-w-0 p-3'
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-habit-numbers>
      <div className={tile} data-tile="streak">
        <dt className="flex items-center gap-1 text-meta text-muted"><Icon name="flame" size="xs" className={stats.current > 0 ? 'text-hue' : ''} />{t('Streak')}</dt>
        <dd className="text-display tabular-nums text-strong">{days(stats.current)}</dd>
        {stats.backOnTrack && <dd className="text-hint text-hue" data-habit-status>{t('Back on track')}</dd>}
      </div>
      <div className={tile} data-tile="best">
        <dt className="text-meta text-muted">{t('Best')}</dt>
        <dd className="text-display tabular-nums text-strong">{days(stats.best)}</dd>
      </div>
      <div className={tile} data-tile="strength">
        <dt className="text-meta text-muted">{t('Strength')}</dt>
        <dd className="text-display tabular-nums text-strong">{stats.strength}</dd>
        <dd aria-hidden className="mt-1 h-1 overflow-hidden rounded-full bg-sunken"><span className="block h-full rounded-full bg-hue-solid" style={{ width: `${stats.strength}%` }} /></dd>
      </div>
      <div className={tile} data-tile="recent">
        <dt className="text-meta text-muted">{t('Last 30 days')}</dt>
        <dd className="text-display tabular-nums text-strong">{recent.of ? t('{kept} of {of}', { kept: recent.kept, of: recent.of }) : '–'}</dd>
        {measure && <dd className="text-hint text-faint">{measure}</dd>}
      </div>
    </dl>
  )
}

/** Check in as a labelled button: Done today once kept (pressed, it takes the check-in back, habits-complete D4), Check in early for a habit due later. */
function CheckIn({ task, state }: { task: Task; state: CheckState }) {
  const kept = state === 'kept'
  // An amount habit adds its step (habit-targets D2).
  const step = task.habit_amount ? task.habit_step || 1 : 0
  return (
    <Button size="sm" variant={kept && !step ? 'ghost' : 'secondary'} icon={step ? 'plus' : 'check'} aria-pressed={step ? undefined : kept}
      onClick={() => act(onCheck(task, state))} data-check-in={task.id} data-kept={kept || undefined}>
      {kept ? t('Done today') : step ? t('Add {step}', { step }) : state === 'later' ? t('Check in early') : t('Check in')}
    </Button>
  )
}

function menuItems(task: Task, graduated: boolean, state: CheckState, choice: ReturnType<typeof useHabitsChoice>, today: string): ActionItem[] {
  const kept = state === 'kept'
  const step = task.habit_step || 1
  return [
    ...(!graduated && task.habit_amount ? [
      { kind: 'action' as const, id: 'subtract', label: t('Subtract {step}', { step }), icon: 'minus' as const, onSelect: () => stepAmount(task.id, -step) },
      { kind: 'action' as const, id: 'set', label: t('Set amount…'), icon: 'pencil' as const, onSelect: () => openSetAmount(task.id, today) },
    ] : []),
    ...(!graduated && !kept && !task.habit_amount ? [{ kind: 'action' as const, id: 'tiny', label: task.habit_tiny ? t('Log the tiny version: {tiny}', { tiny: task.habit_tiny }) : t('Log the tiny version'), icon: 'circle' as const, onSelect: () => checkInWithUndo(task.id, true) }] : []),
    // Skip this day (habits-complete D5): not for a target habit, which rests, or an amount habit.
    ...(!graduated && state === 'due' && !task.habit_amount && !habitTarget(task) ? [{ kind: 'action' as const, id: 'skip', label: t('Skip this day'), icon: 'arrow-right' as const, onSelect: () => skipWithUndo(task.id) }] : []),
    { kind: 'action', id: 'edit', label: t('Edit…'), icon: 'pencil', onSelect: () => openHabitForm({ taskId: task.id }) },
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
  const opts = useHabitOptions()
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
  const stats = graduated ? null : habitStats(task, rows, today, opts)
  const colour = task.project_id ? projects.find((p) => p.id === task.project_id)?.color : null
  const state = checkStateOf(task, rows, today, opts)
  const hasCheckIns = checkInsOf(task, rows).length > 0
  return (
    <PageBody width="wide" data-habit-page={task.id}>
      <div data-hue={habitHue(task, colour)}>
        <PageHeader title={task.title || t('Untitled')} back={back} meta={habitFacts(task)}
          leading={<span className="h-3 w-3 shrink-0 rounded-full bg-hue-solid" aria-hidden="true" />}
          actions={graduated ? undefined : <CheckIn task={task} state={state} />}
          menu={<ActionMenu label={t('Habit actions')} groups={[{ items: menuItems(task, graduated, state, choice, today) }]} />} />
        <div className="max-w-[72rem] space-y-4 px-1 pb-8">
          <CheckInNote seriesId={task.id} title={task.title || t('Untitled')} />
          {graduated && (
            <div className="flex items-center gap-2" data-habit-graduated>
              <p className="min-w-0 flex-1 text-meta text-muted">{t('Graduated')} · {t('{n, plural, one {Kept for # day} other {Kept for # days}}', { n: keptDays(task, rows) })}</p>
              <Button size="sm" variant="secondary" onClick={() => undo(resume(task.id))} data-resume>{t('Resume')}</Button>
            </div>
          )}
          {stats && <Tiles task={task} stats={stats} rows={rows} today={today} opts={opts} />}
          {/* The month and the weekdays side by side from 1024 px, the year under them (habits-board D4). */}
          <div className="grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)]">
            <section className="surface-card p-4" aria-label={t('Month')}>
              <HabitHistory series={task} records={rows} today={today} opts={opts} hued onPick={graduated ? undefined : (date, c) => act(pickDay(task.id, date, c))}
                onNote={graduated ? undefined : (date) => openDayNote(task.id, date)} />
            </section>
            <section className="surface-card p-4" aria-label={t('By weekday')}>
              <WeekdayChart series={task} rows={rows} today={today} opts={opts} />
            </section>
          </div>
          <section className="surface-card w-fit max-w-full p-4" aria-label={t('Year')}><HabitYear series={task} rows={rows} today={today} opts={opts} /></section>
          <div className={`grid gap-4 ${hasCheckIns ? 'lg:grid-cols-2' : ''}`}>
            <section className="surface-card space-y-3 p-4" aria-label={t('Notes')}>
              <div data-habit-note><TaskNotes task={task} readOnly={false} /></div>
              {task.habit_tiny && (
                <p className="text-body text-muted" data-habit-tiny-line><span className="text-default">{t('Tiny version')}</span> · {task.habit_tiny}</p>
              )}
            </section>
            {hasCheckIns && <section className="surface-card p-4" aria-label={t('Check-ins')}><CheckIns series={task} rows={rows} today={today} /></section>}
          </div>
        </div>
        <DayNoteHost />
        <AmountHost />
      </div>
    </PageBody>
  )
}

export default HabitPage
