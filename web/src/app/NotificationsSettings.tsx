import { useEffect, useState } from 'react'
import { HelpHeading } from './help/HelpLink'
import { getDeviceId } from '../lib/ops'
import {
  disablePush, enablePush, loadPushState, localTestNotification, PushPermissionError, pushChecklist, sendTestPush, setIncludeContent,
  type ChecklistStep, type PushState, type StepAction, type TestOutcome,
} from '../lib/push'

/**
 * Settings → Notifications (OpenSpec change `reminders`): per device, enable or
 * disable web push, include task titles in pushes, and check delivery with a
 * real test push (OpenSpec change `push-test-delivery`). In-app reminders work regardless.
 */
export function NotificationsSettings() {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null)

  const [lastTest, setLastTest] = useState<TestOutcome | null>(null)
  const [phase, setPhase] = useState<TestPhase>('idle')
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false)

  useEffect(() => {
    void loadPushState().then(setState)
    const update = () => setOnline(navigator.onLine !== false)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  const sendTest = async () => {
    setPhase('sending')
    setMessage(null)
    const outcome = await sendTestPush(await getDeviceId(), {
      onSent: () => setPhase('waiting'),
      onLateReceipt: (received) => setLastTest(received),
    })
    setLastTest(outcome)
    setPhase('idle')
    setState(await loadPushState())
  }

  const run = async (fn: () => Promise<PushState | void>, ok?: string) => {
    setBusy(true)
    setMessage(null)
    try {
      const next = await fn()
      setState(next ?? (await loadPushState()))
      if (ok) setMessage({ kind: 'info', text: ok })
    } catch (err) {
      const text = err instanceof PushPermissionError
        ? 'Notifications are blocked for this site in your browser settings, so this device cannot receive pushes. Reminders still appear inside the app while it is open.'
        : err instanceof Error ? err.message : String(err)
      setMessage({ kind: 'error', text })
      setState(await loadPushState())
    } finally {
      setBusy(false)
    }
  }

  const s = state
  return (
    <section className="space-y-2" aria-labelledby="notifications-heading">
      <HelpHeading screen="settings/notifications" id="notifications-heading" className="font-semibold">Notifications</HelpHeading>
      <p className="text-sm text-muted">
        Reminders always appear inside the app while it is open. Enable notifications on this device to get them while the app is closed.
        Each device decides for itself.
      </p>
      {!s ? (
        <p className="text-sm text-faint">Checking…</p>
      ) : !s.available ? (
        <p className="text-sm text-muted">Push notifications are turned off on this server. Reminders are shown in the app.</p>
      ) : !s.supported ? (
        <p className="text-sm text-muted">This browser does not support push notifications. Installing the app, or opening it over https, may help.</p>
      ) : (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={s.enabled}
              disabled={busy}
              aria-label="Enable notifications on this device"
              onChange={(e) => void run(e.target.checked ? () => enablePush(s.includeContent) : () => disablePush(), e.target.checked ? 'Notifications enabled on this device.' : undefined)}
            />
            Enable notifications on this device
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={s.includeContent}
              disabled={busy}
              aria-label="Include task titles"
              onChange={(e) => void run(() => setIncludeContent(e.target.checked))}
            />
            Include task titles
          </label>
          <p className="text-xs text-faint">
            Without titles a push carries only ids, encrypted; this device shows the title from its own copy of the task.
            With titles the notification is complete even before this device has synced the task. Descriptions are never sent.
          </p>
          {s.permission === 'denied' && (
            <p className="text-sm text-amber-700 dark:text-amber-400">Notifications are blocked for this site in your browser settings. Reminders still appear inside the app.</p>
          )}
          {s.needsRenewal && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm dark:border-amber-800 dark:bg-amber-950/40">
              <span className="flex-1">The push service stopped accepting notifications for this device.</span>
              <button className="btn-primary text-xs" disabled={busy} onClick={() => void run(() => enablePush(s.includeContent), 'Notifications re-enabled.')}>Re-enable</button>
            </div>
          )}
          <PushDelivery
            state={s}
            lastTest={lastTest}
            online={online}
            dev={import.meta.env.DEV}
            busy={busy}
            phase={phase}
            onTest={() => void sendTest()}
            onLocalTest={() => void run(() => localTestNotification(), 'Local notification shown. It came from this page, not from the server, so it does not prove that reminders reach this device.')}
            onAction={(action) => action === 'reload'
              ? location.reload()
              : void run(() => enablePush(s.includeContent), action === 'reenable' ? 'Notifications re-enabled.' : 'Notifications enabled on this device.')}
          />
        </>
      )}
      {message && <p className={`text-sm ${message.kind === 'error' ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`} role="status">{message.text}</p>}
    </section>
  )
}

export type TestPhase = 'idle' | 'sending' | 'waiting'

const STATUS_MARK: Record<ChecklistStep['status'], { mark: string; label: string; className: string }> = {
  ok: { mark: '✓', label: 'OK', className: 'text-emerald-700 dark:text-emerald-400' },
  fail: { mark: '✕', label: 'Problem', className: 'text-red-600 dark:text-red-400' },
  pending: { mark: '…', label: 'Pending', className: 'text-amber-700 dark:text-amber-400' },
  not_checked: { mark: '–', label: 'Not checked', className: 'text-faint' },
  unknown: { mark: '?', label: 'Unknown', className: 'text-faint' },
}
const ACTION_LABEL: Record<StepAction, string> = { enable: 'Enable', reenable: 'Re-enable', reload: 'Reload' }

/** One line saying what the last test proved, never more than the device can back up. */
export function testSummary(t: TestOutcome | null, phase: TestPhase): string | null {
  if (phase === 'sending') return 'Sending a test push through the server…'
  if (phase === 'waiting') return 'The push service accepted the test. Waiting for this device to receive it…'
  if (!t) return null
  switch (t.kind) {
    case 'received': return 'Received on this device. Reminders will reach it while the app is closed.'
    case 'accepted_not_seen': return 'The push service accepted the test, but this device has not reported receiving it. See the checklist for likely causes.'
    case 'no_subscription': return 'This device is not subscribed on the server, so no test was sent. Enable notifications first.'
    case 'gone': return 'The push service said this subscription expired, and the server removed it. Enable notifications again.'
    case 'failed': return `The push service rejected the test${t.status ? ` (status ${t.status})` : ''}: ${t.error}`
    case 'rate_limited': return 'Too many tests in a short time. Try again in a few minutes.'
    case 'offline': return "You're offline. The test needs the server."
    case 'server_too_old': return 'This server does not support push tests yet. You can still show a local notification.'
  }
}

/** The delivery checklist and the test actions (push-test-delivery D5–D8). */
export function PushDelivery(props: {
  state: PushState
  lastTest: TestOutcome | null
  online: boolean
  dev: boolean
  busy: boolean
  phase: TestPhase
  onTest: () => void
  onLocalTest: () => void
  onAction: (action: StepAction) => void
}) {
  const { state: s, lastTest, online, dev, busy, phase } = props
  const steps = pushChecklist(s, lastTest, online, { dev })
  const summary = testSummary(lastTest, phase)
  const canTest = online && !s.serverUnreachable && s.permission === 'granted' && s.serviceWorker && !!s.subscription
  const whyNot = !online || s.serverUnreachable ? "You're offline; the test needs the server."
    : s.permission !== 'granted' ? 'Allow notifications first.'
    : !s.serviceWorker ? 'Push needs the offline service worker (see above).'
    : !s.subscription ? 'Enable notifications on this device first.' : null
  return (
    <div className="space-y-2" data-testid="push-delivery">
      <h3 className="text-sm font-semibold">Delivery check</h3>
      <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 text-sm dark:divide-slate-800 dark:border-slate-800">
        {steps.map((step) => {
          const m = STATUS_MARK[step.status]
          return (
            <li key={step.id} className="flex items-start gap-2 p-2" data-step={step.id} data-status={step.status}>
              <span className={`w-4 shrink-0 text-center font-semibold ${m.className}`} aria-hidden="true">{m.mark}</span>
              <div className="min-w-0 flex-1">
                <div className="font-medium"><span className="sr-only">{m.label}: </span>{step.label}</div>
                <div className="text-xs text-muted user-text">{step.detail}</div>
              </div>
              {step.action && (
                <button type="button" className="btn-ghost border border-slate-300 px-2 py-0.5 text-xs dark:border-slate-700" disabled={busy || phase !== 'idle'} onClick={() => props.onAction(step.action!)}>
                  {ACTION_LABEL[step.action]}
                </button>
              )}
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost border border-slate-300 dark:border-slate-700" disabled={!canTest || busy || phase !== 'idle'} onClick={props.onTest}>
          {phase === 'idle' ? 'Send test notification' : 'Testing…'}
        </button>
        {(!s.subscription || lastTest?.kind === 'server_too_old') && s.permission === 'granted' && (
          <button type="button" className="btn-ghost text-xs" disabled={busy} onClick={props.onLocalTest}>Show a local notification</button>
        )}
        {!canTest && whyNot && <span className="text-xs text-faint">{whyNot}</span>}
      </div>
      {summary && <p className="text-sm" role="status" data-testid="push-test-summary">{summary}</p>}
    </div>
  )
}
