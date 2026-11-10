// The pieces of the Focus screen (OpenSpec changes focus-mode and focus-redesign):
// the stage (project, title, next open subtask, the time, the state line), the
// "Notes and subtasks" disclosure, and the two dialogs (the task picker and the
// Countdown length). The screen composes them in FocusView.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Button, ComboboxPanel, Dialog, Field, Icon, Input, Tooltip } from '../../ui'
import { formatDueLong } from '../../lib/dates'
import { createStoredValue } from '../../lib/deviceStorage'
import { useProjects } from '../../lib/localData'
import { COUNTDOWN_BOUNDS, modeName, type FocusMode, type FocusPrefs } from '../../lib/focus/prefs'
import { clockText, displayMs, inRun, isRunning, type FocusState } from '../../lib/focus/timer'
import type { Task } from '../../lib/types'
import { t } from '../../lib/i18n'
import { Markdown } from '../Markdown'
import { openTaskPanel } from '../panel'
import { AddSubtask } from '../task-detail/TaskDetail'
import { completeWithUndo } from '../undoable'
import { useViewerZone } from '../useViews'
import { act } from '../actionError'

export { modeName } from '../../lib/focus/prefs'

/** The plan the digits show before a session starts. */
export function idlePlanMs(mode: FocusMode, prefs: FocusPrefs, lengthMinutes: number): number | null {
  return mode === 'pomodoro' ? prefs.workMinutes * 60_000 : mode === 'countdown' ? lengthMinutes * 60_000 : 0
}

/**
 * The state line under the time (focus-redesign D2): the mode where it matters, the
 * phase and the cycle position, as "Pomodoro · Work · 2 of 4", "Flowtime",
 * "Countdown · 25 min", "Short break" or "Paused". The done state brings its own line.
 */
export function stateLine(s: FocusState | null, mode: FocusMode, prefs: FocusPrefs): string {
  const name = modeName(mode)
  if (!s || s.phase === 'idle' || s.phase === 'done') return [name, t('Ready')].join(' · ')
  if (s.resumedAt === null) return s.pausedReason === 'elsewhere' ? t('Paused: the time entry was stopped on another device. Start again to go on.') : t('Paused')
  if (s.phase === 'break') return s.breakKind === 'long' ? t('Long break') : t('Short break')
  if (s.mode === 'pomodoro') return [name, t('Work'), t('{n} of {total}', { n: s.cycle, total: prefs.longBreakEvery })].join(' · ')
  if (s.mode === 'countdown') return [name, t('{n} min', { n: Math.round((s.plannedMs ?? s.lengthMinutes * 60_000) / 60_000) })].join(' · ')
  return name
}

/** What ended and what comes next: the done state's line and its one primary step first (focus-redesign D4). */
export interface DoneAction { key: string; label: string; run: () => void }

/**
 * The stage (focus-redesign D1): one centred column, no card. The project small and
 * muted, the title at the display step (three lines at most, the whole title in its
 * name), the next open subtask, the time, the state line, then `children`: the
 * controls row, or the done state's. A break dims the title; the page takes the
 * sunken tone (FocusView).
 */
export function FocusStage({ task, session, mode, prefs, now, nextSubtask, done, children }: {
  task: Task
  session: FocusState | null
  mode: FocusMode
  prefs: FocusPrefs
  now: number
  nextSubtask: Task | null
  /** The done state's line: what ended, and the completed task when the stage already shows the next one. */
  done?: { kind: 'work' | 'break' | 'complete'; heading: string; title?: string }
  children: ReactNode
}) {
  const projects = useProjects()
  const project = task.project_id ? projects.find((p) => p.id === task.project_id) : null
  const ms = session ? displayMs(session, now, idlePlanMs(mode, prefs, session.lengthMinutes)) : idlePlanMs(mode, prefs, 25) ?? 0
  const phase = session?.phase ?? 'idle'
  const resting = phase === 'break'
  const title = task.title || t('Untitled')
  const digits = <span className="focus-clock" data-focus-clock>{clockText(ms)}</span>
  const line = stateLine(session, session && inRun(session) ? session.mode : mode, prefs)
  const logged = !!session?.entryId && phase === 'work'
  return (
    <section className="focus-stage" data-focus-task={task.id} data-focus-done={done?.kind} aria-labelledby="focus-task-title">
      <p className="min-h-[1.125rem] text-meta text-muted" data-focus-project>{project?.name ?? ''}</p>
      <h2 id="focus-task-title" aria-label={title} data-focus-title data-resting={resting || undefined}
        className="focus-title user-text">{title}</h2>
      {nextSubtask && <NextSubtask task={nextSubtask} />}
      <div className="mt-10 flex flex-col items-center md:mt-12" data-focus-timer={phase} data-running={isRunning(session) || undefined}>
        {done
          // A finished run is still: the time worked is said in words, not hidden.
          ? <p className="focus-clock-line" data-focus-worked>{t.rich('{time} worked', { time: digits })}</p>
          : <p className="focus-clock-line" aria-hidden="true">{digits}</p>}
        {done ? (
          <h3 id="focus-done-heading" className="mt-2 text-meta font-medium text-default">
            {done.heading}{done.title && <span className="font-normal text-muted"> · <span className="user-text">{done.title}</span></span>}
          </h3>
        ) : logged ? (
          <Tooltip label={t('Logged as time on this task')}>
            <p className="mt-2 text-meta text-muted" data-focus-phase data-focus-logged>{line}</p>
          </Tooltip>
        ) : <p className="mt-2 text-meta text-muted" data-focus-phase>{line}</p>}
      </div>
      {children}
    </section>
  )
}

/** The next open subtask as one line (focus-redesign D1): ticking it completes it with Undo and the following one takes its place. */
function NextSubtask({ task }: { task: Task }) {
  const title = task.title || t('Untitled')
  return (
    <div className="mt-4 flex min-w-0 max-w-full items-center justify-center gap-2 text-body text-muted" data-focus-next-subtask={task.id}>
      <SubtaskCheck task={task} />
      <span className="user-text min-w-0 truncate">{title}</span>
    </div>
  )
}

/** A subtask's round checkbox, as in the lists: ticks or reopens it with Undo. */
function SubtaskCheck({ task }: { task: Task }) {
  const done = !!task.completed_at
  const title = task.title || t('Untitled')
  return (
    <button type="button" className="group/check touch-target inline-flex size-6 shrink-0 items-center justify-center rounded-full"
      aria-label={done ? t('Reopen {title}', { title }) : t('Complete {title}', { title })} onClick={() => act(completeWithUndo(task.id, !done))}>
      <span className={`flex size-4 items-center justify-center rounded-full border-2 transition-colors duration-(--duration-ui) ${done ? 'border-input bg-faint text-on-accent' : 'border-input group-hover/check:border-strong group-hover/check:bg-success-soft'}`}>
        {done && <Icon name="check" size="xs" />}
      </span>
    </button>
  )
}

/** The controls row under the time: wraps on a phone, centred. */
export function StageControls({ children }: { children: ReactNode }) {
  return <div className="mt-8 flex flex-wrap items-center justify-center gap-2" data-focus-controls>{children}</div>
}

// "Notes and subtasks" (focus-redesign D3): closed by default, remembered on this device only.
export const DETAILS_KEY = 'opentodo.focusDetails'
const details = createStoredValue<boolean>(DETAILS_KEY, { parse: (raw) => raw === '1', serialize: (on) => (on ? '1' : null) })
export const setFocusDetailsOpen = details.set

/** The task's due, notes (read-only; Edit opens the panel) and the whole checklist, behind one disclosure. */
export function FocusDetails({ task, subtasks }: { task: Task; subtasks: readonly Task[] }) {
  const open = details.use()
  const zone = useViewerZone()
  const body = useId()
  const done = subtasks.filter((c) => c.completed_at).length
  return (
    <div className="mt-12 flex w-full max-w-xl flex-col items-center" data-focus-details={open ? 'open' : 'closed'}>
      <button type="button" aria-expanded={open} aria-controls={body} onClick={() => details.set(!open)} data-focus-details-toggle
        className="ui-btn ui-btn--ghost ui-btn--sm text-muted">
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size="sm" />
        {t('Notes and subtasks')}
        {subtasks.length > 0 && <span className="tabular-nums text-faint">{done}/{subtasks.length}</span>}
      </button>
      {open && (
        <div id={body} className="mt-4 w-full space-y-4 text-left">
          {task.due && <p className="text-meta text-muted" data-focus-due>{t('Due {date}', { date: formatDueLong(task.due, zone) })}</p>}
          {task.description?.trim()
            ? (
              <div className="text-body" data-focus-notes>
                <Markdown source={task.description} />
                <Button size="sm" variant="ghost" className="-ml-2.5 mt-1" onClick={() => openTaskPanel(task.id)}>{t('Edit the notes')}</Button>
              </div>
            )
            : <Button size="sm" variant="ghost" className="-ml-2.5" onClick={() => openTaskPanel(task.id)} data-focus-notes-add>{t('Add notes')}</Button>}
          <section aria-label={t('Subtasks')} data-focus-subtasks>
            <ul className="space-y-0.5 empty:hidden">
              {subtasks.map((c) => (
                <li key={c.id} className="flex items-center gap-2 py-1">
                  <SubtaskCheck task={c} />
                  <span className={`min-w-0 flex-1 truncate user-text text-body ${c.completed_at ? 'text-faint line-through' : 'text-default'}`}>{c.title || t('Untitled')}</span>
                </li>
              ))}
            </ul>
            <AddSubtask parent={task} />
          </section>
        </div>
      )}
    </div>
  )
}

/** "Change task" and the empty state: the smart picker over open tasks, ranked by recent picks in this context. */
export function TaskPickerDialog({ tasks, onPick, onClose }: { tasks: readonly Task[]; onPick: (task: Task) => void; onClose: () => void }) {
  const open = tasks.filter((x) => !x.completed_at)
  return (
    <Dialog title={t('Choose a task')} onClose={onClose} size="sm">
      <ComboboxPanel<Task> label={t('Task to focus on')} placeholder={t('Find a task…')} emptyText={t('No open task matches.')} source={open}
        getKey={(x) => x.id} getLabel={(x) => x.title || t('Untitled')} rankContext="focus" onPick={onPick} onClose={onClose} />
    </Dialog>
  )
}

/** Countdown asks for its length first: the user's presets as chips that start at once (focus-everywhere D5), or 5 to 180 minutes in the field, the last length on this device preselected. */
export function LengthDialog({ initial, presets = [], onStart, onClose }: { initial: number; presets?: readonly number[]; onStart: (minutes: number) => void; onClose: () => void }) {
  const [value, setValue] = useState(String(initial))
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => { field.current?.select() }, [])
  const n = Number(value)
  const [min, max] = COUNTDOWN_BOUNDS
  const valid = Number.isInteger(n) && n >= min && n <= max
  return (
    <Dialog title={t('Countdown')} onClose={onClose} size="sm">
      <form onSubmit={(e) => { e.preventDefault(); if (valid) onStart(n) }} className="space-y-3" data-focus-length>
        {presets.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('Presets')} data-focus-presets>
            {presets.map((m) => (
              <Button key={m} size="sm" variant="secondary" type="button" onClick={() => onStart(m)} data-focus-preset={m}
                aria-label={t('{n, plural, one {Start # minute} other {Start # minutes}}', { n: m })}>{t('{n} min', { n: m })}</Button>
            ))}
          </div>
        )}
        <Field label={t('Length in minutes')} error={valid ? undefined : t('From {min} to {max} minutes', { min, max })}>
          <Input ref={field} type="number" inputMode="numeric" min={min} max={max} value={value} autoFocus onChange={(e) => setValue(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="secondary" type="button" onClick={onClose}>{t('Cancel')}</Button>
          <Button size="sm" variant="primary" type="submit" disabled={!valid}>{t('Start', { context: 'timer' })}</Button>
        </div>
      </form>
    </Dialog>
  )
}
