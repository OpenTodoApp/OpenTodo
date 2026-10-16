import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { Badge, Button, Field, Input, Notice, Select, SettingRow, SettingsSection } from '../ui'
import { api, ApiError, isNetworkError } from '../lib/api'
import { formatInstant } from '../lib/dates'
import { useOnline } from '../lib/online'
import { setOutgoingEmail } from '../lib/outgoingEmail'
import type { SmtpSecurity, SmtpSettings, SmtpSettingsInput, SmtpStage, SmtpTestResult } from '../lib/types'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { t, msg, translatedMap } from '../lib/i18n'

// Settings → Server → Outgoing email (OpenSpec change outgoing-email, design D9):
// the owner's SMTP settings. The card leads with its state; the form opens
// inline; fields set by OPENTODO_SMTP_* are read-only and say so. The password
// is write-only. Offline, nothing is guessed. The page header carries Help
// (settings-navigation "Help links name the same screens"); the legacy screen id
// `settings/outgoing-email` resolves to the Server guide.

export const SMTP_VARIABLE: Record<string, string> = {
  host: 'OPENTODO_SMTP_HOST', port: 'OPENTODO_SMTP_HOST', security: 'OPENTODO_SMTP_SECURITY',
  username: 'OPENTODO_SMTP_USER', password: 'OPENTODO_SMTP_PASSWORD', from: 'OPENTODO_SMTP_FROM',
}

const STAGE_TEXT = translatedMap<SmtpStage>({
  connect: msg('Could not connect to the mail server'),
  tls: msg('The secure connection failed'),
  auth: msg('Authentication failed'),
  send: msg('The mail server refused the message'),
})

export interface SmtpDraft {
  host: string
  port: string
  security: SmtpSecurity
  username: string
  /** Empty keeps the stored password. */
  password: string
  clearPassword: boolean
  from: string
}

export const draftFrom = (s: SmtpSettings): SmtpDraft => ({
  host: s.host, port: s.port ? String(s.port) : '', security: s.security, username: s.username, password: '', clearPassword: false, from: s.from,
})

/** Only the fields the owner may change and did change. */
export function inputFrom(s: SmtpSettings, d: SmtpDraft): SmtpSettingsInput {
  const free = (f: string) => s.managedBy[f] !== 'env'
  const out: SmtpSettingsInput = {}
  if (free('host') && d.host.trim() !== s.host) out.host = d.host.trim()
  if (free('port') && d.port !== (s.port ? String(s.port) : '')) out.port = Number(d.port) || 0
  if (free('security') && d.security !== s.security) out.security = d.security
  if (free('username') && d.username.trim() !== s.username) out.username = d.username.trim()
  if (free('password')) {
    if (d.password) out.password = d.password
    else if (d.clearPassword) out.password = ''
  }
  if (free('from') && d.from.trim() !== s.from) out.from = d.from.trim()
  return out
}

export interface OutgoingEmailViewProps {
  /** null while loading or offline. */
  settings: SmtpSettings | null
  offline: boolean
  busy: boolean
  error: string | null
  draft: SmtpDraft | null
  /** The outcome of a test run in this session (also kept as `settings.lastTest`). */
  test: SmtpTestResult | null
  onConfigure: () => void
  onDraft: (d: SmtpDraft | null) => void
  onSave: () => void
  onTest: () => void
}

function TestLine({ outcome, stage, reply, to, at }: { outcome: 'sent' | 'failed'; stage?: SmtpStage; reply?: string; to?: string; at?: number }) {
  if (outcome === 'sent') {
    return <span data-smtp-test="sent"><Badge hue="green">{t('Test sent')}</Badge> <span className="text-muted">{to ? t('to {to}', { to }) : ''}{at ? ` · ${formatInstant(at, 'datetime')}` : ''}</span></span>
  }
  return (
    <span data-smtp-test="failed" className="block">
      <Badge hue="red">{t('Test failed')}</Badge> <span className="text-default">{stage ? STAGE_TEXT[stage] : t('The test failed')}</span>
      {at ? <span className="text-muted"> · {formatInstant(at, 'datetime')}</span> : null}
      {reply && <code className="mt-1 block break-all rounded-chip bg-sunken px-1.5 py-0.5 font-mono text-meta text-default">{reply}</code>}
    </span>
  )
}

export function OutgoingEmailView(p: OutgoingEmailViewProps) {
  useDateTimeFormat()
  const s = p.settings
  const d = p.draft
  const locked = (f: string) => s?.managedBy[f] === 'env'
  const lockNote = (f: string) => (locked(f) ? t('Set by {variable}', { variable: SMTP_VARIABLE[f] }) : undefined)
  const disabled = p.offline || p.busy
  const last = p.test ?? (s?.lastTest ? { ...s.lastTest, to: undefined } : null)
  function submit(e: FormEvent) {
    e.preventDefault()
    p.onSave()
  }
  return (
    <SettingsSection title={t('Outgoing email')} headingId="outgoing-email-heading" testId="outgoing-email-panel"
      description={t('Lets this server mail password resets, sign-up confirmations and invitations. Nothing is sent until it is configured.')}>
      {p.offline ? (
        <Notice>{t('Outgoing email settings need a connection to the server.')}</Notice>
      ) : !s ? null : (
        <>
          <SettingRow label={t('Mail server')}
            description={s.configured ? undefined : t('Not configured. With an SMTP server, people can reset a forgotten password themselves, confirm their address when signing up, and receive invitations by email.')}
            status={(
              <span className="block space-y-1">
                <Badge hue={s.configured ? 'green' : 'slate'}>{s.configured ? t('Configured') : t('Not configured')}</Badge>
                {s.configured && <span className="block text-muted" data-smtp-summary>{t('{host}:{port} · from {from}', { host: s.host, port: s.port, from: s.from })}</span>}
                {s.configured && last && (
                  <span className="block">
                    {'stage' in last && last.outcome === 'failed'
                      ? <TestLine outcome="failed" stage={last.stage} reply={last.reply} at={'at' in last ? last.at : undefined} />
                      : <TestLine outcome="sent" to={last.to} at={'at' in last ? last.at : undefined} />}
                  </span>
                )}
              </span>
            )}
            control={<>
              {s.configured && <Button size="sm" disabled={disabled || !!d} busy={p.busy && !d} onClick={p.onTest}>{t('Send test email')}</Button>}
              {!d && <Button size="sm" variant={s.configured ? 'ghost' : 'primary'} disabled={disabled} onClick={p.onConfigure}>{t('Configure')}</Button>}
            </>} />
          {s.security === 'none' && s.configured && (
            <Notice tone="warning">{t('Messages travel unencrypted to the mail server. Use this only for a relay on your own network.')}</Notice>
          )}
          {p.error && !d && <Notice tone="danger">{p.error}</Notice>}
          {d && (
            <form className="space-y-3 py-3" onSubmit={submit} data-smtp-form>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
                <Field label={t('SMTP server')} description={lockNote('host')}>
                  <Input aria-label={t('SMTP server')} placeholder={t('smtp.example.com')} value={d.host} readOnly={locked('host')} required
                    onChange={(e) => p.onDraft({ ...d, host: e.target.value })} data-autofocus />
                </Field>
                <Field label={t('Port')} description={lockNote('port')}>
                  <Input aria-label={t('Port')} inputMode="numeric" placeholder="587" value={d.port} readOnly={locked('port')}
                    onChange={(e) => p.onDraft({ ...d, port: e.target.value.replace(/\D/g, '') })} />
                </Field>
              </div>
              <Field label={t('Security')} description={lockNote('security') ?? t('TLS on port 465, STARTTLS on others. Plain is only for a relay without a password.')}>
                <Select aria-label={t('Security')} value={d.security} disabled={locked('security')} onChange={(e) => p.onDraft({ ...d, security: e.target.value as SmtpSecurity })}>
                  <option value="">{t('Automatic')}</option>
                  <option value="tls">{t('TLS')}</option>
                  <option value="starttls">{t('STARTTLS')}</option>
                  <option value="none">{t('None (plain)')}</option>
                </Select>
              </Field>
              {d.security === 'none' && <Notice tone="warning">{t('Without encryption, a user name and password cannot be used, and messages travel in the clear.')}</Notice>}
              <Field label={t('User name')} description={lockNote('username') ?? t('Often your full email address. Leave empty for a relay without sign-in.')}>
                <Input aria-label={t('User name')} autoComplete="off" value={d.username} readOnly={locked('username')} onChange={(e) => p.onDraft({ ...d, username: e.target.value })} />
              </Field>
              <Field label={t('Password')} description={lockNote('password') ?? (s.passwordSet ? t('Leave empty to keep the saved password.') : t('For Gmail and similar services, an app password.'))}>
                <Input aria-label={t('Password')} type="password" autoComplete="new-password" value={d.password} readOnly={locked('password')}
                  placeholder={s.passwordSet ? '••••••••' : ''} onChange={(e) => p.onDraft({ ...d, password: e.target.value, clearPassword: false })} />
              </Field>
              {s.passwordSet && !locked('password') && (
                <label className="flex items-center gap-2 text-meta text-muted">
                  <input type="checkbox" checked={d.clearPassword} onChange={(e) => p.onDraft({ ...d, clearPassword: e.target.checked, password: '' })} />
                  {t('Remove the saved password')}
                </label>
              )}
              <Field label={t('From address')} description={lockNote('from') ?? t('For example: OpenTodo <todo@example.com>. Your mail provider may require an address it owns.')}>
                <Input aria-label={t('From address')} value={d.from} readOnly={locked('from')} required onChange={(e) => p.onDraft({ ...d, from: e.target.value })} />
              </Field>
              {p.error && <Notice tone="danger">{p.error}</Notice>}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => p.onDraft(null)}>{t('Cancel')}</Button>
                <Button variant="primary" type="submit" busy={p.busy} disabled={p.offline}>{t('Save')}</Button>
              </div>
            </form>
          )}
        </>
      )}
    </SettingsSection>
  )
}

function describe(err: unknown): string {
  if (err instanceof ApiError) return err.message.charAt(0).toUpperCase() + err.message.slice(1)
  return t('The server could not be reached.')
}

/** Loads and saves the owner's outgoing email settings. */
export function OutgoingEmailPanel() {
  const online = useOnline()
  const [settings, setSettings] = useState<SmtpSettings | null>(null)
  const [unreachable, setUnreachable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<SmtpDraft | null>(null)
  const [test, setTest] = useState<SmtpTestResult | null>(null)

  const load = useCallback(async () => {
    try {
      const next = await api.smtpSettings()
      setSettings(next)
      // The email actions elsewhere follow the configuration without a reload.
      setOutgoingEmail(next.configured)
      setUnreachable(false)
    } catch (err) {
      if (isNetworkError(err)) setUnreachable(true)
      else setError(describe(err))
    }
  }, [])
  useEffect(() => {
    if (online) void load()
  }, [online, load])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      if (isNetworkError(err)) setUnreachable(true)
      setError(describe(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <OutgoingEmailView settings={settings} offline={!online || unreachable} busy={busy} error={error} draft={draft} test={test}
      onConfigure={() => { if (settings) { setError(null); setDraft(draftFrom(settings)) } }}
      onDraft={(d) => { setDraft(d); if (!d) setError(null) }}
      onSave={() => void run(async () => {
        if (!settings || !draft) return
        const next = await api.saveSmtpSettings(inputFrom(settings, draft))
        setSettings(next)
        setOutgoingEmail(next.configured)
        setTest(null)
        setDraft(null)
      })}
      onTest={() => void run(async () => {
        const res = await api.testSmtp()
        setTest(res)
        await load()
      })} />
  )
}
