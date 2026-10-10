import { type FormEvent, type KeyboardEvent, useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../lib/api'
import { createPasskey, isCancellation, passkeysSupported } from '../lib/passkeys'
import type { Passkey } from '../lib/types'

// Settings → Security (OpenSpec change `passkeys`). The server list is
// authoritative and not cached for offline use: offline, the panel shows what
// it fetched earlier in this session, read-only.

const AVAILABLE_KEY = 'opentodo.passkeysAvailable'

export function relativeTime(ts: number | null, now = Date.now()): string {
  if (ts === null) return 'never'
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  return new Date(ts).toLocaleDateString()
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

function readCachedAvailability(): boolean {
  try {
    return localStorage.getItem(AVAILABLE_KEY) === 'true'
  } catch {
    return false
  }
}

/** Container: learns availability from auth/status, loads and mutates the list. */
export function SecurityPanel() {
  const [available, setAvailable] = useState<boolean>(readCachedAvailability)
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const online = useOnline()

  const load = useCallback(async () => {
    try {
      const status = await api.authStatus()
      const ok = status.passkeysAvailable === true
      setAvailable(ok)
      try {
        localStorage.setItem(AVAILABLE_KEY, String(ok))
      } catch {
        /* storage unavailable: availability is re-read next time */
      }
      if (ok) setPasskeys((await api.listPasskeys()).passkeys)
    } catch (err) {
      // Offline or server unreachable: keep whatever we had.
      if (err instanceof ApiError) setError(err.message)
    }
  }, [])

  useEffect(() => {
    if (online) void load()
  }, [online, load])

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await load()
    } catch (err) {
      if (isCancellation(err)) return // user closed the browser prompt
      setError(err instanceof ApiError && err.code === 'passkey_challenge_invalid'
        ? 'That took too long. Please try again.'
        : err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [load])

  return (
    <SecurityPanelView
      available={available}
      supported={passkeysSupported()}
      online={online}
      passkeys={passkeys}
      busy={busy}
      error={error}
      onAdd={(name) => run(async () => {
        const { publicKey } = await api.passkeyRegisterOptions()
        const credential = await createPasskey(publicKey)
        await api.passkeyRegister(name, credential)
      })}
      onRename={(id, name) => run(() => api.renamePasskey(id, name))}
      onDelete={(id) => run(() => api.deletePasskey(id))}
    />
  )
}

export interface SecurityPanelViewProps {
  available: boolean
  supported: boolean
  online: boolean
  passkeys: Passkey[] | null
  busy: boolean
  error: string | null
  onAdd: (name: string) => Promise<void> | void
  onRename: (id: string, name: string) => Promise<void> | void
  onDelete: (id: string) => Promise<void> | void
  now?: number
}

/** Presentational part, rendered without effects so it can be tested directly. */
export function SecurityPanelView(p: SecurityPanelViewProps) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  if (!p.available) return null
  const disabled = !p.online || p.busy || !p.supported

  function submitAdd(e: FormEvent) {
    e.preventDefault()
    const name = newName.trim() || defaultDeviceName()
    setAdding(false)
    setNewName('')
    void p.onAdd(name)
  }
  function submitRename(e: FormEvent, id: string) {
    e.preventDefault()
    if (draft.trim()) void p.onRename(id, draft.trim())
    setEditing(null)
  }
  function escapeTo(e: KeyboardEvent, close: () => void) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      close()
    }
  }

  return (
    <section className="space-y-2" aria-labelledby="security-heading" data-testid="security-panel">
      <h2 id="security-heading" className="font-semibold">Security</h2>
      <p className="text-sm text-slate-500">
        Passkeys let you sign in with your device's fingerprint, face or PIN instead of your password. Your password keeps working.
        Register a passkey on a second device so losing one is never a problem.
      </p>
      {!p.online && (
        <p role="status" className="rounded-md bg-amber-50 p-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          You are offline. Managing passkeys needs a connection to your server.
        </p>
      )}
      {p.online && !p.supported && (
        <p role="status" className="text-sm text-slate-500">This browser does not support passkeys.</p>
      )}

      {adding ? (
        <form className="flex gap-2" onSubmit={submitAdd}>
          <input
            className="input max-w-xs" autoFocus aria-label="Passkey name" placeholder="Device name (e.g. Work laptop)"
            value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => escapeTo(e, () => setAdding(false))}
            disabled={disabled}
          />
          <button className="btn-primary" disabled={disabled}>Continue</button>
          <button type="button" className="btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
        </form>
      ) : (
        <button className="btn-primary" disabled={disabled} onClick={() => setAdding(true)}>Add passkey</button>
      )}
      {p.error && <p className="text-sm text-red-600" role="alert">{p.error}</p>}

      <ul className="divide-y divide-slate-200 dark:divide-slate-800">
        {p.passkeys?.map((k) => (
          <li key={k.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
            {editing === k.id ? (
              <form className="flex flex-1 gap-2" onSubmit={(e) => submitRename(e, k.id)}>
                <input
                  className="input max-w-xs" autoFocus aria-label={`New name for ${k.name}`} value={draft}
                  onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => escapeTo(e, () => setEditing(null))}
                />
                <button className="btn-primary text-xs" disabled={disabled}>Save</button>
                <button type="button" className="btn-ghost text-xs" onClick={() => setEditing(null)}>Cancel</button>
              </form>
            ) : (
              <>
                <span className="flex-1">
                  {k.name}
                  {k.suspiciousAt !== null && (
                    <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300"
                      title="A sign-in with this passkey was refused because its counter went backwards. It may have been copied. Delete it unless you can explain this.">
                      Suspicious
                    </span>
                  )}
                </span>
                <span className="text-xs text-slate-400">
                  created {new Date(k.createdAt).toLocaleDateString()} · used {relativeTime(k.lastUsedAt, p.now)}
                </span>
                <button className="btn-ghost text-xs" disabled={disabled} aria-label={`Rename ${k.name}`}
                  onClick={() => { setDraft(k.name); setEditing(k.id) }}>Rename</button>
                <button className="btn-danger text-xs" disabled={disabled} aria-label={`Delete ${k.name}`}
                  onClick={() => { if (window.confirm(`Delete the passkey "${k.name}"? It will no longer sign in.`)) void p.onDelete(k.id) }}>
                  Delete
                </button>
              </>
            )}
          </li>
        ))}
        {p.passkeys && p.passkeys.length === 0 && <li className="py-2 text-sm text-slate-400">No passkeys yet.</li>}
      </ul>
    </section>
  )
}

function defaultDeviceName(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  if (/iPhone|iPad/.test(ua)) return 'iPhone or iPad'
  if (/Android/.test(ua)) return 'Android device'
  if (/Mac/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows PC'
  return 'Passkey'
}
