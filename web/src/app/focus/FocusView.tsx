// The Focus screen (OpenSpec changes focus-mode and focus-redesign): "I'm working on
// THIS now". One centred stage holds the task, the time left, the state line and
// one primary control; the mode, Change task, noise, Today's sessions, Settings and
// Help are in the header's menu, the notes and subtasks behind one disclosure.
// Without a task in the address it takes the first open task of today's focus (the
// Daily check), and after a session moves on to the next one. The running session
// is the device-local row (lib/focus/state.ts); the engine that ends it on time runs
// in the shell (BreakReminder), so leaving this screen keeps it running.
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Button, EmptyState, IconButton, MenuItem, MenuSeparator, Notice, PageBody, PageHeader } from '../../ui'
import { useReviewRow, useSubtasks, useUserPrefsRow } from '../../lib/localData'
import { orderedFocusIds } from '../../lib/bento'
import { useLiveTasks } from '../../lib/liveTasks'
import { methodShown, useMethodMode } from '../../lib/method/mode'
import { FOCUS_MODES, setFocusPref, useFocusPrefs } from '../../lib/focus/prefs'
import { focusTarget, nextFocusTask } from '../../lib/focus/select'
import { breakSession, canExtend, completeSession, EXTEND_MINUTES, extendSession, leaveSession, pauseSession, resumeSession, stopSession } from '../../lib/focus/session'
import { useFocusState } from '../../lib/focus/state'
import { announcementAt, inRun, isRunning, type FocusState } from '../../lib/focus/timer'
import { openHelp } from '../../lib/helpRequest'
import { keysOf } from '../../lib/shortcuts'
import type { Task } from '../../lib/types'
import { t } from '../../lib/i18n'
import { act } from '../actionError'
import { setPanelTaskId, usePanelTaskId } from '../panel'
import { PanelBoundary } from '../PanelBoundary'
import { keepFocus } from '../ReminderToasts'
import { navigate, routeBeforeFocus } from '../router'
import { isActivationTarget, useShortcutScope } from '../shortcuts'
import { useShortcutHints } from '../shortcuts/hints'
import { completeWithUndo } from '../undoable'
import { useToday } from '../useViews'
import { FocusDetails, FocusStage, LengthDialog, modeName, StageControls, TaskPickerDialog, type DoneAction } from './FocusParts'
import { useFocusClock } from './useFocusTimer'
import { clearAskLength, startFocusOn, useAskLength } from './startFocus'
import { FocusMenuItem } from './focusRequest'

// Today's sessions is its own chunk, loaded when the menu entry is chosen (focus-redesign D5).
const FocusSessions = lazy(() => import('./FocusSessions'))

/** The done state's line and next steps for the session that ended; the first step is the one primary button (focus-redesign D4). */
function doneContent(s: FocusState, nextOpen: boolean, run: { start: () => void; startBreak: () => void; complete: () => void; next: () => void; choose: () => void }): { heading: string; actions: DoneAction[] } {
  const e = s.ended
  if (e?.kind === 'complete') {
    // The stage already shows the next task of today's focus when there is one, so starting it is the step.
    return nextOpen
      ? { heading: t('Task completed'), actions: [{ key: 'start', label: t('Start the next session'), run: run.start }, { key: 'choose', label: t('Choose another task'), run: run.choose }] }
      : { heading: t('Today’s focus is done.'), actions: [{ key: 'choose', label: t('Choose a task'), run: run.choose }] }
  }
  if (e?.kind === 'break') return { heading: t('Break over'), actions: [{ key: 'start', label: t('Start the next session'), run: run.start }, { key: 'next', label: t('Next task'), run: run.next }] }
  const first: DoneAction = s.mode === 'pomodoro' ? { key: 'break', label: t('Start the break'), run: run.startBreak }
    : s.mode === 'flowtime' ? { key: 'break', label: t('Take a break'), run: run.startBreak }
      : { key: 'start', label: t('Start another session'), run: run.start }
  return { heading: t('Session done'), actions: [first, { key: 'complete', label: t('Complete the task'), run: run.complete }, { key: 'next', label: t('Next task'), run: run.next }] }
}

/** The polite announcement of the timer: said when its key changes, never every second. */
function useAnnouncement(session: FocusState | null, now: number): string {
  const [text, setText] = useState('')
  const last = useRef('')
  const a = session ? announcementAt(session, now) : null
  useEffect(() => {
    if (!a || a.key === last.current) return
    last.current = a.key
    setText(a.text)
  }, [a?.key, a?.text]) // eslint-disable-line react-hooks/exhaustive-deps -- `a` is recomputed every render; its key decides
  return text
}

/** "+5 min" and "+15 min" (focus-everywhere D4): the finished work session goes on for that long. */
function ExtendButtons({ onExtend }: { onExtend: (minutes: number) => void }) {
  return (
    <>
      {EXTEND_MINUTES.map((m) => (
        <Button key={m} variant="ghost" onClick={() => onExtend(m)} data-focus-extend={m}>{t('+{n} min', { n: m })}</Button>
      ))}
    </>
  )
}

interface ControlProps {
  task: Task
  session: FocusState | null
  onToggle: () => void
  onComplete: () => void
  onBreak: () => void
  onStop: () => void
  onNext: () => void
  onExtend?: (minutes: number) => void
}

/**
 * The controls under the time (focus-redesign D1): one primary button (Start, Pause,
 * Resume, or End the break), Complete beside it (Flowtime's Stop takes that place
 * while it counts, Complete then joins the quiet icons), then Next task and Take a
 * break as quiet icon buttons whose tooltips carry their keys.
 */
function Controls({ task, session, onToggle, onComplete, onBreak, onStop, onNext, onExtend }: ControlProps) {
  const hints = useShortcutHints()
  const resting = session?.phase === 'break'
  const working = session?.phase === 'work'
  const flowing = working && session?.mode === 'flowtime'
  const toggleLabel = isRunning(session) ? t('Pause') : inRun(session) ? t('Resume') : t('Start', { context: 'timer' })
  const toggle = <Button size="lg" variant="primary" className="min-w-32" onClick={onToggle} aria-keyshortcuts="Space" data-focus-toggle>{toggleLabel}</Button>
  const breakRuns = resting && isRunning(session)
  const endBreak = <Button size="lg" variant={breakRuns ? 'primary' : 'secondary'} className={breakRuns ? 'min-w-32' : undefined} onClick={onBreak} aria-keyshortcuts="b" data-focus-break>{t('End the break')}</Button>
  const complete = flowing
    ? <IconButton icon="check" size="lg" label={t('Complete')} shortcut={keysOf('focus.complete')} onClick={onComplete} aria-keyshortcuts="Enter" data-focus-complete disabled={!!task.completed_at} />
    : <Button size="lg" variant="secondary" onClick={onComplete} aria-keyshortcuts="Enter" data-focus-complete disabled={!!task.completed_at}>{t('Complete')}</Button>
  return (
    <>
      <StageControls>
        {/* A running break's one step is ending it (Space still pauses it); a paused break offers Resume first. */}
        {breakRuns ? endBreak : toggle}
        {resting && !breakRuns && endBreak}
        {resting ? null : flowing ? <Button size="lg" variant="secondary" onClick={onStop} data-focus-stop>{t('Stop the timer')}</Button> : complete}
        {flowing && complete}
        {onExtend && <ExtendButtons onExtend={onExtend} />}
        <IconButton icon="arrow-right" size="lg" label={t('Next task')} shortcut={keysOf('focus.next')} onClick={onNext} aria-keyshortcuts="n" data-focus-next />
        {working && <IconButton icon="coffee" size="lg" label={t('Take a break')} shortcut={keysOf('focus.break')} onClick={onBreak} aria-keyshortcuts="b" data-focus-break />}
      </StageControls>
      {/* Keys live in the tooltips, the menu and the cheat sheet; printed only with "Show shortcut hints" on (D6). */}
      {hints && (
        <p className="mt-4 text-hint text-faint" data-focus-hints data-kbd-hint>
          {t('Space starts and pauses, Enter completes, {b} takes a break, {n} is the next task, Esc goes back.', { b: keysOf('focus.break'), n: keysOf('focus.next') })}
        </p>
      )}
    </>
  )
}

/** The done state's row: its one primary next step, the others quiet, Extend among them while it applies. */
function DoneControls({ actions, first, onExtend }: { actions: DoneAction[]; first: RefObject<HTMLButtonElement | null>; onExtend?: (minutes: number) => void }) {
  return (
    <StageControls>
      {actions.map((a, i) => (
        <Button key={a.key} ref={i === 0 ? first : undefined} size="lg" variant={i === 0 ? 'primary' : 'ghost'} className={i === 0 ? 'min-w-32' : undefined} onClick={a.run} data-done-action={a.key}>{a.label}</Button>
      ))}
      {onExtend && <ExtendButtons onExtend={onExtend} />}
    </StageControls>
  )
}

export function FocusView({ id }: { id?: string }) {
  const state = useFocusState()
  const prefs = useFocusPrefs()
  const tasks = useLiveTasks()
  const review = useReviewRow()
  const today = useToday()
  const method = useMethodMode()
  const openId = usePanelTaskId()
  const userPrefs = useUserPrefsRow()
  // Opens on the first task of today's focus in the Bento order (bento-daily-check D6).
  const focusIds = useMemo(() => orderedFocusIds(review, userPrefs, today, tasks ?? []), [review, userPrefs, today, tasks])
  const list = tasks ?? []
  const target = useMemo(() => focusTarget({ routeId: id, state, focusIds, tasks: tasks ?? [] }), [id, state, focusIds, tasks])
  const task = target.taskId ? list.find((x) => x.id === target.taskId) : undefined
  const subtasks = useSubtasks(task?.id ?? '')
  const nextSubtask = subtasks.find((c) => !c.completed_at) ?? null
  const session = state && task && state.taskId === task.id ? state : null
  // The clock also ticks while "+5 min" is offered, so the offer goes after its 10 minutes.
  const [extendable, setExtendable] = useState(false)
  const now = useFocusClock(isRunning(session) || extendable)
  const extend = canExtend(session, now)
  useEffect(() => setExtendable(extend), [extend])
  const running = inRun(session)
  const mode = running ? session!.mode : prefs.mode
  const [picker, setPicker] = useState(false)
  const [askLength, setAskLength] = useState(false)
  const [sessions, setSessions] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const announce = useAnnouncement(session, now)
  const firstDone = useRef<HTMLButtonElement>(null)

  const begin = (minutes?: number) => {
    if (!task) return
    if (prefs.mode === 'countdown' && minutes === undefined) { setAskLength(true); return }
    setAskLength(false)
    act(startFocusOn(task.id, { lengthMinutes: minutes, navigate: false, force: true }))
  }
  // "Start focus" in Countdown opens this screen with the length dialog (focus-everywhere D2).
  const askFor = useAskLength()
  useEffect(() => {
    if (!task || askFor !== task.id) return
    clearAskLength()
    setAskLength(true)
  }, [askFor, task?.id]) // eslint-disable-line react-hooks/exhaustive-deps -- the task's id decides
  const onExtend = (minutes: number) => act(extendSession(minutes))
  const toggle = () => {
    if (!task) return
    if (isRunning(session)) act(pauseSession())
    else if (running) act(resumeSession())
    else begin()
  }
  const complete = async () => {
    if (!task) return
    const after = nextFocusTask(focusIds, list, task.id)
    await completeSession(task.id, after, prefs)
    await completeWithUndo(task.id, true)
    if (id) navigate({ view: 'focus', ...(after ? { id: after } : {}) }, { replace: true })
  }
  const choose = () => setPicker(true)
  const moveOn = async () => {
    const after = nextFocusTask(focusIds, list, task?.id ?? null)
    if (!after) { setNotice(t('Today’s focus is done.')); setPicker(true); return }
    await leaveSession(after, prefs)
    navigate({ view: 'focus', id: after })
  }
  const pick = async (x: Task) => {
    setPicker(false)
    if (x.id !== task?.id) await leaveSession(x.id, prefs)
    navigate({ view: 'focus', id: x.id })
  }
  const leave = () => navigate(routeBeforeFocus())
  const breakToggle = () => { if (session) act(breakSession(prefs)) }
  const ended = session?.phase === 'done' && session.ended ? session.ended : null
  const done = ended ? doneContent(session!, !!task && !task.completed_at, { start: () => begin(), startBreak: breakToggle, complete: () => act(complete()), next: () => act(moveOn()), choose }) : null
  // After a completion the stage may already show the next task: the line names the one completed.
  const endedTitle = ended?.kind === 'complete' && ended.taskId !== task?.id ? (list.find((x) => x.id === ended.taskId)?.title ?? '') : undefined

  // The done state takes the focus once per end, unless the user is typing or in a menu.
  const endKey = ended ? `${ended.runStartedAt}:${ended.kind}` : ''
  useEffect(() => {
    if (endKey && !keepFocus(document.activeElement as HTMLElement | null)) firstDone.current?.focus()
  }, [endKey])
  // Derived, not stored: on a fresh device the task may arrive with the first sync, and the notice then goes.
  const unavailable = !!tasks && target.unavailable
  // The content column takes the break's tone (index.css): a mark on the root, set before paint,
  // since a `:has()` on #content restyled every list on every change (issue 1179).
  const resting = session?.phase === 'break'
  useLayoutEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-focus-stage', resting ? 'resting' : '')
    return () => root.removeAttribute('data-focus-stage')
  }, [resting])

  // Keys (design D7): the view's own `view` entries. The dispatcher keeps them out of
  // text fields; a focused button keeps its own Space and Enter; the panel's Esc wins while it is open.
  const plain = (e: KeyboardEvent) => !openId && !isActivationTarget(e.target)
  useShortcutScope('view', {
    'focus.escape': () => { if (openId) setPanelTaskId(null); else leave() },
    'focus.toggle': (e) => { if (!plain(e) || !task) return false; toggle() },
    'focus.complete': (e) => { if (!plain(e) || !task) return false; act(complete()) },
    'focus.break': () => { if (openId || !session) return false; breakToggle() },
    'focus.next': () => { if (openId) return false; act(moveOn()) },
  }, { view: 'focus', paused: picker || askLength || sessions })

  // The menu (focus-redesign D2): the mode, checked, then Change task, the focus command, noise, Today's sessions, Settings and Help.
  const overflow = (
    <>
      {FOCUS_MODES.map((m) => (
        <MenuItem key={m} label={modeName(m)} checked={mode === m} disabled={running} description={running ? t('A session is running') : undefined}
          onSelect={() => act(setFocusPref({ field: 'focus_mode', value: m }))} />
      ))}
      <MenuSeparator />
      <MenuItem label={t('Change task')} icon="search" onSelect={choose} />
      {/* In or out of today's focus by touch (phone-touch-focus). */}
      {task && <FocusMenuItem task={task} />}
      {/* The noise toggle (focus-everywhere D6): Noise on chooses Brown; Settings offers the other kinds. */}
      <MenuItem label={prefs.noise === 'off' ? t('Noise on') : t('Noise off')} icon="audio-lines" data-focus-noise-toggle
        onSelect={() => act(setFocusPref({ field: 'focus_noise', value: prefs.noise === 'off' ? 'brown' : 'off' }))} />
      <MenuItem label={t('Today’s sessions')} icon="history" data-focus-sessions-open onSelect={() => setSessions(true)} />
      <MenuSeparator />
      <MenuItem label={t('Settings')} icon="settings" onSelect={() => navigate({ view: 'settings', section: 'general' })} />
      <MenuItem label={t('Help')} icon="circle-help" description={t('The guide to Focus')} onSelect={() => openHelp('focus')} />
    </>
  )

  return (
    <PageBody width="list" data-focus className="focus-page" data-resting={resting || undefined}>
      <PageHeader title={t('Focus')} overflow={overflow} back={{ label: t('Back'), onClick: leave }} />
      <p className="sr-only" role="status" aria-live="polite" data-focus-live>{announce}</p>
      {(notice || unavailable) && <div className="mt-3"><Notice>{notice ?? t('That task is not available any more, so today’s focus is shown.')}</Notice></div>}
      {tasks === undefined || state === undefined ? null : !task ? (
        <div data-empty-state="focus">
          <EmptyState title={focusIds.length ? t('Today’s focus is done.') : t('Choose a task to focus on.')} action={{ label: t('Choose a task'), onClick: choose }}
            secondary={methodShown(method) ? { label: t('Choose today’s focus in the Daily check'), onClick: () => navigate({ view: 'review', step: 'daily' }) } : undefined} />
        </div>
      ) : (
        <FocusStage task={task} session={session} mode={mode} prefs={prefs} now={now} nextSubtask={task.completed_at ? null : nextSubtask}
          done={done && ended ? { kind: ended.kind, heading: done.heading, title: endedTitle } : undefined}>
          {done
            ? <DoneControls actions={done.actions} first={firstDone} onExtend={extend ? onExtend : undefined} />
            : <Controls task={task} session={session} onToggle={toggle} onComplete={() => act(complete())} onBreak={breakToggle} onStop={() => act(stopSession())}
                onNext={() => act(moveOn())} onExtend={extend && session?.phase === 'break' ? onExtend : undefined} />}
          {!task.completed_at && <FocusDetails task={task} subtasks={subtasks} />}
        </FocusStage>
      )}
      {picker && <TaskPickerDialog tasks={list} onPick={(x) => act(pick(x))} onClose={() => setPicker(false)} />}
      {askLength && task && <LengthDialog initial={state?.lengthMinutes ?? 25} presets={prefs.presets} onStart={(m) => begin(m)} onClose={() => setAskLength(false)} />}
      {sessions && <PanelBoundary><Suspense fallback={null}><FocusSessions onClose={() => setSessions(false)} /></Suspense></PanelBoundary>}
    </PageBody>
  )
}
