// Settings → Notifications → Weekly digest (OpenSpec change `stats-and-review`,
// design D5–D8): an opt-in email with last week's numbers, sent by the server on
// the chosen weekday and hour. The card leads with its state; "Change" opens the
// weekday and hour; the time zone and language are captured from this browser
// when saving and shown. Server data: it needs a connection. DigestView renders
// every state without effects (tests, stories); DigestCard loads and saves.
import { useEffect, useState } from 'react'
import { Badge, Button, Field, Notice, Select, SettingRow, SettingsSection, Switch } from '../ui'
import { api, ApiError, isNetworkError } from '../lib/api'
import { formatDate, formatHour, formatInstant } from '../lib/dates'
import { useDemo } from '../lib/demo'
import type { EmailDigest, EmailDigestInput } from '../lib/types'
import { useDateTimeFormat } from './DateTimePrefsProvider'

/** The digest's languages, as the server's message templates (internal/mail). */
export const DIGEST_LANGUAGES: Record<string, string> = { en: 'English', de: 'Deutsch', fr: 'Français', es: 'Español', it: 'Italiano', pt: 'Português' }

/** The browser's first supported language (primary subtag), else English (design D7). */
export function browserDigestLanguage(languages: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]): string {
  for (const l of languages) {
    const primary = l.toLowerCase().split('-')[0]
    if (primary in DIGEST_LANGUAGES) return primary
  }
  return 'en'
}

/** The browser's IANA time zone, or UTC when it cannot tell. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** Weekday names, 0 = Sunday (2026-10-11 is a Sunday). */
export function weekdayName(wd: number, style: 'long' | 'short' = 'long'): string {
  return new Intl.DateTimeFormat('en', { weekday: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 9, 11 + wd)))
}

/** The state line: "On, Fridays at 07:00 (Europe/Zurich)" or "Off". */
export function digestSummary(d: Pick<EmailDigest, 'enabled' | 'weekday' | 'hour' | 'timeZone'>, hour = formatHour(d.hour)): string {
  return d.enabled ? `On, ${weekdayName(d.weekday)}s at ${hour} (${d.timeZone})` : 'Off'
}

/** The last send's outcome in words, or null before the first. */
export function digestOutcome(d: Pick<EmailDigest, 'lastOutcome' | 'lastSentFor'>): { text: string; tone: 'ok' | 'warn' } | null {
  const day = d.lastSentFor ? formatDate(d.lastSentFor, 'long') : ''
  switch (d.lastOutcome) {
    case undefined: case '': return null
    case 'sent': return { text: `Last sent ${day}`, tone: 'ok' }
    case 'skipped': return { text: `Skipped ${day}: the mail server could not be reached for six hours`, tone: 'warn' }
    case 'encrypted_account': return { text: 'Not sent: the account uses end-to-end encryption', tone: 'warn' }
    case 'rate_limited': return { text: 'The last attempt hit the sending limit; it is retried', tone: 'warn' }
    default: return { text: `The last attempt failed (${d.lastOutcome}); it is retried for six hours`, tone: 'warn' }
  }
}

const UNAVAILABLE: EmailDigest = { available: false, encryption: false, enabled: false, weekday: 5, hour: 7, timeZone: 'UTC', language: 'en', nextSendAt: null, lastAttemptAt: null }

export type DigestState =
  | { kind: 'loading' }
  | { kind: 'offline' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; digest: EmailDigest }

export interface DigestViewProps {
  state: DigestState
  demo: boolean
  busy: boolean
  /** The weekday and hour editor is open. */
  editing: boolean
  draft: { weekday: number; hour: number }
  /** What saving captures from this browser. */
  capture: { timeZone: string; language: string }
  error: string | null
  onToggle: (on: boolean) => void
  onEdit: () => void
  onCancel: () => void
  onDraft: (d: { weekday: number; hour: number }) => void
  onSave: () => void
}

export function DigestView(p: DigestViewProps) {
  const s = p.state
  const d = s.kind === 'ready' ? s.digest : null
  const outcome = d ? digestOutcome(d) : null
  return (
    <SettingsSection title="Weekly digest" headingId="email-digest-heading"
      description="An email on your review day with last week's numbers, what is overdue and due soon, projects without a next action, and a link to your weekly review.">
      {s.kind === 'loading' ? (
        <p className="py-2 text-meta text-faint">Checking…</p>
      ) : s.kind === 'offline' ? (
        <Notice>The weekly digest is set on the server, so changing it needs a connection.</Notice>
      ) : s.kind === 'error' ? (
        <Notice tone="danger">{s.message}</Notice>
      ) : p.demo ? (
        <Notice>The weekly digest is not available on this demo instance: it would send email.</Notice>
      ) : !d!.available ? (
        <Notice>The weekly digest needs outgoing email, which the server owner has to configure first (Settings → Server → Outgoing email).</Notice>
      ) : d!.encryption ? (
        <Notice>The weekly digest is not available for accounts with end-to-end encryption, because the message would contain your task titles.</Notice>
      ) : (
        <>
          <SettingRow label="Email me a weekly digest" status={
            <span className="flex flex-wrap items-center gap-2" data-testid="digest-summary">
              <Badge hue={d!.enabled ? 'green' : 'slate'}>{digestSummary(d!)}</Badge>
              {d!.enabled && d!.nextSendAt !== null && <span className="text-muted">Next: {formatInstant(d!.nextSendAt, 'long')}</span>}
              {outcome && <span className={outcome.tone === 'warn' ? 'text-warning' : 'text-muted'} data-testid="digest-outcome">{outcome.text}</span>}
            </span>
          } description="The message contains task and project names and goes to your account's email address."
            control={
              <>
                <Button size="sm" aria-expanded={p.editing} aria-disabled={p.busy} onClick={() => { if (!p.busy) p.onEdit() }}>Change</Button>
                <Switch checked={d!.enabled} disabled={p.busy} onChange={p.onToggle} label="Email me a weekly digest" hideLabel />
              </>
            } />
          {p.editing && (
            <div className="space-y-3 py-3" data-testid="digest-editor">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Day">
                  <Select value={p.draft.weekday} onChange={(e) => p.onDraft({ ...p.draft, weekday: Number(e.target.value) })}>
                    {[1, 2, 3, 4, 5, 6, 0].map((wd) => <option key={wd} value={wd}>{weekdayName(wd)}</option>)}
                  </Select>
                </Field>
                <Field label="Time">
                  <Select value={p.draft.hour} onChange={(e) => p.onDraft({ ...p.draft, hour: Number(e.target.value) })}>
                    {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{formatHour(h)}</option>)}
                  </Select>
                </Field>
              </div>
              <p className="text-meta text-muted">
                Time zone {p.capture.timeZone} and language {DIGEST_LANGUAGES[p.capture.language] ?? p.capture.language}, from this browser.
              </p>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={p.onCancel}>Cancel</Button>
                <Button size="sm" variant="primary" aria-disabled={p.busy} onClick={() => { if (!p.busy) p.onSave() }}>Save</Button>
              </div>
            </div>
          )}
          {!p.editing && d!.enabled && (
            <p className="py-2 text-meta text-muted">
              Time zone {d!.timeZone} · Language {DIGEST_LANGUAGES[d!.language] ?? d!.language}
            </p>
          )}
        </>
      )}
      {p.error && <Notice tone="danger">{p.error}</Notice>}
    </SettingsSection>
  )
}

const failure = (err: unknown) => (isNetworkError(err) ? 'You are offline: the weekly digest is set on the server. Try again when connected.' : (err as ApiError).message)

export function DigestCard() {
  useDateTimeFormat() // re-render on a time format change
  const demo = !!useDemo()
  const [state, setState] = useState<DigestState>({ kind: 'loading' })
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ weekday: 5, hour: 7 })
  const [error, setError] = useState<string | null>(null)
  const capture = { timeZone: browserTimeZone(), language: browserDigestLanguage() }

  useEffect(() => {
    api.emailDigest().then((digest) => setState({ kind: 'ready', digest }),
      (err) => setState(isNetworkError(err) ? { kind: 'offline' }
        // A server without the route (older, or a demo answering for it) has no digest to offer.
        : (err as ApiError).status === 404 ? { kind: 'ready', digest: { ...UNAVAILABLE } }
        : { kind: 'error', message: (err as ApiError).message }))
  }, [])

  const save = async (patch: EmailDigestInput) => {
    setBusy(true)
    setError(null)
    try {
      const digest = await api.updateEmailDigest({ ...patch, timeZone: capture.timeZone, language: capture.language })
      setState({ kind: 'ready', digest })
      setEditing(false)
    } catch (err) {
      setError(failure(err))
    } finally {
      setBusy(false)
    }
  }
  const current = state.kind === 'ready' ? state.digest : null
  return (
    <DigestView state={state} demo={demo} busy={busy} editing={editing} draft={draft} capture={capture} error={error}
      onToggle={(on) => {
        // Turning on with the editor closed opens it, so the day and time are chosen first.
        if (on && current && !current.enabled && !editing) { setDraft({ weekday: current.weekday, hour: current.hour }); setEditing(true); return }
        void save({ enabled: on })
      }}
      onEdit={() => { if (current) setDraft({ weekday: current.weekday, hour: current.hour }); setEditing(true) }}
      onCancel={() => setEditing(false)}
      onDraft={setDraft}
      onSave={() => void save({ enabled: true, weekday: draft.weekday, hour: draft.hour })} />
  )
}
