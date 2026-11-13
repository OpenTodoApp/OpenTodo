// One habit on the Habits screen (OpenSpec change habits-home, design D9): its
// colour, title, anchor, the thread of the last seven days, its measure and the
// check button for the current occurrence. Space on the focused row checks in and
// Shift+Space logs the tiny version; a long press on the button logs it too, and the
// button's menu offers both. The title opens the habit's page (the task panel).
import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { threadDays, type HabitStats } from '../../lib/habits'
import { t } from '../../lib/i18n'
import type { Task } from '../../lib/types'
import { Icon, type HueName } from '../../ui'
import { act } from '../actionError'
import { ActionMenu } from '../menus/ActionMenu'
import { checkInWithUndo, pickDay } from './habitUndo'
import { setPanelTaskId } from '../panel'
import { measureText } from './habitText'
import { Thread } from './Thread'

/** Where the current occurrence stands today: kept today, due (today or earlier), or later. */
export type CheckState = 'kept' | 'due' | 'later'

export function checkStateOf(series: Task, rows: readonly Task[], today: string): CheckState {
  const day = threadDays(series, rows, today).at(-1)
  if (day && (day.state === 'done' || day.state === 'tiny')) return 'kept'
  return series.due && series.due.date <= today ? 'due' : 'later'
}

const LONG_PRESS_MS = 500

export function CheckButton({ series, state, compact = false }: { series: Task; state: CheckState; compact?: boolean }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const long = useRef(false)
  const title = series.title || t('Untitled')
  if (state === 'later') return <span className="w-8 shrink-0" aria-hidden="true" />
  const kept = state === 'kept'
  const down = (e: PointerEvent) => {
    if (kept || e.button !== 0) return
    long.current = false
    timer.current = setTimeout(() => { long.current = true; act(checkInWithUndo(series.id, true)) }, LONG_PRESS_MS)
  }
  const up = () => { if (timer.current) clearTimeout(timer.current); timer.current = null }
  return (
    <span className="flex shrink-0 items-center">
      <button type="button" data-check-in={series.id} data-kept={kept || undefined} disabled={kept}
        aria-label={kept ? t('{title}, done today', { title }) : t('Check in {title}', { title })}
        onPointerDown={down} onPointerUp={up} onPointerLeave={up}
        onClick={() => { if (long.current) { long.current = false; return } act(checkInWithUndo(series.id, false)) }}
        className={`touch-target flex ${compact ? 'h-6 w-6' : 'h-8 w-8'} items-center justify-center rounded-full border-2 border-hue-solid transition-colors duration-(--duration-moment)
          ${kept ? 'bg-hue-solid text-surface' : 'text-hue hover:bg-hue-soft'} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus`}>
        <Icon name="check" size="sm" className={kept ? '' : 'opacity-0'} />
      </button>
      {!kept && !compact && (
        <ActionMenu label={t('More ways to check in {title}', { title })} align="end" width="sm:w-56"
          trigger={<Icon name="chevron-down" size="xs" />} triggerClassName="ui-btn ui-btn--ghost ui-btn--sm touch-target px-1 text-faint opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100"
          groups={[{ items: [
            { kind: 'action', id: 'done', label: t('Check in'), icon: 'check', shortcut: 'Space', onSelect: () => checkInWithUndo(series.id, false) },
            { kind: 'action', id: 'tiny', label: series.habit_tiny ? t('Log the tiny version: {tiny}', { tiny: series.habit_tiny }) : t('Log the tiny version'), icon: 'circle', shortcut: 'Shift+Space', onSelect: () => checkInWithUndo(series.id, true) },
          ] }]} />
      )}
    </span>
  )
}

export function HabitRow({ series, rows, stats, hue, today }: { series: Task; rows: readonly Task[]; stats: HabitStats | null; hue: HueName; today: string }) {
  const state = checkStateOf(series, rows, today)
  const measure = measureText(stats)
  const thread = <Thread days={threadDays(series, rows, today)} today={today} onPick={(date, c) => act(pickDay(series.id, date, c))} />
  const onKey = (e: KeyboardEvent<HTMLLIElement>) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter') { e.preventDefault(); setPanelTaskId(series.id); return }
    if (e.key !== ' ' || state !== 'due') return
    e.preventDefault()
    act(checkInWithUndo(series.id, e.shiftKey))
  }
  return (
    <li tabIndex={0} onKeyDown={onKey} data-hue={hue} data-habit-row={series.id}
      className="group flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 rounded-control px-2 py-1.5 hover:bg-sunken focus-visible:outline-2 focus-visible:outline-focus dark:hover:bg-raised">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-hue-solid" aria-hidden="true" />
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setPanelTaskId(series.id)} tabIndex={-1}>
        <span className="block truncate text-body text-default">{series.title || t('Untitled')}</span>
        {series.habit_anchor && <span className="block truncate text-meta text-muted" data-habit-anchor>{series.habit_anchor}</span>}
      </button>
      <span className="hidden sm:block">{thread}</span>
      <span className={`shrink-0 sm:w-24 text-right text-meta tabular-nums ${stats?.backOnTrack ? 'text-hue' : 'text-muted'}`} data-habit-measure>{measure}</span>
      <CheckButton series={series} state={state} />
      {/* Below 640 px the thread takes its own line under the title. */}
      <span className="basis-full pl-5 sm:hidden">{thread}</span>
    </li>
  )
}
