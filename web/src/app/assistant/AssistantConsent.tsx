import { useState } from 'react'
import type { AssistantStatus } from '../../lib/assistantStatus'

export interface ConsentProps {
  status: AssistantStatus
  connected: boolean
  busy: boolean
  error: string | null
  onAccept: (ownKey?: string) => void
}

/**
 * The disclosure before the first message (in-app-assistant "Per-user consent
 * and own keys"): which provider receives task content, which fields may be
 * sent, and, when the owner allows it, an optional key of your own.
 */
export function AssistantConsent({ status, connected, busy, error, onAccept }: ConsentProps) {
  const [ownKey, setOwnKey] = useState('')
  const changed = status.consent && status.consent.provider !== status.provider
  return (
    <section className="space-y-3 text-sm" aria-labelledby="assistant-consent-heading" data-assistant-consent>
      <h3 id="assistant-consent-heading" className="text-base font-semibold">Before you start</h3>
      {changed && <p className="rounded-md bg-amber-50 p-2 text-amber-900 dark:bg-amber-950 dark:text-amber-100">The server owner changed the model provider. Read what is sent now and accept again.</p>}
      <p>
        To answer, the assistant sends what you type and the task data it needs to <strong>{status.provider_label}</strong>
        {status.model ? <> (model <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">{status.model}</code>)</> : null}. Your server owner chose it.
        Nothing is sent before you accept.
      </p>
      <div>
        <p className="font-medium">What may be sent</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
          {status.fields.map((f) => <li key={f}>{f}</li>)}
        </ul>
      </div>
      <p className="text-muted">
        In shared projects this includes text other members wrote. Changes are only proposed: nothing in your tasks changes until you review and apply them, and you can undo them.
        Conversations stay on this device. You can withdraw consent in Settings → Assistant.
      </p>
      {status.allow_member_keys && (
        <label className="block">
          <span className="font-medium">Your own API key (optional)</span>
          <span className="block text-xs text-muted">Used instead of the server’s key. It is stored on the server, never shown again and never sent to your browser.</span>
          <input className="input mt-1" type="password" autoComplete="off" value={ownKey} onChange={(e) => setOwnKey(e.target.value)} disabled={!connected} />
        </label>
      )}
      {error && <p role="alert" className="text-red-700 dark:text-red-300">{error}</p>}
      {!connected && <p className="text-muted">Accepting needs a connection.</p>}
      <button type="button" className="btn-primary" disabled={!connected} aria-busy={busy} onClick={() => { if (!busy) onAccept(ownKey.trim() || undefined) }} data-assistant-accept>
        Accept and continue
      </button>
    </section>
  )
}
