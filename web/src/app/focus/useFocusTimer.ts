// The focus timer's engine (OpenSpec change focus-mode, design D1, D3, D12):
// mounted once by the shell (through BreakReminder), so a session ends on time on
// every screen. It reads the clock each second while a run is on and again when
// the tab is shown or focused, writes the end through one guarded transition, and
// derives every effect of that end from the row change: the tone (only while the
// tab is visible; a tab that saw the end hidden plays it when shown), the system
// notification (hidden tab, permission granted, tagged per run so two tabs show
// one), and the end of the session when its task is completed or trashed elsewhere.
import { useEffect, useMemo, useRef, useState } from 'react'
import { getTask, useReviewRow } from '../../lib/localData'
import { useLiveTasks } from '../../lib/liveTasks'
import { swRegistration } from '../../lib/push'
import { storedFocus } from '../../lib/review'
import { useFocusPrefs, type FocusPrefs } from '../../lib/focus/prefs'
import { nextFocusTask } from '../../lib/focus/select'
import { completeSession, finishIfDue, noteEntryStopped } from '../../lib/focus/session'
import { useEntryRunning } from '../../lib/focus/live'
import { useFocusState } from '../../lib/focus/state'
import { inRun, isDue, isRunning, type FocusState } from '../../lib/focus/timer'
import { playTone } from '../../lib/focus/tone'
import { t } from '../../lib/i18n'
import { useToday } from '../useViews'
import { resettable } from '../../lib/moduleState'

/** Now, re-read every second while `active` and whenever the tab is shown or focused. */
export function useFocusClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const read = () => setNow(Date.now())
    read()
    const id = active ? setInterval(read, 1000) : null
    document.addEventListener('visibilitychange', read)
    window.addEventListener('focus', read)
    return () => {
      if (id) clearInterval(id)
      document.removeEventListener('visibilitychange', read)
      window.removeEventListener('focus', read)
    }
  }, [active])
  return now
}

/** Tags already notified in this window (two engines of one page show one). */
const notified = new Set<string>()

/** Forgets the notified tags (tests). */
export function resetFocusNotices(): void {
  notified.clear()
}
resettable('focusNotices', resetFocusNotices)

/** The end of a run while the tab is hidden: one system notification through the service worker, when allowed. */
export async function notifyFocusEnd(s: FocusState): Promise<boolean> {
  if (!s.ended || typeof document === 'undefined' || document.visibilityState !== 'hidden') return false
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false
  const tag = `focus:${s.ended.runStartedAt}`
  if (notified.has(tag)) return false
  notified.add(tag)
  const task = await getTask(s.ended.taskId ?? s.taskId)
  const title = s.ended.kind === 'break' ? t('Break over') : t('Session done')
  const options: NotificationOptions = { body: task?.title || t('Untitled'), tag, icon: '/pwa-192.png', data: { url: '/focus' } }
  try {
    const reg = await swRegistration(1000)
    if (reg) await reg.showNotification(title, options)
    else new Notification(title, options)
    return true
  } catch {
    // Notifications can be blocked at any time; the done state is still there.
    return false
  }
}

const endKey = (s: FocusState | null | undefined) => (s?.ended ? `${s.ended.runStartedAt}:${s.ended.at}:${s.ended.kind}` : '')

/** A visible end younger than this plays the tone; an older one (a reload, a tab back after an hour) is shown silently. */
const FRESH_MS = 5000

function useEndEffects(state: FocusState | null | undefined, prefs: FocusPrefs): void {
  const seen = useRef<string | null>(null)
  const pendingTone = useRef(false)
  const key = endKey(state)
  useEffect(() => {
    if (state === undefined) return
    // The end the page loaded with is not replayed.
    if (seen.current === null) { seen.current = key; return }
    if (key === seen.current) return
    seen.current = key
    if (!state?.ended) return
    if (document.visibilityState === 'hidden') {
      pendingTone.current = prefs.sound
      void notifyFocusEnd(state)
    } else if (prefs.sound && Date.now() - state.ended.at < FRESH_MS) void playTone()
  }, [key, state, prefs.sound])
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !pendingTone.current) return
      pendingTone.current = false
      void playTone()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])
}

/** The session's task completed or trashed on any screen or device: the session ends and the next task of today's focus is offered. */
function useTaskGone(state: FocusState | null | undefined, prefs: FocusPrefs, now: number): void {
  const tasks = useLiveTasks()
  const review = useReviewRow()
  const today = useToday()
  const focusIds = useMemo(() => storedFocus(review, today), [review, today])
  const watching = state && inRun(state) ? state.taskId : null
  const task = watching && tasks ? tasks.find((x) => x.id === watching) : undefined
  const gone = !!watching && !!tasks && (!task || !!task.completed_at)
  useEffect(() => {
    if (!gone || !watching || !tasks) return
    void completeSession(watching, nextFocusTask(focusIds, tasks, watching), prefs, now, true)
  }, [gone]) // eslint-disable-line react-hooks/exhaustive-deps -- once when the task goes, with the values of that moment
}

/**
 * The engine: the stored state, the focus preferences and the clock. Returns them
 * for the break reminder, which mounts it.
 */
export function useFocusTimer(): { state: FocusState | null | undefined; prefs: FocusPrefs; now: number } {
  const state = useFocusState()
  const prefs = useFocusPrefs()
  const now = useFocusClock(isRunning(state))
  const due = isDue(state, now)
  useEffect(() => {
    if (due) void finishIfDue(prefs, now)
  }, [due, prefs, now])
  // The session's entry stopped on another device (or by `y` on another task): pause with the reason.
  const entryId = state && isRunning(state) ? state.entryId : null
  const entryRuns = useEntryRunning(entryId)
  useEffect(() => {
    if (entryId && entryRuns === false) void noteEntryStopped(entryId)
  }, [entryId, entryRuns])
  useEndEffects(state, prefs)
  useTaskGone(state, prefs, now)
  return { state, prefs, now }
}
