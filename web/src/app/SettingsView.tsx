import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../lib/api'
import { bookmarklet } from '../lib/share'
import { useSyncStatus } from '../lib/sync'
import type { User } from '../lib/types'
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

      <CaptureSection />

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

/**
 * Bookmarklet for this server (OpenSpec `share-capture`). The href is set through
 * the DOM because React refuses `javascript:` URLs; clicking it here does nothing
 * (the app's CSP would block it anyway), it is meant to be dragged to the bar.
 */
function CaptureSection() {
  const code = bookmarklet(location.origin)
  const linkRef = useRef<HTMLAnchorElement>(null)
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null)
  useEffect(() => {
    linkRef.current?.setAttribute('href', code)
  }, [code])

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied('yes')
    } catch {
      setCopied('failed')
    }
  }

  return (
    <section className="space-y-2">
      <h2 className="font-semibold">Capture</h2>
      <p className="text-sm text-slate-500">
        Drag this button to your bookmarks bar. On any page, click it to add the page, its title and the selected text to OpenTodo in a small window.
        It holds no password or token; it uses your sign-in on this server. On a phone, install the app and use the share menu instead.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <a
          ref={linkRef}
          draggable
          className="btn-primary cursor-grab"
          title="Drag to your bookmarks bar"
          onClick={(e) => e.preventDefault()}
        >
          Add to OpenTodo
        </a>
        <button className="btn-ghost border border-slate-300 dark:border-slate-700" onClick={() => void copy()}>Copy bookmarklet</button>
        {copied === 'yes' && <span className="text-xs text-emerald-700 dark:text-emerald-400">Copied. Create a bookmark and paste it as the address.</span>}
      </div>
      {copied === 'failed' && (
        <label className="block text-xs text-slate-500">
          Copy this code and paste it as a bookmark's address:
          <textarea className="input mt-1 font-mono text-xs" readOnly rows={3} value={code} onFocus={(e) => e.currentTarget.select()} />
        </label>
      )}
      <p className="text-xs text-slate-400">A browser extension for Chromium and Firefox is in the repository under <code>extension/</code>; see docs/capture.md.</p>
    </section>
  )
}
