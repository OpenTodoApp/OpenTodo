// The break reminder (OpenSpec change focus-mode, design D10), mounted once by the
// shell beside the reminder toasts; it also runs the focus timer's engine, so a
// session ends on time on any screen. While the reminder is on and a work session
// has run that long without a break (pauses do not count), a notice on every
// screen offers "Take a break" (the entry stops, the short break runs) and "Not
// now" (back after the same length again).
import { useEffect, useRef } from 'react'
import { Button, Icon, ToastRegion } from '../../ui'
import { breakSession, putOffBreak } from '../../lib/focus/session'
import { continuousWork, isRunning, type FocusState } from '../../lib/focus/timer'
import type { FocusPrefs } from '../../lib/focus/prefs'
import { t } from '../../lib/i18n'
import { act } from '../actionError'
import { keepFocus } from '../ReminderToasts'
import { useFocusTimer } from './useFocusTimer'

/** Whether the reminder is due: on, a work stretch running, and the continuous work past the length (again, after "Not now"). */
export function breakDue(state: FocusState | null | undefined, prefs: FocusPrefs, now: number): boolean {
  if (!state || prefs.breakAfterMinutes <= 0 || state.phase !== 'work' || !isRunning(state)) return false
  const length = prefs.breakAfterMinutes * 60_000
  return continuousWork(state, now) >= state.remindedAtMs + length
}

export function BreakReminder() {
  const { state, prefs, now } = useFocusTimer()
  const due = breakDue(state, prefs, now)
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (due && !keepFocus(document.activeElement as HTMLElement | null)) first.current?.focus()
  }, [due])
  if (!due) return null
  const minutes = Math.floor(continuousWork(state!, now) / 60_000)
  return (
    <ToastRegion live="polite" label={t('Break reminder')}>
      <div role="alertdialog" aria-labelledby="break-reminder-title" data-break-reminder
        className="pointer-events-auto rounded-control border border-default bg-surface p-3 shadow-2"
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); act(putOffBreak()) } }}>
        <div className="flex items-start gap-2">
          <span className="pt-0.5 text-muted"><Icon name="coffee" /></span>
          <div className="min-w-0 flex-1">
            <p id="break-reminder-title" className="text-body font-medium text-default">{t('Time for a break?')}</p>
            <p className="text-meta text-muted">{t('{n, plural, one {You have worked # minute without a break.} other {You have worked # minutes without a break.}}', { n: minutes })}</p>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap justify-end gap-1">
          <Button ref={first} size="sm" variant="primary" onClick={() => act(breakSession(prefs))} data-break-take>{t('Take a break')}</Button>
          <Button size="sm" variant="secondary" onClick={() => act(putOffBreak())} data-break-later>{t('Not now')}</Button>
        </div>
      </div>
    </ToastRegion>
  )
}
