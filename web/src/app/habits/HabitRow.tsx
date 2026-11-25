// One habit on the Habits screen (OpenSpec changes habits-home D9, habits-polish D2):
// its colour, title (one line, cut, the full title in the tooltip and the name),
// anchor, the thread of the last seven days, its measure and the check button for
// the current occurrence, on every row: a habit due later checks in early. Space on
// the focused row checks in and Shift+Space logs the tiny version; a long press on the
// button logs it too, and the button's menu offers both. The title opens the habit page.
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { habitGoal, habitTarget, threadDays, type HabitOptions, type HabitStats } from '../../lib/habits'
import { habitStep } from '../../lib/habitAmounts'
import { targetThread } from '../../lib/habitTargets'
import { noteDatesOf } from '../../lib/habitNotes'
import { t } from '../../lib/i18n'
import type { Task } from '../../lib/types'
import { Icon, Tooltip, type HueName } from '../../ui'
import { formatDate } from '../../lib/dates'
import { act } from '../actionError'
import { ActionMenu } from '../menus/ActionMenu'
import { checkInWithUndo, pickDay, stepAmount } from './habitUndo'
import { navigate } from '../router'
import { measureText } from './habitText'
import { Thread } from './Thread'
import { TargetBar } from './TargetBar'
import { openSetAmount } from './amountStore'
import { CheckInNote } from './CheckInNote'
import { openDayNote } from './dayNoteStore'

/** Where the current occurrence stands today: kept today, due (today or earlier), or later. */
export type CheckState = 'kept' | 'due' | 'later'

export function checkStateOf(series: Task, rows: readonly Task[], today: string, opts?: HabitOptions): CheckState {
  const day = threadDays(series, rows, today, opts).at(-1)
  if (day && (day.state === 'done' || day.state === 'tiny')) return 'kept'
  // A habit without a due date (made before habits-polish) checks in today, as completing it does;
  // an amount habit's button always adds to today (habit-targets D2).
  return !series.due || series.due.date <= today || habitGoal(series) > 0 ? 'due' : 'later'
}

const LONG_PRESS_MS = 500

/** Opens a habit's own page (habits-polish D3). */
export function openHabit(id: string): void {
  navigate({ view: 'habits', id })
}

export function CheckButton({ series, state, today, compact = false }: { series: Task; state: CheckState; today: string; compact?: boolean }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const long = useRef(false)
  const title = series.title || t('Untitled')
  const kept = state === 'kept'
  const step = habitStep(series)
  const amount = habitGoal(series) > 0
  // A habit due later checks in its current occurrence early, named with its date (D2).
  // An amount habit's button adds its step to today (habit-targets D2).
  const name = kept ? t('{title}, done today', { title })
    : amount ? t('Add {step} to {title}', { step: series.habit_unit ? `${step} ${series.habit_unit}` : step, title })
      : state === 'later' && series.due ? t('Check in {title} early ({date})', { title, date: formatDate(series.due.date, 'full', undefined, today) })
        : t('Check in {title}', { title })
  const down = (e: PointerEvent) => {
    if (kept || e.button !== 0) return
    long.current = false
    timer.current = setTimeout(() => { long.current = true; act(checkInWithUndo(series.id, true)) }, LONG_PRESS_MS)
  }
  const up = () => { if (timer.current) clearTimeout(timer.current); timer.current = null }
  return (
    <span className="flex shrink-0 items-center">
      <button type="button" data-check-in={series.id} data-kept={kept || undefined} disabled={kept}
        aria-label={name} data-later={state === 'later' || undefined}
        onPointerDown={down} onPointerUp={up} onPointerLeave={up}
        onClick={() => { if (long.current) { long.current = false; return } act(checkInWithUndo(series.id, false)) }}
        className={`touch-target flex ${compact ? 'h-6 w-6' : 'h-8 w-8'} items-center justify-center rounded-full border-2 border-hue-solid transition-colors duration-(--duration-moment)
          ${kept ? 'bg-hue-solid text-surface' : state === 'later' ? 'border-dashed text-hue hover:bg-hue-soft' : 'text-hue hover:bg-hue-soft'} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus`}>
        <Icon name="check" size="sm" className={kept ? '' : 'opacity-0'} />
      </button>
      {/* The menu's slot keeps its width on a kept row, so buttons and measures line up (habits-polish D2). */}
      {!compact && <span className="flex w-7 justify-center">{(!kept || amount) && (
        <ActionMenu label={t('More ways to check in {title}', { title })} align="end" width="sm:w-56"
          trigger={<Icon name="chevron-down" size="xs" />} triggerClassName="ui-btn ui-btn--ghost ui-btn--sm touch-target px-1 text-faint opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100"
          groups={[{ items: amount ? [
            ...(kept ? [] : [{ kind: 'action' as const, id: 'add', label: t('Add {step}', { step }), icon: 'plus' as const, shortcut: 'Space', onSelect: () => checkInWithUndo(series.id, false) }]),
            { kind: 'action', id: 'subtract', label: t('Subtract {step}', { step }), icon: 'minus', onSelect: () => stepAmount(series.id, -step) },
            { kind: 'action', id: 'set', label: t('Set amount'), icon: 'pencil', onSelect: () => openSetAmount(series.id, today) },
          ] : [
            { kind: 'action', id: 'done', label: t('Check in'), icon: 'check', shortcut: 'Space', onSelect: () => checkInWithUndo(series.id, false) },
            { kind: 'action', id: 'tiny', label: series.habit_tiny ? t('Log the tiny version: {tiny}', { tiny: series.habit_tiny }) : t('Log the tiny version'), icon: 'circle', shortcut: 'Shift+Space', onSelect: () => checkInWithUndo(series.id, true) },
          ] }]} />
      )}</span>}
    </span>
  )
}

export function HabitRow({ series, rows, stats, hue, today, opts }: { series: Task; rows: readonly Task[]; stats: HabitStats | null; hue: HueName; today: string; opts?: HabitOptions }) {
  const state = checkStateOf(series, rows, today, opts)
  const measure = measureText(stats, series.habit_unit)
  const title = series.title || t('Untitled')
  // A target habit's thread is its period's bar (habit-targets D5).
  const bar = habitTarget(series) ? targetThread(series, rows, today, opts) : null
  const thread = bar ? <TargetBar thread={bar} /> : <Thread days={threadDays(series, rows, today, opts)} today={today} notes={noteDatesOf(series, rows)}
    goal={habitGoal(series) || undefined} unit={series.habit_unit}
    onPick={(date, c) => act(pickDay(series.id, date, c))} onNote={(date) => openDayNote(series.id, date)} />
  const onKey = (e: KeyboardEvent<HTMLLIElement>) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter') { e.preventDefault(); openHabit(series.id); return }
    if (e.key !== ' ' || state === 'kept') return
    e.preventDefault()
    act(checkInWithUndo(series.id, e.shiftKey))
  }
  // A grid that never wraps (D2): the title cuts to one line; below 640 px the thread is a second row under it.
  return (
    <li tabIndex={0} onKeyDown={onKey} data-hue={hue} data-habit-row={series.id}
      className="group grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-1 rounded-control px-2 py-1.5 hover:bg-sunken focus-visible:outline-2 focus-visible:outline-focus sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] dark:hover:bg-raised">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-hue-solid" aria-hidden="true" />
      <HabitTitle title={title} anchor={series.habit_anchor} onOpen={() => openHabit(series.id)} />
      <span className="hidden sm:block">{thread}</span>
      <span className={`shrink-0 text-end text-meta tabular-nums sm:w-24 ${stats?.backOnTrack ? 'text-hue' : 'text-muted'}`} data-habit-measure>{measure}</span>
      <CheckButton series={series} state={state} today={today} />
      <span className="col-start-2 col-end-[-1] sm:hidden">{thread}</span>
      <CheckInNote seriesId={series.id} title={title} className="col-start-2 col-end-[-1] pb-1" />
    </li>
  )
}

/** The title button: one line, cut with an ellipsis; while cut, the full title opens in the Tooltip. Its name is the whole title. */
function HabitTitle({ title, anchor, onOpen }: { title: string; anchor?: string; onOpen: () => void }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [cut, setCut] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setCut(el.scrollWidth > el.clientWidth + 1)
    update()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [title])
  return (
    <Tooltip label={title} disabled={!cut}>
      <button type="button" className="flex min-w-0 items-baseline gap-2 text-start" onClick={onOpen} tabIndex={-1} data-habit-open>
        <span ref={ref} className="min-w-0 truncate text-body text-default" data-habit-title>{title}</span>
        {anchor && <span className="hidden min-w-0 shrink-[2] truncate text-meta text-muted sm:inline" data-habit-anchor>{anchor}</span>}
      </button>
    </Tooltip>
  )
}
