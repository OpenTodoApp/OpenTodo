import { type FormEvent, useState } from 'react'
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
    } catch (err) {
      setError(describePasswordError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <PasswordView online={online} current={current} next={next} busy={busy} error={error} done={done}
      onCurrent={setCurrent} onNext={setNext} onSubmit={(e) => void submit(e)} />
  )
}

export function PasswordView(p: {
  online: boolean; current: string; next: string; busy: boolean; error: string | null; done: boolean
  onCurrent: (v: string) => void; onNext: (v: string) => void; onSubmit: (e: FormEvent) => void
}) {
  const disabled = !p.online || p.busy
  return (
    <section className="space-y-2" aria-labelledby="password-heading">
      <h2 id="password-heading" className="font-semibold">Password</h2>
      <p className="text-sm text-slate-500">Changing your password signs out your other sessions. This one stays signed in and API tokens keep working.</p>
      {!p.online && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200" role="status">
          You are offline. Changing your password needs a connection to the server.
        </p>
      )}
      <form onSubmit={p.onSubmit} className="flex flex-wrap items-end gap-2">
        {/* Lets password managers attach the new password to the right account. */}
        <input type="text" name="username" autoComplete="username" hidden readOnly />
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600 dark:text-slate-300">Current password</span>
          <input className="input w-56" type="password" autoComplete="current-password" value={p.current} onChange={(e) => p.onCurrent(e.target.value)} disabled={disabled} required />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600 dark:text-slate-300">New password</span>
          <input className="input w-56" type="password" autoComplete="new-password" minLength={10} value={p.next} onChange={(e) => p.onNext(e.target.value)} disabled={disabled} required />
        </label>
        <button className="btn-primary" disabled={disabled}>{p.busy ? 'Changing…' : 'Change password'}</button>
      </form>
      {p.done && <p className="text-sm text-emerald-700 dark:text-emerald-400" role="status">Password changed. Your other sessions were signed out.</p>}
      {p.error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{p.error}</p>}
    </section>
  )
}

export function describePasswordError(err: unknown): string {
  if (!(err instanceof ApiError)) return 'The server is unreachable. Changing your password needs a connection.'
  if (err.code === 'invalid_credentials') return 'Your current password is not correct.'
  if (err.code === 'rate_limited') return 'Too many attempts. Try again later.'
  return err.message
}
