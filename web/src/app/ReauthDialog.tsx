import { type FormEvent, useEffect, useRef, useState } from 'react'
import { api, ApiError, setReauthHandler } from '../lib/api'
import { Dialog } from './overlay'

// Step-up re-authentication (OpenSpec `mfa-totp`). Sensitive actions answer
// `reauth_required` when the session has not proved its identity in the last
// ten minutes; the API client then calls the handler registered here, which
// opens this dialog. After a successful password or code the original request
// is repeated once by the client.

export interface ReauthDialogViewProps {
  mode: 'password' | 'code'
  value: string
  busy: boolean
  error: string | null
  onMode: (m: 'password' | 'code') => void
  onValue: (v: string) => void
  onSubmit: () => void
  onCancel: () => void
}

/** Presentational dialog, rendered without effects so it can be tested directly. */
export function ReauthDialogView(p: ReauthDialogViewProps) {
  function submit(e: FormEvent) {
    e.preventDefault()
    p.onSubmit()
  }
  return (
    <Dialog title="Confirm it's you" onClose={p.onCancel} testId="reauth-dialog">
        <p className="text-sm text-slate-500">
          This change needs a recent sign-in. Enter your {p.mode === 'password' ? 'password' : 'current code from your authenticator app'} to continue.
        </p>
        <form className="mt-3 space-y-3" onSubmit={submit}>
          {p.mode === 'password' ? (
            <input className="input" type="password" autoComplete="current-password" aria-label="Password" required autoFocus
              value={p.value} onChange={(e) => p.onValue(e.target.value)} />
          ) : (
            <input className="input font-mono tracking-widest" inputMode="numeric" autoComplete="one-time-code" aria-label="Code from your authenticator app"
              required autoFocus maxLength={7} value={p.value} onChange={(e) => p.onValue(e.target.value)} />
          )}
          {p.error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{p.error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary" disabled={p.busy}>{p.busy ? 'Checking…' : 'Continue'}</button>
            <button type="button" className="btn-ghost" onClick={p.onCancel}>Cancel</button>
            <button type="button" className="btn-ghost ml-auto text-xs" onClick={() => p.onMode(p.mode === 'password' ? 'code' : 'password')}>
              {p.mode === 'password' ? 'Use an app code instead' : 'Use my password instead'}
            </button>
          </div>
        </form>
    </Dialog>
  )
}

export function reauthMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Your server cannot be reached. Try again when you are online.'
  switch (err.code) {
    case 'invalid_credentials':
      return 'That password is not correct.'
    case 'mfa_code_invalid':
      return 'That code is not valid. Type the newest code from your app.'
    case 'rate_limited':
      return 'Too many attempts. Wait a minute and try again.'
    default:
      return err.message
  }
}

/** Mounted once at the app root: registers the prompt with the API client. */
export function ReauthHost() {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'password' | 'code'>('password')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const resolver = useRef<((ok: boolean) => void) | null>(null)

  useEffect(() => setReauthHandler(() => new Promise<boolean>((resolve) => {
    resolver.current = resolve
    setValue('')
    setError(null)
    setOpen(true)
  })), [])

  function finish(ok: boolean) {
    setOpen(false)
    setValue('')
    resolver.current?.(ok)
    resolver.current = null
  }

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      await api.reauth(mode === 'password' ? { password: value } : { code: value })
      finish(true)
    } catch (err) {
      setError(reauthMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null
  return (
    <ReauthDialogView
      mode={mode} value={value} busy={busy} error={error}
      onMode={(m) => { setMode(m); setValue(''); setError(null) }}
      onValue={setValue} onSubmit={() => void submit()} onCancel={() => finish(false)}
    />
  )
}
