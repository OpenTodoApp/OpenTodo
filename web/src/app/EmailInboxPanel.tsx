import { useEffect, useState } from 'react'
import { Button } from '../ui'
import { Badge } from '../ui'
import { ConfirmDialog } from '../ui'
import { Notice } from '../ui'
import { SettingRow, SettingsSection } from '../ui'
import { Switch } from '../ui'
import { api, ApiError } from '../lib/api'
import type { EmailInbox } from '../lib/types'
import { t } from '../lib/i18n'
import { cardCopy, noticeCopy, rowCopy } from '../lib/settingsCopy'

// Settings → Email to task (OpenSpec change `email-to-task`): the account's
// secret inbox address with copy and rotate, the on/off switch and the sender
// allowlist. The pure EmailInboxView renders every state; EmailInboxPanel loads
// and acts. Controls are in tab order: copy, rotate, switch, allowlist, save. Busy states use aria-disabled (the handlers ignore input
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
    <SettingsSection {...cardCopy('email-inbox')}>
      {inbox === null ? (
        !p.error && <Notice>{noticeCopy('email-inbox', 'offline')}</Notice>
      ) : !inbox.enabledByOperator ? (
        <Notice>{noticeCopy('email-inbox', 'operatorOff')}</Notice>
      ) : (
        <>
          <SettingRow {...rowCopy('email-inbox', 'address')} status={
            <span className="flex flex-wrap items-center gap-2">
              <Badge hue={inbox.enabled ? 'green' : 'slate'}>{inbox.enabled ? t('On') : t('Off')}</Badge>
              <code id="email-inbox-address" className={'break-all rounded-chip bg-sunken px-1.5 py-0.5 text-meta' + (inbox.enabled ? '' : ' text-faint line-through')}>
                {inbox.address}
              </code>
            </span>
          }
            control={
              <>
                <Button icon="copy" onClick={p.onCopy}>{t('Copy address')}</Button>
                <Button icon="rotate-ccw" aria-disabled={p.busy} onClick={p.onRotate}>{t('New address')}</Button>
              </>
            } />
          {p.copied && <Notice tone="success">{noticeCopy('email-inbox', 'copied')}</Notice>}
          <SettingRow {...rowCopy('email-inbox', 'create')}
            control={<Switch checked={inbox.enabled} onChange={(on) => { if (!p.busy) p.onToggle(on) }} label={t('Create tasks from email sent to this address')} hideLabel />} />
          <div className="space-y-2 py-3">
            <label className="block text-body font-medium text-default" htmlFor="email-inbox-allowlist">{t('Only accept mail from (optional)')}</label>
            <textarea id="email-inbox-allowlist" className="ui-input font-mono text-meta" rows={3} value={p.draft}
              placeholder={t('you@example.com')} onChange={(e) => p.onDraftChange(e.target.value)} />
            <p className="text-meta text-muted">
              {t('One address per line. Leave empty to accept any sender. Sender addresses can be forged, so this filters mistakes and casual spam; the secret address is the real protection.')}
            </p>
            <div className="flex justify-end"><Button variant="primary" disabled={p.busy || !dirty} onClick={p.onSaveAllowlist}>{t('Save senders')}</Button></div>
          </div>
        </>
      )}
      {p.error && <Notice tone="danger">{p.error}</Notice>}
    </SettingsSection>
  )
}

const message = (err: unknown) => (err instanceof ApiError ? err.message : t('Offline: email to task is managed on the server.'))

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

  const [confirmRotate, setConfirmRotate] = useState(false)
  return (
    <>
      <EmailInboxView inbox={inbox} draft={draft} copied={copied} error={error} busy={busy} onDraftChange={setDraft}
        onCopy={() => {
          if (!inbox?.address) return
          navigator.clipboard?.writeText(inbox.address).then(() => setCopied(true),
            () => setError(t('Could not access the clipboard; select the address and copy it manually.')))
        }}
        onRotate={() => { if (!busy) setConfirmRotate(true) }}
        onToggle={(enabled) => void run(async () => show(await api.updateEmailInbox({ enabled })))}
        onSaveAllowlist={() => void run(async () => show(await api.updateEmailInbox({ allowlist: parseAllowlist(draft) })))} />
      {confirmRotate && (
        <ConfirmDialog title={t('Create a new address?')} confirmLabel={t('Create new address')}
          consequence={t('Mail sent to your current address will no longer create tasks. Update anything that forwards to it.')}
          onConfirm={() => { setCopied(false); return run(async () => show(await api.rotateEmailInbox())) }}
          onCancel={() => setConfirmRotate(false)} />
      )}
    </>
  )
}
