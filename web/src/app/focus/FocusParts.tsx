// The pieces of the Focus screen (OpenSpec change focus-mode, design D6, D13): the
// timer card, the done state, the task (title, project, due, read-only notes,
// subtasks) and the two dialogs (the task picker and the Countdown length).
import { useEffect, useRef, useState, type RefObject } from 'react'
import { Button, ComboboxPanel, Dialog, Field, Icon, Input } from '../../ui'
import { formatDueLong } from '../../lib/dates'
import { useProjects, useSubtasks } from '../../lib/localData'
import { COUNTDOWN_BOUNDS, modeName, type FocusMode, type FocusPrefs } from '../../lib/focus/prefs'
import { clockText, displayMs, inRun, isRunning, type FocusState } from '../../lib/focus/timer'
import type { Task } from '../../lib/types'
import { t } from '../../lib/i18n'
import { keysOf } from '../../lib/shortcuts'
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

/** The line under the digits: which phase runs, or why it waits. */
export function phaseLine(s: FocusState | null, mode: FocusMode, prefs: FocusPrefs): string {
  if (!s || s.phase === 'idle') return t('Ready: {mode}', { mode: modeName(mode) })
  if (s.phase === 'done') return s.ended?.kind === 'break' ? t('Break over') : t('Session done')
  if (s.resumedAt === null) return s.pausedReason === 'elsewhere' ? t('Paused: the time entry was stopped on another device. Start again to go on.') : t('Paused')
  if (s.phase === 'break') return s.breakKind === 'long' ? t('Long break') : t('Short break')
  if (s.mode === 'pomodoro') return t('Work session {n} of {total}', { n: s.cycle, total: prefs.longBreakEvery })
  return s.mode === 'flowtime' ? t('Working, counting up') : t('Countdown')
}

export interface CardActions {
  onBreak: () => void
  onStop: () => void
  onNext: () => void
}

/** The timer: digits (hidden from assistive technology; the live region speaks), the phase line and the secondary buttons. */
export function TimerCard({ session, mode, prefs, now, actions }: { session: FocusState | null; mode: FocusMode; prefs: FocusPrefs; now: number; actions: CardActions }) {
  const ms = session ? displayMs(session, now, idlePlanMs(mode, prefs, session.lengthMinutes)) : idlePlanMs(mode, prefs, 25) ?? 0
  const working = session?.phase === 'work'
  return (
    <section aria-label={t('Timer')} data-focus-timer={session?.phase ?? 'idle'} data-running={isRunning(session) || undefined}
      className="rounded-card border border-default bg-surface p-5 text-center shadow-1">
      <p className="focus-clock" aria-hidden="true" data-focus-clock>{clockText(ms)}</p>
      <p className="mt-1 text-meta text-muted transition-opacity duration-(--duration-ui)" data-focus-phase>{phaseLine(session, session && inRun(session) ? session.mode : mode, prefs)}</p>
      {session?.entryId && <p className="mt-1 flex items-center justify-center gap-1 text-hint text-faint" data-focus-logged><Icon name="clock" size="xs" />{t('Logged as time on this task')}</p>}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {(working || session?.phase === 'break') && (
          <Button size="sm" variant="secondary" onClick={actions.onBreak} aria-keyshortcuts="b" data-focus-break>
            {session?.phase === 'break' ? t('End the break') : t('Take a break')} <span className="ui-kbd ml-1">{keysOf('focus.break')}</span>
          </Button>
        )}
        {working && session?.mode === 'flowtime' && <Button size="sm" variant="secondary" onClick={actions.onStop} data-focus-stop>{t('Done')}</Button>}
        <Button size="sm" variant="ghost" onClick={actions.onNext} aria-keyshortcuts="n" data-focus-next>
          {t('Next task')} <span className="ui-kbd ml-1">{keysOf('focus.next')}</span>
        </Button>
      </div>
    </section>
  )
}

export interface DoneAction { key: string; label: string; run: () => void }

/** What ended, the time worked, and the next steps; its first action takes the focus unless the user is typing. */
export function DoneState({ session, title, heading, actions, first }: { session: FocusState; title: string; heading: string; actions: DoneAction[]; first: RefObject<HTMLButtonElement | null> }) {
  const worked = session.ended?.workedMs ?? 0
  return (
    <section aria-labelledby="focus-done-heading" data-focus-done={session.ended?.kind} className="mb-4 rounded-card border border-default bg-surface p-4 shadow-1">
      <h2 id="focus-done-heading" className="text-h3 font-semibold text-strong">{heading}</h2>
      <p className="mt-1 text-meta text-muted">
        {session.ended?.kind !== 'break' && <span data-focus-worked>{t('{time} worked', { time: clockText(worked) })}</span>}
        {session.ended?.kind !== 'break' && title && ' · '}
        <span className="user-text">{title}</span>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {actions.map((a, i) => (
          <Button key={a.key} ref={i === 0 ? first : undefined} size="sm" variant={i === 0 ? 'primary' : 'secondary'} onClick={a.run} data-done-action={a.key}>{a.label}</Button>
        ))}
      </div>
    </section>
  )
}

/** The task: title, project, due, notes (read-only here; a click opens the panel to edit) and the subtasks as a checklist. */
export function FocusTask({ task }: { task: Task }) {
  const zone = useViewerZone()
  const projects = useProjects()
  const subtasks = useSubtasks(task.id)
  const project = task.project_id ? projects.find((p) => p.id === task.project_id) : null
  const done = subtasks.filter((c) => c.completed_at).length
  return (
    <article className="mt-4 space-y-3" data-focus-task={task.id} aria-labelledby="focus-task-title">
      <h2 id="focus-task-title" className="user-text text-h2 font-semibold text-strong">{task.title || t('Untitled')}</h2>
      {(project || task.due) && (
        <p className="flex flex-wrap gap-2 text-meta text-muted">
          {project && <span className="rounded-chip bg-sunken px-1.5" data-focus-project>{project.name}</span>}
          {task.due && <span>{t('Due {date}', { date: formatDueLong(task.due, zone) })}</span>}
        </p>
      )}
      {task.description?.trim()
        ? (
          <div className="relative rounded-control text-body" data-focus-notes>
            <Markdown source={task.description} />
            <Button size="sm" variant="ghost" className="mt-1" onClick={() => openTaskPanel(task.id)}>{t('Edit the notes')}</Button>
          </div>
        )
        : <Button size="sm" variant="ghost" onClick={() => openTaskPanel(task.id)} data-focus-notes-add>{t('Add notes')}</Button>}
      <section aria-label={t('Subtasks')} data-focus-subtasks>
        {subtasks.length > 0 && <h3 className="mb-1 text-meta font-semibold text-muted">{t('Subtasks')} <span className="font-normal text-faint">{done}/{subtasks.length}</span></h3>}
        <ul className="space-y-0.5 empty:hidden">
          {subtasks.map((c) => (
            <li key={c.id} className="flex items-center gap-2 rounded-control px-1 py-1">
              <input type="checkbox" className="h-4 w-4 shrink-0" checked={!!c.completed_at} onChange={() => act(completeWithUndo(c.id, !c.completed_at))}
                aria-label={c.completed_at ? t('Reopen {title}', { title: c.title }) : t('Complete {title}', { title: c.title })} />
              <span className={`min-w-0 flex-1 truncate user-text text-body ${c.completed_at ? 'text-faint line-through' : 'text-default'}`}>{c.title || t('Untitled')}</span>
            </li>
          ))}
        </ul>
        <AddSubtask parent={task} />
      </section>
    </article>
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

/** Countdown asks for its length first: 5 to 180 minutes, the last length on this device preselected. */
export function LengthDialog({ initial, onStart, onClose }: { initial: number; onStart: (minutes: number) => void; onClose: () => void }) {
  const [value, setValue] = useState(String(initial))
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => { field.current?.select() }, [])
  const n = Number(value)
  const [min, max] = COUNTDOWN_BOUNDS
  const valid = Number.isInteger(n) && n >= min && n <= max
  return (
    <Dialog title={t('Countdown')} onClose={onClose} size="sm">
      <form onSubmit={(e) => { e.preventDefault(); if (valid) onStart(n) }} className="space-y-3" data-focus-length>
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
