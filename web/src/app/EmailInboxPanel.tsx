import { useEffect, useState } from 'react'
import { api, ApiError } from '../lib/api'
import type { EmailInbox } from '../lib/types'

// Settings → Email to task (OpenSpec change `email-to-task`): the account's
// secret inbox address with copy and rotate, the on/off switch and the sender
// allowlist. The pure EmailInboxView renders every state; EmailInboxPanel loads
// and acts. Controls are native elements in tab order: copy, rotate, switch,
// allowlist, save. Busy states use aria-disabled (the handlers ignore input
// while a request runs) so keyboard focus is not lost after an action.

export interface EmailInboxViewProps {
  inbox: EmailInbox | null
  /** Allowlist editor text, one address per line. */
  draft: string
  copied: boolean
  error: string | null
  busy: boolean
  onCopy: () => void
  onRotate: () => void
  onToggle: (enabled: boolean) => void
  onDraftChange: (text: string) => void
  onSaveAllowlist: () => void
}

/** Splits the allowlist editor text into addresses (lines, commas or spaces). */
export function parseAllowlist(text: string): string[] {
  return text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)
}

export function EmailInboxView(p: EmailInboxViewProps) {
  const inbox = p.inbox
  const dirty = inbox !== null && parseAllowlist(p.draft).join('\n') !== inbox.allowlist.join('\n')
  return (
    <section className="space-y-3" aria-labelledby="email-inbox-heading">
      <h2 id="email-inbox-heading" className="font-semibold">Email to task</h2>
      <p className="text-sm text-slate-500">
        Forward or send any email to your personal address and it becomes a task in your Inbox: the subject is the title
        (without “Re:” or “Fwd:”), the text is the description, and attachment names are listed. New tasks reach your
        devices on their next sync.
      </p>
      {inbox === null ? (
        <p className="text-sm text-slate-400">{p.error ? '' : 'Email to task settings are available when you are online.'}</p>
      ) : !inbox.enabledByOperator ? (
        <p className="text-sm">The server operator has not enabled email to task. See docs/email.md to set it up.</p>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1">
            <span className="text-sm font-medium" id="email-inbox-address-label">Your address</span>
            <div className="flex flex-wrap items-center gap-2">
              <code aria-labelledby="email-inbox-address-label"
                className={'break-all rounded bg-slate-100 px-1 text-sm dark:bg-slate-800' + (inbox.enabled ? '' : ' text-slate-400 line-through')}>
                {inbox.address}
              </code>
              <button className="btn-ghost border border-slate-300 text-xs dark:border-slate-700" onClick={p.onCopy}>
                Copy address
              </button>
              <button className="btn-ghost border border-slate-300 text-xs dark:border-slate-700" aria-disabled={p.busy} onClick={p.onRotate}>
                New address…
              </button>
              {p.copied && <span className="text-xs text-emerald-700 dark:text-emerald-400" role="status">Copied.</span>}
            </div>
            <p className="text-xs text-slate-500">
              Keep it private: anyone who knows it can add tasks (at most {inbox.hourlyLimit} per hour). If it leaks, make a
              new one; the old address stops working at once.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={inbox.enabled} aria-disabled={p.busy} onChange={(e) => p.onToggle(e.target.checked)} />
            Create tasks from email sent to this address
          </label>
          <div className="space-y-1">
            <label className="block text-sm font-medium" htmlFor="email-inbox-allowlist">Only accept mail from (optional)</label>
            <textarea id="email-inbox-allowlist" className="input font-mono text-xs" rows={3} value={p.draft}
              placeholder="you@example.com" onChange={(e) => p.onDraftChange(e.target.value)} />
            <p className="text-xs text-slate-500">
              One address per line. Leave empty to accept any sender. Sender addresses can be forged, so this filters
              mistakes and casual spam; the secret address is the real protection.
            </p>
            <button className="btn-primary text-xs" disabled={p.busy || !dirty} onClick={p.onSaveAllowlist}>Save senders</button>
          </div>
        </div>
      )}
      {p.error && <p className="text-sm text-red-600" role="alert">{p.error}</p>}
    </section>
  )
}

const message = (err: unknown) => (err instanceof ApiError ? err.message : 'Offline: email to task is managed on the server.')

export function EmailInboxPanel() {
  const [inbox, setInbox] = useState<EmailInbox | null>(null)
  const [draft, setDraft] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function show(next: EmailInbox) {
    setInbox(next)
    setDraft(next.allowlist.join('\n'))
  }

  useEffect(() => {
    api.emailInbox().then(show, (err) => setError(message(err)))
  }, [])

  async function run(fn: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <EmailInboxView inbox={inbox} draft={draft} copied={copied} error={error} busy={busy} onDraftChange={setDraft}
      onCopy={() => {
        if (!inbox?.address) return
        navigator.clipboard?.writeText(inbox.address).then(() => setCopied(true),
          () => setError('Could not access the clipboard; select the address and copy it manually.'))
      }}
      onRotate={() => {
        if (!window.confirm('Create a new address? Mail sent to the current address will no longer create tasks.')) return
        setCopied(false)
        void run(async () => show(await api.rotateEmailInbox()))
      }}
      onToggle={(enabled) => void run(async () => show(await api.updateEmailInbox({ enabled })))}
      onSaveAllowlist={() => void run(async () => show(await api.updateEmailInbox({ allowlist: parseAllowlist(draft) })))} />
  )
}
