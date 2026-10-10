import { useEffect, useState } from 'react'
import { api, ApiError } from '../lib/api'
import { useSyncStatus } from '../lib/sync'
import type { User } from '../lib/types'
import { QuickAddSettingsSection } from './QuickAddSettings'
import { MembersPanel } from './MembersPanel'

interface TokenRow { id: string; name: string; createdAt: number; lastUsedAt: number | null }

export function SettingsView({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [tokens, setTokens] = useState<TokenRow[] | null>(null)
  const [newName, setNewName] = useState('')
  const [secret, setSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sync = useSyncStatus()

  async function load() {
    try {
      setTokens((await api.listTokens()).tokens)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Offline: tokens are managed on the server.')
    }
  }
  useEffect(() => {
    void load()
  }, [])

  async function create() {
    setError(null)
    try {
      const res = await api.createToken(newName || 'API token')
      setSecret(res.secret)
      setNewName('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-6 md:px-8">
      <section>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">{user.name || user.email} · {user.email} · {user.role}</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Your data</h2>
        <p className="text-sm text-slate-500">
          Everything you see is stored on this device and on your server. Export it any time as JSON.
        </p>
        <a className="btn-ghost border border-slate-300 dark:border-slate-700" href="/api/v1/export" download="opentodo-export.json">Download export (JSON)</a>
        <p className="text-xs text-slate-400">
          Sync: {sync.state}{sync.pending ? `, ${sync.pending} change(s) waiting to upload` : ''}.
        </p>
      </section>

      {user.role === 'owner' && <MembersPanel />}

      <QuickAddSettingsSection />

      <section className="space-y-2">
        <h2 className="font-semibold">API tokens</h2>
        <p className="text-sm text-slate-500">
          Use a token from scripts or a CLI: <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">Authorization: Bearer &lt;token&gt;</code>. See docs/api.md.
        </p>
        <div className="flex gap-2">
          <input className="input max-w-xs" placeholder="Token name (e.g. laptop CLI)" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button className="btn-primary" onClick={() => void create()}>Create</button>
        </div>
        {secret && (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-950">
            <p className="mb-1 font-medium">Copy this token now. It will not be shown again.</p>
            <code className="break-all">{secret}</code>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {tokens?.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="flex-1">{t.name}</span>
              <span className="text-xs text-slate-400">
                created {new Date(t.createdAt).toLocaleDateString()}{t.lastUsedAt ? ` · used ${new Date(t.lastUsedAt).toLocaleDateString()}` : ' · never used'}
              </span>
              <button className="btn-danger text-xs" onClick={() => void api.deleteToken(t.id).then(load)}>Revoke</button>
            </li>
          ))}
          {tokens && tokens.length === 0 && <li className="py-2 text-sm text-slate-400">No tokens yet.</li>}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Session</h2>
        <p className="text-sm text-slate-500">Signing out clears the local copy of your tasks on this device. Unsynced changes are uploaded first when online.</p>
        <button className="btn-ghost border border-slate-300 dark:border-slate-700" onClick={onLogout}>Sign out</button>
      </section>

      <section className="text-xs text-slate-400">
        OpenTodo is free software (AGPL-3.0). No telemetry, no tracking, no subscription.
        <a className="ml-1 underline" href="https://github.com/pixari/opentodo" target="_blank" rel="noreferrer">Source code</a>
      </section>
    </div>
  )
}
