// The focus timer's engine (OpenSpec change focus-mode, design D1, D3, D12):
// mounted once by the shell (through BreakReminder), so a session ends on time on
// every screen. It reads the clock each second while a run is on and again when
// the tab is shown or focused, writes the end through one guarded transition, and
// derives every effect of that end from the row change: the tone, Short or Long
// (in a hidden browser tab at the planned end on the audio clock, else when the
// tab is shown; one tab rings per end, focus-alert-hidden-tab), the system
// notification (hidden tab, permission granted, tagged per run so two tabs show
// one), and the end of the session when its task is completed or trashed elsewhere.
// It also adopts the session another of the person's devices wrote; the sound,
// the notification and the noise are left to the device that made the last
// change (sync-focus-sessions D2, D4).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getTask, useReviewRow, useUserPrefsRow } from '../../lib/localData'
import { orderedFocusIds } from '../../lib/bento'
import { useLiveTasks } from '../../lib/liveTasks'
import { swRegistration } from '../../lib/push'
import { has, shell } from '../../lib/shell'
import { readString, writeString } from '../../lib/deviceStorage'
import { useFocusPrefs, useNoiseVolume, type FocusAlert, type FocusPrefs } from '../../lib/focus/prefs'
import { nextFocusTask } from '../../lib/focus/select'
import { adoptSession, completeSession, finishIfDue, noteEntryStopped, settlePending } from '../../lib/focus/session'
import { useSyncStatus } from '../../lib/sync'
import { useEntryRunning } from '../../lib/focus/live'
import { useFocusState } from '../../lib/focus/state'
import { serverNow } from '../../lib/hlc'
import { inRun, isDue, isRunning, plannedEnd, type FocusState } from '../../lib/focus/timer'
import { LONG_PEAK, playTone, REPEAT_MS, REPEATS, scheduleTone, type ScheduledTone } from '../../lib/focus/tone'
import { t } from '../../lib/i18n'
import { useToday } from '../useViews'
import { resettable } from '../../lib/moduleState'

/** Now, re-read every second while `active`, whenever the tab is shown or focused, and on `read()`. */
function useClock(active: boolean): [number, () => void] {
  const [now, setNow] = useState(() => serverNow())
  const read = useCallback(() => setNow(serverNow()), [])
  useEffect(() => {
    read()
    const id = active ? setInterval(read, 1000) : null
    document.addEventListener('visibilitychange', read)
    window.addEventListener('focus', read)
    return () => {
      if (id) clearInterval(id)
      document.removeEventListener('visibilitychange', read)
      window.removeEventListener('focus', read)
    }
  }, [active, read])
  return [now, read]
}

/** Now, re-read every second while `active` and whenever the tab is shown or focused. */
export function useFocusClock(active: boolean): number {
  return useClock(active)[0]
}

/**
 * The last session end rung on this device (focus-alert-hidden-tab D3): the key
 * of `endKey`, claimed before every ring so two tabs ring once. Kept in memory
 * too, for a page whose storage is refused.
 */
const RUNG_KEY = 'focusAlertRung'
/** A click, tap or key in a visible tab of the app stops a background Long in another (focus-alert-hidden-tab D4). */
const STOP_KEY = 'focusAlertStop'
let rungHere: string | null = null
const rung = (key: string) => rungHere === key || readString(RUNG_KEY) === key
function claimRing(key: string): boolean {
  if (rung(key)) return false
  rungHere = key
  writeString(RUNG_KEY, key)
  return true
}
function releaseRing(key: string): void {
  if (rungHere === key) rungHere = null
  if (readString(RUNG_KEY) === key) writeString(RUNG_KEY, null)
}

/** Tags already notified in this window (two engines of one page show one). */
const notified = new Set<string>()

/** Forgets the notified tags (tests). */
export function resetFocusNotices(): void {
  notified.clear()
  rungHere = null
  writeString(RUNG_KEY, null)
  writeString(STOP_KEY, null)
}
resettable('focusNotices', resetFocusNotices)

/**
 * The end of a run while the tab is hidden: one system notification through the
 * service worker, when allowed. A shell that lists `focus` schedules its own at the
 * planned end (focus-live-activity D3), so none is shown from here.
 */
export async function notifyFocusEnd(s: FocusState): Promise<boolean> {
  if (has('focus')) return false
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

/** Plays the end sound: Short once, Long from its own chunk (focus-end-alert D2). */
function ring(alert: FocusAlert): void {
  if (alert === 'long') void import('../../lib/focus/alert').then((m) => m.startAlert()).catch(() => undefined)
  else void playTone()
}

function useEndEffects(state: FocusState | null | undefined, prefs: FocusPrefs): void {
  const seen = useRef<string | null>(null)
  const pendingTone = useRef<{ alert: FocusAlert; key: string } | null>(null)
  const key = endKey(state)
  useEffect(() => {
    if (state === undefined) return
    // The end the page loaded with is not replayed.
    if (seen.current === null) { seen.current = key; return }
    if (key === seen.current) return
    seen.current = key
    // Only the device that made the last change rings (sync-focus-sessions D4).
    if (!state?.ended || state.remote) return
    if (document.visibilityState === 'hidden') {
      // A tone that played in the background, here or in another tab, is not kept for the return (focus-alert-hidden-tab D3).
      pendingTone.current = prefs.sound && !rung(key) ? { alert: prefs.alert, key } : null
      void notifyFocusEnd(state)
    } else if (prefs.sound && serverNow() - state.ended.at < FRESH_MS && claimRing(key)) ring(prefs.alert)
  }, [key, state, prefs.sound, prefs.alert])
  useEffect(() => {
    const onVisible = () => {
      const pending = pendingTone.current
      if (document.visibilityState !== 'visible' || !pending) return
      pendingTone.current = null
      if (claimRing(pending.key)) ring(pending.alert)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])
}

/** The planned end an end key names. */
const endOf = (key: string) => Number(key.split(':')[1])

interface Waiting { key: string; tone: ScheduledTone }

/**
 * The sound of a hidden tab at the planned end (focus-alert-hidden-tab D1-D4):
 * scheduled on the audio clock while the tab is hidden and this device owns a
 * running timed run, outside the native shells, on the audio the Start woke.
 * A pause, another device's change, a new sound or the tab shown before the end
 * cancels it, and a tab that is closed, discarded or frozen first gives its
 * claim back. The first note wakes the engine, so the end and its notification
 * come with the sound. A background Long stops when the tab is shown, when the
 * sound is turned off, or at a click, tap or key in another tab of the app.
 */
function useHiddenAlert(state: FocusState | null | undefined, prefs: FocusPrefs, wake: () => void): void {
  const [hidden, setHidden] = useState(() => document.visibilityState === 'hidden')
  const waiting = useRef<Waiting | null>(null)
  const ringing = useRef<Waiting | null>(null)
  const alert = prefs.sound && !shell() ? prefs.alert : null
  const long = alert === 'long'
  useEffect(() => {
    const silence = () => { ringing.current?.tone.cancel(); ringing.current = null }
    const onChange = () => {
      const isHidden = document.visibilityState === 'hidden'
      setHidden(isHidden)
      if (!isHidden) silence()
    }
    // React's cleanup never runs in a tab that is closed or discarded: the end must still ring in another tab or on return.
    const onGone = () => {
      const w = waiting.current
      if (!w || w.tone.started()) return
      waiting.current = null
      w.tone.cancel()
      releaseRing(w.key)
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STOP_KEY || !e.newValue) return
      for (const r of [waiting, ringing]) {
        if (r.current?.key === e.newValue && r.current.tone.started()) { r.current.tone.cancel(); r.current = null }
      }
    }
    document.addEventListener('visibilitychange', onChange)
    window.addEventListener('pagehide', onGone)
    document.addEventListener('freeze', onGone)
    window.addEventListener('storage', onStorage)
    return () => {
      document.removeEventListener('visibilitychange', onChange)
      window.removeEventListener('pagehide', onGone)
      document.removeEventListener('freeze', onGone)
      window.removeEventListener('storage', onStorage)
      silence()
    }
  }, [])
  useEffect(() => {
    if (!alert) { ringing.current?.tone.cancel(); ringing.current = null }
  }, [alert])
  // In a visible tab: input during a Long another tab rings stops it there.
  useEffect(() => {
    if (hidden || !long) return
    const onInput = () => {
      const key = readString(RUNG_KEY)
      const at = key ? endOf(key) : NaN
      const now = serverNow()
      if (key && now >= at && now - at <= REPEATS * REPEAT_MS) writeString(STOP_KEY, key)
    }
    window.addEventListener('pointerdown', onInput, true)
    window.addEventListener('keydown', onInput, true)
    return () => {
      window.removeEventListener('pointerdown', onInput, true)
      window.removeEventListener('keydown', onInput, true)
    }
  }, [hidden, long])
  const end = state && !state.remote && isRunning(state) ? plannedEnd(state) : null
  const key = state && end !== null ? `${state.startedAt}:${end}:${state.phase}` : ''
  useEffect(() => {
    if (!hidden || !key || !alert || end === null || !claimRing(key)) return
    // The wake, again at the end when the audio clock ran a little ahead of the server's.
    const onStart = () => {
      wake()
      const left = end - serverNow()
      if (left > 0) setTimeout(wake, left)
    }
    const tone = scheduleTone(end - serverNow(), long ? LONG_PEAK : 0.2, long ? REPEATS : 1, REPEAT_MS, onStart)
    if (!tone) { releaseRing(key); return }
    const mine: Waiting = { key, tone }
    waiting.current = mine
    return () => {
      // Gone already when the page was hidden for good and gave its claim back.
      const live = waiting.current === mine
      if (live) waiting.current = null
      if (!tone.started()) {
        if (live) { tone.cancel(); releaseRing(key) }
      } else if (document.visibilityState === 'hidden') {
        ringing.current?.tone.cancel()
        ringing.current = mine
      } else tone.cancel()
    }
  }, [hidden, key, alert, long, end, wake])
}

/** The session's task completed or trashed on any screen or device: the session ends and the next task of today's focus is offered. */
function useTaskGone(state: FocusState | null | undefined, prefs: FocusPrefs, now: number): void {
  const tasks = useLiveTasks()
  const review = useReviewRow()
  const today = useToday()
  const userPrefs = useUserPrefsRow()
  const focusIds = useMemo(() => orderedFocusIds(review, userPrefs, today, tasks ?? []), [review, userPrefs, today, tasks])
  const watching = state && inRun(state) ? state.taskId : null
  const task = watching && tasks ? tasks.find((x) => x.id === watching) : undefined
  const gone = !!watching && !!tasks && (!task || !!task.completed_at)
  useEffect(() => {
    if (!gone || !watching || !tasks) return
    void completeSession(watching, nextFocusTask(focusIds, tasks, watching), prefs, now, true)
  }, [gone]) // eslint-disable-line react-hooks/exhaustive-deps -- once when the task goes, with the values of that moment
}

/**
 * Background noise (focus-everywhere D6): while a noise is chosen it plays only
 * while a work phase runs, on any screen; every other state fades it out, and so
 * does unmounting the shell (sign-out). The generator is loaded on first use.
 */
function useNoise(state: FocusState | null | undefined, prefs: FocusPrefs): void {
  const volume = useNoiseVolume()
  const kind = prefs.noise !== 'off' && state?.phase === 'work' && isRunning(state) && !state.remote ? prefs.noise : null
  const loaded = useRef(false)
  useEffect(() => {
    if (!kind && !loaded.current) return
    loaded.current = true
    void import('../../lib/focus/noise').then((m) => m.setSessionNoise(kind, volume)).catch(() => undefined)
  }, [kind, volume])
  useEffect(() => () => {
    if (loaded.current) void import('../../lib/focus/noise').then((m) => m.setSessionNoise(null, 0)).catch(() => undefined)
  }, [])
}

/**
 * The engine: the stored state, the focus preferences and the clock. Returns them
 * for the break reminder, which mounts it.
 */
export function useFocusTimer(): { state: FocusState | null | undefined; prefs: FocusPrefs; now: number } {
  const state = useFocusState()
  const prefs = useFocusPrefs()
  const [now, wake] = useClock(isRunning(state))
  // The session another device wrote (sync-focus-sessions D2).
  const run = useUserPrefsRow()?.focus_run
  useEffect(() => {
    if (run) void adoptSession()
  }, [run])
  // An auto-started phase kept offline is published after the next successful sync (D3).
  const synced = useSyncStatus().lastSyncedAt
  useEffect(() => {
    if (synced) void settlePending()
  }, [synced])
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
  useHiddenAlert(state, prefs, wake)
  useEndEffects(state, prefs)
  useTaskGone(state, prefs, now)
  useNoise(state, prefs)
  return { state, prefs, now }
}
