import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Button } from '../ui/Button'
import { Field, Input } from '../ui/Field'
import { Notice } from '../ui/patterns/Notice'
import { SettingRow, SettingsSection } from '../ui/patterns/SettingsSection'
import { api, ApiError } from '../lib/api'
import { useOnline } from '../lib/online'

/**
 * Settings section for every user (OpenSpec `user-management`): change the own
 * password with the current one. Online only, never queued: the change signs
 * out every other session, so it must reach the server now.
 */
export function PasswordSection() {
  const online = useOnline()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [open, setOpen] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setDone(false)
    if (next.length < 10) {
      setError('The new password needs at least 10 characters.')
      return
    }
    setBusy(true)
    try {
      await api.changePassword(current, next)
      setCurrent('')
      setNext('')
      setDone(true)
      setOpen(false)
    } catch (err) {
      setError(describePasswordError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <PasswordView online={online} current={current} next={next} busy={busy} error={error} done={done} open={open}
      onCurrent={setCurrent} onNext={setNext} onSubmit={(e) => void submit(e)}
      onOpen={() => { setDone(false); setOpen(true) }}
      onCancel={() => { setOpen(false); setCurrent(''); setNext(''); setError(null) }} />
  )
}

export function PasswordView(p: {
  online: boolean; current: string; next: string; busy: boolean; error: string | null; done: boolean
  onCurrent: (v: string) => void; onNext: (v: string) => void; onSubmit: (e: FormEvent) => void
  /** Whether the change form is open (closed by default; settings-redesign "Forms open from actions"). */
  open?: boolean
  onOpen?: () => void
  onCancel?: () => void
}) {
  const disabled = !p.online || p.busy
  const opener = useRef<HTMLButtonElement>(null)
  const first = useRef<HTMLInputElement>(null)
  const wasOpen = useRef(false)
  useEffect(() => {
    if (p.open) first.current?.focus()
    else if (wasOpen.current) opener.current?.focus()
    wasOpen.current = !!p.open
  }, [p.open])
  return (
    <SettingsSection title="Password" helpId="settings/password" headingId="password-heading"
      description="Changing your password signs out your other sessions. This one stays signed in and API tokens keep working.">
      {!p.online && <Notice>You are offline. Changing your password needs a connection to your server.</Notice>}
      {p.done && !p.open && <Notice tone="success">Password changed. Your other sessions were signed out.</Notice>}
      {p.open ? (
        <form onSubmit={p.onSubmit} className="space-y-3 py-1" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); p.onCancel?.() } }}>
          {/* Lets password managers attach the new password to the right account. */}
          <input type="text" name="username" autoComplete="username" hidden readOnly />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Current password">
              <Input ref={first} type="password" autoComplete="current-password" value={p.current} onChange={(e) => p.onCurrent(e.target.value)} disabled={disabled} required />
            </Field>
            <Field label="New password" description="At least 10 characters.">
              <Input type="password" autoComplete="new-password" minLength={10} value={p.next} onChange={(e) => p.onNext(e.target.value)} disabled={disabled} required />
            </Field>
          </div>
          {p.error && <Notice tone="danger">{p.error}</Notice>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={p.onCancel}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={disabled} busy={p.busy}>Change password</Button>
          </div>
        </form>
      ) : (
        <SettingRow label="Password" description="Used to sign in on new devices." control={
          <Button ref={opener} variant="secondary" disabled={!p.online} onClick={p.onOpen} aria-expanded={false}>Change password</Button>
        } />
      )}
    </SettingsSection>
  )
}

export function describePasswordError(err: unknown): string {
  if (!(err instanceof ApiError)) return 'The server is unreachable. Changing your password needs a connection.'
  if (err.code === 'invalid_credentials') return 'Your current password is not correct.'
  if (err.code === 'rate_limited') return 'Too many attempts. Try again later.'
  return err.message
}
