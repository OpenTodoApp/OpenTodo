// The week board of the Habits screen from 640 px (OpenSpec change habits-board, design
// D1 and D2): a column per day of the last seven, a row per habit with its title and
// facts, a mark per day to tick, its streak and its menu, in the groups of the part of
// the day. Today's mark checks in as the check button does; an earlier day's mark sets
// or clears that day; every write is the one the rows and the habit's page make.
import { useMemo, type KeyboardEvent } from 'react'
import { editableDay, habitGoal, habitStats, habitTarget, threadDays, type DayCell, type HabitOptions } from '../../lib/habits'
import { noteDatesOf } from '../../lib/habitNotes'
import { t } from '../../lib/i18n'
import type { Task } from '../../lib/types'
import { weekday } from '../../lib/dates'
import { Icon, ListGroupHeader, type HueName } from '../../ui'
import { act } from '../actionError'
import { ActionMenu } from '../menus/ActionMenu'
import { openSetAmount } from './amountStore'
import { CheckInNote } from './CheckInNote'
import { DayMark } from './DayMark'
import { openHabitForm } from './habitFormStore'
import { checkInItems, checkStateOf, onCheck, openHabit, type CheckState } from './HabitRow'
import { measureText, threadDayLabel } from './habitText'
import { checkInWithUndo, pickDay } from './habitUndo'
import { GROUP_TITLE, type HabitGroup } from './useHabitsModel'

/** The board's columns: the habit, seven days, the streak, the menu. */
// Compact when the board is narrower than 44 rem (a tablet with the sidebar open), full from there (a container query).
const COLS = 'grid grid-cols-[minmax(6rem,1fr)_repeat(7,2.25rem)_2.5rem_2.75rem] @[44rem]:grid-cols-[minmax(10rem,1fr)_repeat(7,2.75rem)_3.5rem_2.75rem] items-center gap-x-1'

function Header({ days, today }: { days: readonly string[]; today: string }) {
  return (
    <div className={`${COLS} sticky top-0 z-[1] bg-surface pb-1 pt-2`} aria-hidden="true" data-board-head>
      <span />
      {days.map((d) => (
        <span key={d} className={`flex flex-col items-center leading-tight ${d === today ? 'text-accent' : 'text-muted'}`} data-board-day={d}>
          <span className="text-hint">{weekday(d).slice(0, 2)}</span>
          <span className={`text-meta tabular-nums ${d === today ? 'font-semibold' : ''}`}>{Number(d.slice(8))}</span>
        </span>
      ))}
      <span className="flex justify-center text-faint"><Icon name="flame" size="sm" /></span>
      <span />
    </div>
  )
}

/** One day of one habit: a toggle where the day can change, a quiet dot where the habit does not repeat. */
function Day({ series, cell, today, check, goal, unit, note }: { series: Task; cell: DayCell; today: string; check: CheckState; goal: number; unit?: string; note: boolean }) {
  const isToday = cell.date === today
  const later = isToday && check === 'later'
  const name = threadDayLabel(cell.date, cell.state, note, goal && cell.amount ? { amount: cell.amount, goal, unit } : undefined)
  const kept = cell.state === 'done' || cell.state === 'tiny'
  const active = isToday || editableDay(cell, today)
  if (!active || ((cell.state === 'blank' || cell.state === 'upcoming') && !later)) {
    return <span role="img" aria-label={name} data-board-cell={cell.date} data-state={cell.state} className="flex justify-center"><span className="h-1.5 w-1.5 rounded-full bg-(--border-color-strong)" /></span>
  }
  const share = goal > 0 ? Math.min(1, (cell.amount ?? 0) / goal) : undefined
  const tap = () => {
    if (isToday) return act(onCheck(series, check))
    if (goal > 0) return openSetAmount(series.id, cell.date)
    act(pickDay(series.id, cell.date, kept ? 'clear' : 'done'))
  }
  return (
    <button type="button" onClick={tap} aria-label={name} aria-pressed={goal > 0 ? undefined : kept} tabIndex={isToday ? 0 : -1}
      data-board-cell={cell.date} data-state={cell.state} data-check-in={isToday ? series.id : undefined} data-kept={kept || undefined}
      className="touch-target relative flex h-9 w-9 @[44rem]:h-11 @[44rem]:w-11 items-center justify-center rounded-full hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus dark:hover:bg-raised">
      <DayMark state={later ? 'pending' : cell.state} later={later} share={share} size="lg" />
      {note && <span aria-hidden className="absolute bottom-1 h-1 w-1 rounded-full bg-accent" data-note-mark={cell.date} />}
    </button>
  )
}

function BoardRow({ series, rows, today, opts, hue }: { series: Task; rows: readonly Task[]; today: string; opts?: HabitOptions; hue: HueName }) {
  const title = series.title || t('Untitled')
  const days = useMemo(() => threadDays(series, rows, today, opts), [series, rows, today, opts])
  const stats = useMemo(() => habitStats(series, rows, today, opts), [series, rows, today, opts])
  const notes = useMemo(() => noteDatesOf(series, rows), [series, rows])
  const check = checkStateOf(series, rows, today, opts)
  const goal = habitGoal(series)
  const facts = [series.habit_anchor, measureText(stats, series.habit_unit)].filter(Boolean).join(' · ')
  const streak = stats?.current ?? 0
  const items = [
    ...checkInItems(series, check, today),
    { kind: 'action' as const, id: 'open', label: t('Open'), icon: 'panel-right' as const, onSelect: () => openHabit(series.id) },
    { kind: 'action' as const, id: 'edit', label: t('Edit…'), icon: 'pencil' as const, onSelect: () => openHabitForm({ taskId: series.id }) },
  ]
  // Space checks in (Shift for the tiny version) and Enter opens the habit, as on the rows (habits-home D9).
  const onKey = (e: KeyboardEvent<HTMLLIElement>) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter') { e.preventDefault(); openHabit(series.id); return }
    if (e.key !== ' ') return
    e.preventDefault()
    if (check === 'kept' && e.shiftKey) return
    act(check === 'kept' || !e.shiftKey ? onCheck(series, check) : checkInWithUndo(series.id, true))
  }
  return (
    <li tabIndex={0} onKeyDown={onKey} data-hue={hue} data-habit-row={series.id} data-board-row={series.id}
      className="group rounded-control focus-visible:outline-2 focus-visible:outline-focus">
      <div className={`${COLS} rounded-control py-1 hover:bg-sunken/60`}>
        <button type="button" onClick={() => openHabit(series.id)} tabIndex={-1} className="flex min-w-0 items-center gap-3 px-2 text-start" data-habit-open>
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-hue-solid" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block truncate text-body text-strong" data-habit-title title={title}>{title}</span>
            {facts && <span className={`block truncate text-meta ${stats?.backOnTrack ? 'text-hue' : 'text-muted'}`} data-habit-measure>{facts}</span>}
          </span>
        </button>
        {days.map((c) => <Day key={c.date} series={series} cell={c} today={today} check={check} goal={goal} unit={series.habit_unit} note={notes.has(c.date)} />)}
        <span className={`flex items-center justify-center gap-0.5 text-meta tabular-nums ${streak > 0 ? 'text-hue font-semibold' : 'text-faint'}`}
          data-board-streak={streak} title={habitTarget(series) ? undefined : t('{n, plural, one {# day} other {# days}}', { n: streak })}>
          <Icon name="flame" size="xs" className={streak > 0 ? '' : 'opacity-50'} />{streak}
        </span>
        <ActionMenu label={t('More ways to check in {title}', { title })} align="end" width="sm:w-56" groups={[{ items }]}
          trigger={<Icon name="ellipsis" size="sm" />} triggerClassName="ui-btn ui-btn--ghost ui-btn--sm touch-target px-1 text-faint opacity-0 pointer-coarse:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100" />
      </div>
      <CheckInNote seriesId={series.id} title={title} className="ms-8 max-w-md pb-1" />
    </li>
  )
}

export function HabitBoard({ groups, rowsOf, hue, today, opts }: {
  groups: readonly { g: HabitGroup; items: readonly Task[] }[]
  rowsOf: (t: Task) => readonly Task[]
  hue: (t: Task) => HueName
  today: string
  opts?: HabitOptions
}) {
  const days = useMemo(() => {
    const d = new Date(`${today}T00:00:00Z`)
    return Array.from({ length: 7 }, (_, i) => new Date(d.getTime() - (6 - i) * 86_400_000).toISOString().slice(0, 10))
  }, [today])
  return (
    <div className="@container max-w-[60rem]" data-habit-board>
      <Header days={days} today={today} />
      {groups.map(({ g, items }) => (
        <section key={g} aria-label={GROUP_TITLE[g]()} data-habit-group={g} className="mt-2">
          <ListGroupHeader title={GROUP_TITLE[g]()} />
          <ul className="space-y-0.5">
            {items.map((x) => <BoardRow key={x.id} series={x} rows={rowsOf(x)} today={today} opts={opts} hue={hue(x)} />)}
          </ul>
        </section>
      ))}
    </div>
  )
}
