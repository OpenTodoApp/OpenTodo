// The Habits screen on a phone (OpenSpec change habits-complete, design D1 to D3): the
// phone header with New habit in the bar and the day's progress, the day strip, then
// one row per habit: a ring under the thumb that checks in (or takes back) the chosen
// day, the title on up to two lines with the anchor and the measure, and the week as
// small marks. A hold opens the row's actions as a sheet; the title opens the habit's
// page, which is the shared one. Built on the desktop screen's model, so both group,
// order and count alike; everything it writes is the desktop screen's write.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { addDaysISO } from '../../lib/dates'
import { dayProgress, dayStateOf } from '../../lib/habitDay'
import { editableDay, habitGoal, habitStats, habitTarget, threadDays, type DayState, type HabitOptions } from '../../lib/habits'
import { useHabitsEnabled } from '../../lib/habitPrefs'
import { noteDatesOf } from '../../lib/habitNotes'
import { targetThread } from '../../lib/habitTargets'
import { t } from '../../lib/i18n'
import type { Task } from '../../lib/types'
import { Button, EmptyState, Icon, IconButton, ListGroupHeader, PageBody, PageHeader, type HueName } from '../../ui'
import { act } from '../../app/actionError'
import { ActionMenu, AmountHost, CheckInNote, DayNoteHost, DayStrip, GraduatedGroup, GROUP_TITLE, HabitPage, HabitsOff, STARTERS, TargetBar, Thread, checkInItems, checkStateOf, measureText, onCheck, openDayNote, openHabit, openHabitForm, openSetAmount, pickDay, progressText, useHabitsModel, type ActionItem, type CheckState } from '../../app/habits/shared'
import { holdForRow } from '../../app/task-list/rowHold'
import { useToday } from '../../app/useViews'

/** The ring's look for a day's state: kept fills it, the tiny version half, an amount its share. */
function Ring({ state, later, share }: { state: DayState; later: boolean; share?: number }) {
  const base = 'flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors duration-(--duration-moment)'
  if (share !== undefined && share < 1 && state !== 'done') {
    const style = { backgroundImage: `conic-gradient(var(--hue-solid) ${Math.round(share * 360)}deg, transparent 0)` } as CSSProperties
    return <span aria-hidden data-ring="partial" className={`${base} border-hue-solid`} style={style} />
  }
  switch (state) {
    case 'done': return <span aria-hidden data-ring="done" className={`${base} border-hue-solid bg-hue-solid text-surface`}><Icon name="check" size="xs" /></span>
    case 'tiny': return <span aria-hidden data-ring="tiny" className={`${base} border-hue-solid bg-[linear-gradient(90deg,var(--hue-solid)_50%,transparent_50%)]`} />
    case 'skipped': return <span aria-hidden data-ring="skipped" className={`${base} border-input text-muted`}><Icon name="minus" size="xs" /></span>
    case 'missed': return <span aria-hidden data-ring="missed" className={`${base} border-dashed border-strong`} />
    case 'rest': return <span aria-hidden data-ring="rest" className={`${base} border-default`} />
    default: return <span aria-hidden data-ring={later ? 'later' : 'due'} className={`${base} border-hue-solid ${later ? 'border-dashed' : ''}`} />
  }
}

/** A past day's choices (habits-home D6): its state, Clear and Note, as the thread's day menu offers them. */
function pastItems(series: Task, date: string, state: DayState): ActionItem[] {
  const pick = (c: 'done' | 'tiny' | 'skipped' | 'clear') => act(pickDay(series.id, date, c))
  const check = (id: 'done' | 'tiny' | 'skipped', label: string): ActionItem => ({ kind: 'check', id, label, checked: state === id, onSelect: () => pick(id) })
  return [
    check('done', t('Done')), check('tiny', t('Tiny version')), check('skipped', t('Skipped')),
    ...(state !== 'missed' && state !== 'rest' ? [{ kind: 'action' as const, id: 'clear', label: t('Clear'), icon: 'x' as const, onSelect: () => pick('clear') }] : []),
    ...(habitGoal(series) > 0 ? [{ kind: 'action' as const, id: 'set', label: t('Set amount…'), icon: 'pencil' as const, onSelect: () => openSetAmount(series.id, date) }] : []),
    { kind: 'action', id: 'note', label: t('Note…'), icon: 'pencil', onSelect: () => openDayNote(series.id, date) },
  ]
}

function PhoneHabitRow({ series, rows, day, today, opts, hue }: { series: Task; rows: readonly Task[]; day: string; today: string; opts: HabitOptions; hue: HueName }) {
  const [menu, setMenu] = useState(false)
  const row = useRef<HTMLLIElement>(null)
  const title = series.title || t('Untitled')
  const past = day !== today
  const days = useMemo(() => threadDays(series, rows, today, opts), [series, rows, today, opts])
  const stats = useMemo(() => habitStats(series, rows, today, opts), [series, rows, today, opts])
  const check: CheckState = checkStateOf(series, rows, today, opts)
  const state = past ? dayStateOf(series, rows, day, today, opts) : days.at(-1)?.state ?? 'blank'
  const goal = habitGoal(series)
  const amount = past ? days.find((d) => d.date === day)?.amount : stats?.amount
  const share = goal > 0 ? Math.min(1, (amount ?? 0) / goal) : undefined
  const kept = state === 'done' || state === 'tiny'
  const bar = habitTarget(series) ? targetThread(series, rows, today, opts) : null
  const notes = useMemo(() => noteDatesOf(series, rows), [series, rows])
  // Today: check in or take back, as the desktop button does (D3). An earlier day: kept is cleared, anything else is done; an amount opens Set amount.
  const tap = () => {
    if (!past) return act(onCheck(series, check))
    if (goal > 0) return openSetAmount(series.id, day)
    act(pickDay(series.id, day, kept ? 'clear' : 'done'))
  }
  const items: ActionItem[] = [
    ...(past ? pastItems(series, day, state) : checkInItems(series, check, today)),
    { kind: 'action', id: 'open', label: t('Open'), icon: 'panel-right', onSelect: () => openHabit(series.id) },
    { kind: 'action', id: 'edit', label: t('Edit…'), icon: 'pencil', onSelect: () => openHabitForm({ taskId: series.id }) },
  ]
  const measure = measureText(stats, series.habit_unit)
  const facts = [series.habit_anchor, measure].filter(Boolean).join(' · ')
  return (
    <li ref={row} data-hue={hue} data-phone-habit={series.id} data-habit-row={series.id} className="relative min-w-0 bg-surface"
      onPointerDown={(e) => holdForRow(e, undefined, () => setMenu(true))}>
      <div className="flex min-w-0 items-center">
      <button type="button" onClick={tap} data-check-in={series.id} data-kept={kept || undefined} data-later={!past && check === 'later' || undefined}
        aria-label={t('Check in {title}', { title })} aria-pressed={goal > 0 ? undefined : kept}
        className="press-selected flex h-14 w-12 shrink-0 items-center justify-center rounded-full bg-clip-content px-2 py-3 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-focus">
        <Ring state={state} later={!past && check === 'later'} share={share} />
      </button>
      <button type="button" onClick={() => openHabit(series.id)} data-habit-open
        className="press-selected flex min-h-14 min-w-0 flex-1 flex-col justify-center py-2 pe-2 text-start focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus">
        <span data-habit-title className={`line-clamp-2 text-prose ${past && !editableDay({ date: day, state }, today) ? 'text-muted' : 'text-strong'}`}>{title}</span>
        {facts && <span className={`mt-0.5 truncate text-meta ${stats?.backOnTrack ? 'text-hue' : 'text-muted'}`} data-habit-measure>{facts}</span>}
      </button>
      <span className="shrink-0 pe-3" data-phone-week>
        {bar ? <TargetBar thread={bar} /> : <Thread days={days} today={today} notes={notes} goal={goal || undefined} unit={series.habit_unit} step={14} />}
      </span>
      {/* The hold's menu, also a button for a keyboard or a screen reader (the hold is touch only). */}
      <ActionMenu label={t('More ways to check in {title}', { title })} title={title} open={menu} onOpenChange={setMenu} anchor={row} groups={[{ items }]}
        trigger={<span className="sr-only">{t('More ways to check in {title}', { title })}</span>} triggerClassName="sr-only" />
      </div>
      {/* "How did it go?" under the row after a check-in (habit-notes D2). */}
      {!past && <CheckInNote seriesId={series.id} title={title} className="ps-12 pe-3 pb-2" />}
    </li>
  )
}

export function PhoneHabits({ id }: { id?: string }) {
  const on = useHabitsEnabled()
  const today = useToday()
  const [chosen, setChosen] = useState(today)
  // The strip returns to today when the day changes (D2).
  useEffect(() => { setChosen(today) }, [today])
  const day = chosen > today ? today : chosen
  const model = useHabitsModel(day, today)
  const strip = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysISO(today, i - 6)), [today])
  const progress = useMemo(() => new Map(strip.map((d) => [d, dayProgress(model.open, model.rowsOf, d, today, model.opts)])), [strip, model.open, model.rowsOf, today, model.opts])
  if (!on) return model.loaded ? <HabitsOff /> : null
  if (id) return <HabitPage key={id} id={id} />
  const past = day !== today
  // An earlier day lists the habits with that day in their history (D2).
  const groups = past
    ? model.groups.map((g) => ({ ...g, items: g.items.filter((x) => editableDay({ date: day, state: dayStateOf(x, model.rowsOf(x), day, today, model.opts) }, today)) })).filter((g) => g.items.length > 0)
    : model.groups
  return (
    <PageBody width="form" data-habits-page data-phone-habits>
      <PageHeader title={t('Habits')} help="habits" meta={progressText(model.progress, !past)} barActions
        actions={<IconButton icon="plus" label={t('New habit')} onClick={() => openHabitForm()} className="touch-target" data-new-habit />} />
      {model.count > 0 && <DayStrip days={strip} chosen={day} today={today} progressOf={(d) => progress.get(d) ?? { kept: 0, due: 0 }} onChoose={setChosen} />}
      {model.count === 0 && model.graduated.length === 0 && (
        <EmptyState title={t('Start with something small')}
          control={(
            <div className="flex flex-wrap justify-center gap-2" data-habit-starters>
              {STARTERS.map((s) => <Button key={s()} size="sm" variant="secondary" onClick={() => openHabitForm({ title: s() })}>{s()}</Button>)}
            </div>
          )} />
      )}
      {groups.map(({ g, items }) => (
        <section key={g} aria-label={GROUP_TITLE[g]()} data-habit-group={g} className="mb-2">
          <ListGroupHeader title={GROUP_TITLE[g]()} />
          <ul>
            {items.map((x) => (
              <PhoneHabitRow key={x.id} series={x} rows={model.rowsOf(x)} day={day} today={today} opts={model.opts} hue={model.hue(x)} />
            ))}
          </ul>
        </section>
      ))}
      {!past && <GraduatedGroup habits={model.graduated} rowsOf={model.rowsOf} hue={model.hue} />}
      <DayNoteHost />
      <AmountHost />
    </PageBody>
  )
}
