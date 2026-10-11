import { useEffect, useState } from 'react'
import { HelpHeading } from './help/HelpLink'
import { disablePush, enablePush, loadPushState, PushPermissionError, setIncludeContent, testNotification, type PushState } from '../lib/push'

/**
 * Settings → Notifications (OpenSpec change `reminders`): per device, enable or
 * disable web push, include task titles in pushes, send a test notification and
 * see the last delivery status. In-app reminders work regardless.
 */
export function NotificationsSettings() {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null)

  useEffect(() => {
    void loadPushState().then(setState)
  }, [])

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
      <p className="text-sm text-slate-500">
        Reminders always appear inside the app while it is open. Enable notifications on this device to get them while the app is closed.
        Each device decides for itself.
      </p>
      {!s ? (
        <p className="text-sm text-slate-400">Checking…</p>
      ) : !s.available ? (
        <p className="text-sm text-slate-500">Push notifications are turned off on this server. Reminders are shown in the app.</p>
      ) : !s.supported ? (
        <p className="text-sm text-slate-500">This browser does not support push notifications. Installing the app, or opening it over https, may help.</p>
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
          <p className="text-xs text-slate-400">
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
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn-ghost border border-slate-300 dark:border-slate-700"
              disabled={busy || s.permission !== 'granted'}
              onClick={() => void run(() => testNotification(), 'Test notification sent.')}
            >
              Send test notification
            </button>
            {s.subscription && (
              <span className="text-xs text-slate-400">
                {s.subscription.lastOkAt ? `Last delivered ${new Date(s.subscription.lastOkAt).toLocaleString()}` : 'Nothing delivered yet'}
                {s.subscription.failures > 0 ? ` · ${s.subscription.failures} failed (${s.subscription.lastError})` : ''}
              </span>
            )}
          </div>
        </>
      )}
      {message && <p className={`text-sm ${message.kind === 'error' ? 'text-red-600' : 'text-emerald-700 dark:text-emerald-400'}`} role="status">{message.text}</p>}
    </section>
  )
}
