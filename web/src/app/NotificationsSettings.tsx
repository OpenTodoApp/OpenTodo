import { Icon, type IconName } from '../ui'
import { type ReactNode, useEffect, useState } from 'react'
import { Button } from '../ui'
import { Badge } from '../ui'
import { Notice } from '../ui'
import { SettingRow, SettingsSection } from '../ui'
import { Switch } from '../ui'
import type { HueName } from '../ui'
import { relativeTime } from './SecurityPanel'
import { getDeviceId } from '../lib/ops'
import {
  disablePush, enablePush, loadPushState, localTestNotification, PushPermissionError, pushChecklist, sendTestPush, setIncludeContent,
  type ChecklistStep, type PushState, type StepAction, type TestOutcome,
} from '../lib/push'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { t, msg, translatedMap } from '../lib/i18n'
import { cardCopy, noticeCopy, rowCopy } from '../lib/settingsCopy'

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
        ? t('Notifications are blocked for this site in your browser settings, so this device cannot receive pushes. Reminders still appear inside the app while it is open.')
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
      onEnable={(on) => void run(on && s ? () => enablePush(s.includeContent) : () => disablePush(), on ? t('Notifications enabled on this device.') : undefined)}
      onIncludeContent={(on) => void run(() => setIncludeContent(on))}
      onRenew={() => s && void run(() => enablePush(s.includeContent), t('Notifications re-enabled.'))}
      delivery={s && (
        <PushDelivery
          state={s}
          lastTest={lastTest}
          online={online}
          dev={import.meta.env.DEV}
          busy={busy}
          phase={phase}
          onTest={() => void sendTest()}
          onLocalTest={() => void run(() => localTestNotification(), t('Local notification shown. It came from this page, not from the server, so it does not prove that reminders reach this device.'))}
          onAction={(action) => action === 'reload'
            ? location.reload()
            : void run(() => enablePush(s.includeContent), action === 'reenable' ? t('Notifications re-enabled.') : t('Notifications enabled on this device.'))}
        />
      )} />
  )
}

const PERMISSION: Record<PushState['permission'], { label: string; hue: HueName }> = {
  granted: { get label() { return t('Allowed') }, hue: 'green' },
  denied: { get label() { return t('Blocked') }, hue: 'red' },
  default: { get label() { return t('Not asked yet') }, hue: 'slate' },
  unsupported: { get label() { return t('Not supported') }, hue: 'slate' },
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
    <SettingsSection {...cardCopy('notifications')}>
      {!s ? (
        <p className="py-2 text-meta text-faint">{t('Checking…')}</p>
      ) : !s.available ? (
        <Notice>{noticeCopy('notifications', 'serverOff')}</Notice>
      ) : !s.supported ? (
        <Notice>{noticeCopy('notifications', 'unsupported')}</Notice>
      ) : (
        <>
          <SettingRow {...rowCopy('notifications', 'device')} status={
            <span className="flex flex-wrap items-center gap-2" data-testid="push-summary">
              <Badge hue={s.enabled ? 'green' : 'slate'}>{s.enabled ? t('On') : t('Off')}</Badge>
              <Badge hue={PERMISSION[s.permission].hue} tone="solid">{t('Permission: {label}', { label: PERMISSION[s.permission].label })}</Badge>
              {sub && (
                <span className="text-muted">
                  {sub.lastOkAt ? t('Last delivered {ago}', { ago: relativeTime(sub.lastOkAt, now) }) : t('Nothing delivered yet')}
                  {sub.failures > 0 ? ` · ${t('{n} failed ({error})', { n: sub.failures, error: sub.lastError })}` : ''}
                </span>
              )}
            </span>
          } control={<Switch checked={s.enabled} disabled={busy} onChange={onEnable} label={t('Enable notifications on this device')} hideLabel />} />
          {s.permission === 'denied' && <Notice tone="warning">{noticeCopy('notifications', 'blocked')}</Notice>}
          {s.needsRenewal && (
            <Notice tone="warning" action={<Button size="sm" variant="primary" disabled={busy} onClick={onRenew}>{t('Re-enable')}</Button>}>
              {noticeCopy('notifications', 'renew')}
            </Notice>
          )}
          <SettingRow {...rowCopy('notifications', 'titles')}
            control={<Switch checked={s.includeContent} disabled={busy} onChange={onIncludeContent} label={t('Include task titles')} hideLabel />} />
          {delivery && <div className="py-3">{delivery}</div>}
        </>
      )}
      {message && <Notice tone={message.kind === 'error' ? 'danger' : 'success'}>{message.text}</Notice>}
    </SettingsSection>
  )
}

export type TestPhase = 'idle' | 'sending' | 'waiting'

const STATUS_MARK: Record<ChecklistStep['status'], { icon: IconName; label: string; className: string }> = {
  ok: { icon: 'check', get label() { return t('OK') }, className: 'text-success' },
  fail: { icon: 'x', get label() { return t('Problem') }, className: 'text-danger' },
  pending: { icon: 'clock', get label() { return t('Pending') }, className: 'text-warning' },
  not_checked: { icon: 'circle', get label() { return t('Not checked') }, className: 'text-faint' },
  unknown: { icon: 'circle-help', get label() { return t('Unknown') }, className: 'text-faint' },
}
const ACTION_LABEL = translatedMap<StepAction>({ enable: msg('Enable'), reenable: msg('Re-enable'), reload: msg('Reload') })

/** One line saying what the last test proved, never more than the device can back up. */
export function testSummary(item: TestOutcome | null, phase: TestPhase): string | null {
  if (phase === 'sending') return t('Sending a test push through the server…')
  if (phase === 'waiting') return t('The push service accepted the test. Waiting for this device to receive it…')
  if (!item) return null
  switch (item.kind) {
    case 'received': return t('Received on this device. Reminders will reach it while the app is closed.')
    case 'accepted_not_seen': return t('The push service accepted the test, but this device has not reported receiving it. See the checklist for likely causes.')
    case 'no_subscription': return t('This device is not subscribed on the server, so no test was sent. Enable notifications first.')
    case 'gone': return t('The push service said this subscription expired, and the server removed it. Enable notifications again.')
    case 'failed': return item.status ? t('The push service rejected the test (status {status}): {error}', { status: item.status, error: item.error }) : t('The push service rejected the test: {error}', { error: item.error })
    case 'rate_limited': return t('Too many tests in a short time. Try again in a few minutes.')
    case 'offline': return t("You're offline. The test needs the server.")
    case 'server_too_old': return t('This server does not support push tests yet. You can still show a local notification.')
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
  useDateTimeFormat()
  const { state: s, lastTest, online, dev, busy, phase } = props
  const steps = pushChecklist(s, lastTest, online, { dev })
  const summary = testSummary(lastTest, phase)
  const canTest = online && !s.serverUnreachable && s.permission === 'granted' && s.serviceWorker && !!s.subscription
  const whyNot = !online || s.serverUnreachable ? t("You're offline; the test needs the server.")
    : s.permission !== 'granted' ? t('Allow notifications first.')
    : !s.serviceWorker ? t('Push needs the offline service worker (see above).')
    : !s.subscription ? t('Enable notifications on this device first.') : null
  return (
    <div className="space-y-2" data-testid="push-delivery">
      <h3 className="text-body font-medium text-default">{t('Delivery check')}</h3>
      <ul className="divide-y divide-(--ot-border) overflow-hidden rounded-control border border-default">
        {steps.map((step) => {
          const m = STATUS_MARK[step.status]
          return (
            <li key={step.id} className="flex items-start gap-3 px-3 py-2.5" data-step={step.id} data-status={step.status}>
              <span className={`mt-0.5 flex w-4 shrink-0 justify-center ${m.className}`}><Icon name={m.icon} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-body font-medium text-default"><span className="sr-only">{m.label}: </span>{step.label}</div>
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
          {phase === 'idle' ? t('Send test notification') : t('Testing…')}
        </Button>
        {(!s.subscription || lastTest?.kind === 'server_too_old') && s.permission === 'granted' && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={props.onLocalTest}>{t('Show a local notification')}</Button>
        )}
        {!canTest && whyNot && <span className="text-meta text-faint">{whyNot}</span>}
      </div>
      {summary && <p className="text-body text-default" role="status" data-testid="push-test-summary">{summary}</p>}
    </div>
  )
}
