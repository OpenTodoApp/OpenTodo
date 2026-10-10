import { type FormEvent, useState } from 'react'
import { api, ApiError } from '../lib/api'
import type { AuthStatus } from '../lib/types'

export function AuthScreen({ status, onAuthenticated }: { status: AuthStatus; onAuthenticated: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>(status.setupRequired ? 'register' : 'login')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'register') await api.register(email, name, password)
      else await api.login(email, password)
      onAuthenticated()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Is the server reachable?')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-6 flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="h-9 w-9" />
          <div>
            <h1 className="text-lg font-semibold">OpenTodo</h1>
            <p className="text-xs text-slate-500">Your tasks, your server.</p>
          </div>
        </div>

        {status.setupRequired && (
          <p className="mb-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
            Welcome! Create the owner account for this server. Only you can do this; sign-up closes afterwards unless you open it.
          </p>
        )}

        <form onSubmit={(e) => void submit(e)} className="space-y-3">
          {mode === 'register' && (
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600 dark:text-slate-300">Name</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </label>
          )}
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600 dark:text-slate-300">Email</span>
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600 dark:text-slate-300">Password {mode === 'register' && <span className="text-slate-400">(10+ characters)</span>}</span>
            <input className="input" type="password" required minLength={mode === 'register' ? 10 : 1} value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />
          </label>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'register' ? (status.setupRequired ? 'Create owner account' : 'Create account') : 'Sign in'}
          </button>
        </form>

        {!status.setupRequired && status.signupAllowed && (
          <button className="btn-ghost mt-3 w-full" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
          </button>
        )}
        <p className="mt-6 text-center text-xs text-slate-400">OpenTodo {status.version} · AGPL-3.0 · no tracking, no telemetry</p>
      </div>
    </div>
  )
}
