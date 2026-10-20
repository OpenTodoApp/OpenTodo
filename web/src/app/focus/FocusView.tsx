// The Focus screen (OpenSpec change focus-mode, design D6, D7, D9, D13): one open
// task with its notes and subtasks and a large timer, no task list. Without a task
// in the address it takes the first open task of today's focus (the Daily check),
// and after a session moves on to the next one. The running session is the
// device-local row (lib/focus/state.ts); the engine that ends it on time runs in
// the shell (BreakReminder), so leaving this screen keeps it running.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, EmptyState, MenuItem, MenuSeparator, Notice, PageBody, PageHeader } from '../../ui'
import { useReviewRow } from '../../lib/localData'
import { useLiveTasks } from '../../lib/liveTasks'
import { methodShown, useMethodMode } from '../../lib/method/mode'
import { storedFocus } from '../../lib/review'
import { FOCUS_MODES, setFocusPref, useFocusPrefs } from '../../lib/focus/prefs'
import { focusTarget, nextFocusTask } from '../../lib/focus/select'
import { breakSession, completeSession, leaveSession, pauseSession, resumeSession, startSession, stopSession } from '../../lib/focus/session'
import { useFocusState } from '../../lib/focus/state'
import { announcementAt, inRun, isRunning, type FocusState } from '../../lib/focus/timer'
import { primeTone } from '../../lib/focus/tone'
import { openHelp } from '../../lib/helpRequest'
import { keysOf } from '../../lib/shortcuts'
import type { Task } from '../../lib/types'
import { t } from '../../lib/i18n'
import { act } from '../actionError'
import { setPanelTaskId, usePanelTaskId } from '../panel'
import { keepFocus } from '../ReminderToasts'
import { navigate, routeBeforeFocus } from '../router'
import { isActivationTarget, useShortcutScope } from '../shortcuts'
import { completeWithUndo } from '../undoable'
import { useToday } from '../useViews'
import { DoneState, FocusTask, LengthDialog, modeName, TaskPickerDialog, TimerCard, type DoneAction } from './FocusParts'
import { useFocusClock } from './useFocusTimer'

/** The done state's heading and next steps for the session that ended. */
function doneContent(s: FocusState, nextOpen: boolean, run: { start: () => void; startBreak: () => void; complete: () => void; next: () => void; choose: () => void }): { heading: string; actions: DoneAction[] } {
  const e = s.ended
  if (e?.kind === 'complete') {
    // The screen already shows the next task of today's focus when there is one.
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

export function FocusView({ id }: { id?: string }) {
  const state = useFocusState()
  const prefs = useFocusPrefs()
  const tasks = useLiveTasks()
  const review = useReviewRow()
  const today = useToday()
  const method = useMethodMode()
  const openId = usePanelTaskId()
  const focusIds = useMemo(() => storedFocus(review, today), [review, today])
  const list = tasks ?? []
  const target = useMemo(() => focusTarget({ routeId: id, state, focusIds, tasks: tasks ?? [] }), [id, state, focusIds, tasks])
  const task = target.taskId ? list.find((x) => x.id === target.taskId) : undefined
  const session = state && task && state.taskId === task.id ? state : null
  const now = useFocusClock(isRunning(session))
  const running = inRun(session)
  const mode = running ? session!.mode : prefs.mode
  const [picker, setPicker] = useState(false)
  const [askLength, setAskLength] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const announce = useAnnouncement(session, now)
  const firstDone = useRef<HTMLButtonElement>(null)

  const begin = (minutes?: number) => {
    if (!task) return
    primeTone()
    if (prefs.mode === 'countdown' && minutes === undefined) { setAskLength(true); return }
    setAskLength(false)
    act(startSession(task.id, prefs, Date.now(), minutes))
  }
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
  const done = session?.phase === 'done' ? doneContent(session, !!task && !task.completed_at, { start: () => begin(), startBreak: breakToggle, complete: () => act(complete()), next: () => act(moveOn()), choose }) : { heading: '', actions: [] }

  // The done state takes the focus once per end, unless the user is typing or in a menu.
  const endKey = session?.phase === 'done' ? `${session.ended?.runStartedAt}:${session.ended?.kind}` : ''
  useEffect(() => {
    if (endKey && !keepFocus(document.activeElement as HTMLElement | null)) firstDone.current?.focus()
  }, [endKey])
  const unavailable = !!tasks && target.unavailable
  useEffect(() => { if (unavailable) setNotice(t('That task is not available any more, so today’s focus is shown.')) }, [unavailable])

  // Keys (design D7): the view's own `view` entries. The dispatcher keeps them out of
  // text fields; a focused button keeps its own Space and Enter; the panel's Esc wins while it is open.
  const plain = (e: KeyboardEvent) => !openId && !isActivationTarget(e.target)
  useShortcutScope('view', {
    'focus.escape': () => { if (openId) setPanelTaskId(null); else leave() },
    'focus.toggle': (e) => { if (!plain(e) || !task) return false; toggle() },
    'focus.complete': (e) => { if (!plain(e) || !task) return false; act(complete()) },
    'focus.break': () => { if (openId || !session) return false; breakToggle() },
    'focus.next': () => { if (openId) return false; act(moveOn()) },
  }, { view: 'focus', paused: picker || askLength })

  const toggleLabel = isRunning(session) ? t('Pause') : running ? t('Resume') : t('Start', { context: 'timer' })
  const overflow = (
    <>
      {FOCUS_MODES.map((m) => (
        <MenuItem key={m} label={modeName(m)} checked={mode === m} disabled={running} description={running ? t('A session is running') : undefined}
          onSelect={() => act(setFocusPref({ field: 'focus_mode', value: m }))} />
      ))}
      <MenuSeparator />
      <MenuItem label={t('Change task')} icon="search" onSelect={choose} />
      <MenuItem label={t('Settings')} icon="settings" onSelect={() => navigate({ view: 'settings', section: 'general' })} />
      <MenuItem label={t('Help')} icon="circle-help" description={t('The guide to Focus')} onSelect={() => openHelp('focus')} />
    </>
  )
  const actions = task && (
    <>
      <Button size="sm" variant="primary" onClick={toggle} aria-keyshortcuts="Space" data-focus-toggle>{toggleLabel}</Button>
      <Button size="sm" variant="secondary" onClick={() => act(complete())} aria-keyshortcuts="Enter" data-focus-complete disabled={!!task.completed_at}>{t('Complete')}</Button>
    </>
  )

  return (
    <PageBody width="list" data-focus>
      <PageHeader title={t('Focus')} meta={<span data-focus-mode>{modeName(mode)}</span>} actions={actions} overflow={overflow} back={{ label: t('Back'), onClick: leave }} />
      <p className="sr-only" role="status" aria-live="polite" data-focus-live>{announce}</p>
      {notice && <div className="mb-3"><Notice>{notice}</Notice></div>}
      {tasks === undefined || state === undefined ? null : !task ? (
        <div data-empty-state="focus">
          <EmptyState title={focusIds.length ? t('Today’s focus is done.') : t('Choose a task to focus on.')} action={{ label: t('Choose a task'), onClick: choose }}
            secondary={methodShown(method) ? { label: t('Choose today’s focus in the Daily check'), onClick: () => navigate({ view: 'review', step: 'daily' }) } : undefined} />
        </div>
      ) : (
        <>
          {session?.phase === 'done' && session.ended && (
            <DoneState session={session} first={firstDone} heading={done.heading} actions={done.actions}
              title={session.ended.kind === 'complete' ? (tasks.find((x) => x.id === session.ended?.taskId)?.title ?? '') : task.title} />
          )}
          <TimerCard session={session} mode={mode} prefs={prefs} now={now} actions={{ onBreak: breakToggle, onStop: () => act(stopSession()), onNext: () => act(moveOn()) }} />
          {!task.completed_at && <FocusTask task={task} />}
          <p className="mt-4 text-hint text-faint">{t('Space starts and pauses, Enter completes, {b} takes a break, {n} is the next task, Esc goes back.', { b: keysOf('focus.break'), n: keysOf('focus.next') })}</p>
        </>
      )}
      {picker && <TaskPickerDialog tasks={list} onPick={(x) => act(pick(x))} onClose={() => setPicker(false)} />}
      {askLength && task && <LengthDialog initial={state?.lengthMinutes ?? 25} onStart={(m) => begin(m)} onClose={() => setAskLength(false)} />}
    </PageBody>
  )
}
