import { Icon, type IconName } from '../ui/Icon'
import { type ReactNode, useEffect, useState } from 'react'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Card'
import { Notice } from '../ui/patterns/Notice'
import { SettingRow, SettingsSection } from '../ui/patterns/SettingsSection'
import { Switch } from '../ui/Switch'
import type { HueName } from '../ui/tokens/palette'
import { relativeTime } from './SecurityPanel'
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
    <NotificationsView state={s} busy={busy} message={message}
      onEnable={(on) => void run(on && s ? () => enablePush(s.includeContent) : () => disablePush(), on ? 'Notifications enabled on this device.' : undefined)}
      onIncludeContent={(on) => void run(() => setIncludeContent(on))}
      onRenew={() => s && void run(() => enablePush(s.includeContent), 'Notifications re-enabled.')}
      delivery={s && (
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
      )} />
  )
}

const PERMISSION: Record<PushState['permission'], { label: string; hue: HueName }> = {
  granted: { label: 'Allowed', hue: 'green' },
  denied: { label: 'Blocked', hue: 'red' },
  default: { label: 'Not asked yet', hue: 'slate' },
  unsupported: { label: 'Not supported', hue: 'slate' },
}

/** Presentational part of Settings → Notifications, rendered without effects for tests and stories. */
export function NotificationsView({ state: s, busy, message, onEnable, onIncludeContent, onRenew, delivery, now }: {
  state: PushState | null
  busy: boolean
  message: { kind: 'error' | 'info'; text: string } | null
  onEnable: (on: boolean) => void
  onIncludeContent: (on: boolean) => void
  onRenew: () => void
  delivery?: ReactNode
  now?: number
}) {
  const sub = s?.subscription ?? null
  return (
    <SettingsSection title="Notifications" helpId="settings/notifications" headingId="notifications-heading"
      description="Reminders always appear inside the app while it is open. Turn on notifications to get them while the app is closed. Each device decides for itself.">
      {!s ? (
        <p className="py-2 text-meta text-faint">Checking…</p>
      ) : !s.available ? (
        <Notice>Push notifications are turned off on this server. Reminders are shown in the app.</Notice>
      ) : !s.supported ? (
        <Notice>This browser does not support push notifications. Installing the app, or opening it over https, may help.</Notice>
      ) : (
        <>
          <SettingRow label="This device" status={
            <span className="flex flex-wrap items-center gap-2" data-testid="push-summary">
              <Badge hue={s.enabled ? 'green' : 'slate'}>{s.enabled ? 'On' : 'Off'}</Badge>
              <Badge hue={PERMISSION[s.permission].hue} tone="solid">Permission: {PERMISSION[s.permission].label}</Badge>
              {sub && (
                <span className="text-muted">
                  {sub.lastOkAt ? `Last delivered ${relativeTime(sub.lastOkAt, now)}` : 'Nothing delivered yet'}
                  {sub.failures > 0 ? ` · ${sub.failures} failed (${sub.lastError})` : ''}
                </span>
              )}
            </span>
          } control={<Switch checked={s.enabled} disabled={busy} onChange={onEnable} label="Enable notifications on this device" hideLabel />} />
          {s.permission === 'denied' && <Notice tone="warning">Notifications are blocked for this site in your browser settings. Reminders still appear inside the app.</Notice>}
          {s.needsRenewal && (
            <Notice tone="warning" action={<Button size="sm" variant="primary" disabled={busy} onClick={onRenew}>Re-enable</Button>}>
              The push service stopped accepting notifications for this device.
            </Notice>
          )}
          <SettingRow label="Include task titles" description="Without titles a push carries only ids, encrypted; this device shows the title from its own copy of the task. With titles the notification is complete even before this device has synced. Descriptions are never sent."
            control={<Switch checked={s.includeContent} disabled={busy} onChange={onIncludeContent} label="Include task titles" hideLabel />} />
          {delivery && <div className="py-3">{delivery}</div>}
        </>
      )}
      {message && <Notice tone={message.kind === 'error' ? 'danger' : 'success'}>{message.text}</Notice>}
    </SettingsSection>
  )
}

export type TestPhase = 'idle' | 'sending' | 'waiting'

const STATUS_MARK: Record<ChecklistStep['status'], { icon: IconName; label: string; className: string }> = {
  ok: { icon: 'check', label: 'OK', className: 'text-success' },
  fail: { icon: 'x', label: 'Problem', className: 'text-danger' },
  pending: { icon: 'clock', label: 'Pending', className: 'text-warning' },
  not_checked: { icon: 'circle', label: 'Not checked', className: 'text-faint' },
  unknown: { icon: 'circle-help', label: 'Unknown', className: 'text-faint' },
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
      <h3 className="text-sm font-medium text-default">Delivery check</h3>
      <ul className="divide-y divide-(--ot-border) overflow-hidden rounded-control border border-default">
        {steps.map((step) => {
          const m = STATUS_MARK[step.status]
          return (
            <li key={step.id} className="flex items-start gap-3 px-3 py-2.5" data-step={step.id} data-status={step.status}>
              <span className={`mt-0.5 flex w-4 shrink-0 justify-center ${m.className}`}><Icon name={m.icon} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-default"><span className="sr-only">{m.label}: </span>{step.label}</div>
                <div className="user-text text-meta text-muted">{step.detail}</div>
              </div>
              {step.action && (
                <Button size="sm" disabled={busy || phase !== 'idle'} onClick={() => props.onAction(step.action!)}>{ACTION_LABEL[step.action]}</Button>
              )}
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" disabled={!canTest || busy || phase !== 'idle'} onClick={props.onTest}>
          {phase === 'idle' ? 'Send test notification' : 'Testing…'}
        </Button>
        {(!s.subscription || lastTest?.kind === 'server_too_old') && s.permission === 'granted' && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={props.onLocalTest}>Show a local notification</Button>
        )}
        {!canTest && whyNot && <span className="text-meta text-faint">{whyNot}</span>}
      </div>
      {summary && <p className="text-body text-default" role="status" data-testid="push-test-summary">{summary}</p>}
    </div>
  )
}
