import { useEffect, useState } from 'react'
import { api, ApiError } from '../lib/api'
import type { AppPassword, CaldavSetting } from '../lib/types'

// Settings → Calendar apps (OpenSpec change `caldav`): the owner's toggle, the
// server address with per-client setup hints, and per-user app passwords. The
// pure CaldavView renders every state; CaldavPanel loads and acts.

export interface CaldavViewProps {
  isOwner: boolean
  email: string
  setting: CaldavSetting | null
  passwords: AppPassword[] | null
  newName: string
  /** The app password just created; shown once, until dismissed. */
  secret: string | null
  error: string | null
  busy: boolean
  onToggle: (enabled: boolean) => void
  onNameChange: (name: string) => void
  onCreate: () => void
  onRevoke: (id: string) => void
  onDismissSecret: () => void
}

const day = (ms: number) => new Date(ms).toLocaleDateString()

export function CaldavView(p: CaldavViewProps) {
  const on = p.setting?.enabled ?? false
  const live = (p.passwords ?? []).filter((x) => !x.revokedAt)
  const revoked = (p.passwords ?? []).filter((x) => x.revokedAt)
  return (
    <section className="space-y-3" aria-labelledby="caldav-heading">
      <h2 id="caldav-heading" className="font-semibold">Calendar apps (CalDAV)</h2>
      <p className="text-sm text-slate-500">
        Sync your tasks with Apple Reminders, Thunderbird, Nextcloud Tasks or any CalDAV client through DAVx⁵. Each project is a
        list (calendar) and the Inbox is its own list. Calendar apps sign in with your email and an app password, never your
        account password.
      </p>
      {p.setting === null ? (
        <p className="text-sm text-slate-400">CalDAV status is available when you are online.</p>
      ) : p.isOwner ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={on} disabled={p.busy} onChange={(e) => p.onToggle(e.target.checked)} />
          Allow calendar apps to sync with this server
        </label>
      ) : (
        <p className="text-sm">{on ? 'CalDAV is on for this server.' : 'CalDAV is off. Ask the server owner to turn it on in Settings.'}</p>
      )}
      {p.setting && on && (
        <div className="space-y-2 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">
          <p>
            Server address: <code className="break-all rounded bg-slate-100 px-1 dark:bg-slate-800">{p.setting.url}</code>
            <br />
            User name: <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">{p.email}</code>
          </p>
          {!p.setting.secure && (
            <p role="alert" className="text-amber-700 dark:text-amber-300">
              This address uses plain http: app passwords would travel unencrypted. Put the server behind HTTPS and set
              OPENTODO_BASE_URL before connecting devices outside your home network.
            </p>
          )}
          <ul className="list-disc space-y-1 pl-5 text-slate-600 dark:text-slate-300">
            <li><strong>Apple Reminders</strong> (iPhone, iPad, Mac): Settings → Calendar → Accounts → Add Account → Other → Add CalDAV Account. Server: the address above, then your email and an app password.</li>
            <li><strong>Thunderbird</strong>: New Calendar → On the Network → your email and the address above; pick the lists to show and enter an app password when asked.</li>
            <li><strong>Android / Nextcloud Tasks</strong>: in DAVx⁵ choose “Login with URL and user name”, enter the address, your email and an app password, then enable the task lists for Tasks.org or jtx Board.</li>
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-medium">App passwords</h3>
        <p className="text-xs text-slate-500">One per device, so you can revoke a lost phone without touching the others. They only work for CalDAV.</p>
        <div className="flex flex-wrap gap-2">
          <input className="input max-w-xs" aria-label="App password name" placeholder="Name (e.g. iPhone)" value={p.newName}
            onChange={(e) => p.onNameChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') p.onCreate() }} />
          <button className="btn-primary" disabled={p.busy || p.setting === null} onClick={p.onCreate}>Create app password</button>
        </div>
        {p.secret && (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-950">
            <p className="mb-1 font-medium">Copy this app password now. It will not be shown again.</p>
            <code className="break-all">{p.secret}</code>
            <div className="mt-2"><button className="btn-ghost text-xs" onClick={p.onDismissSecret}>Done</button></div>
          </div>
        )}
        {p.error && <p className="text-sm text-red-600">{p.error}</p>}
        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {live.map((x) => (
            <li key={x.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="flex-1">{x.name}</span>
              <span className="text-xs text-slate-400">created {day(x.createdAt)}{x.lastUsedAt ? ` · used ${day(x.lastUsedAt)}` : ' · never used'}</span>
              <button className="btn-danger text-xs" disabled={p.busy} onClick={() => p.onRevoke(x.id)}>Revoke</button>
            </li>
          ))}
          {revoked.map((x) => (
            <li key={x.id} className="flex items-center gap-3 py-2 text-sm text-slate-400">
              <span className="flex-1 line-through">{x.name}</span>
              <span className="text-xs">revoked {day(x.revokedAt as number)}</span>
            </li>
          ))}
          {p.passwords && p.passwords.length === 0 && <li className="py-2 text-sm text-slate-400">No app passwords yet.</li>}
        </ul>
      </div>
    </section>
  )
}

const message = (err: unknown) => (err instanceof ApiError ? err.message : 'Offline: CalDAV is managed on the server.')

export function CaldavPanel({ isOwner, email }: { isOwner: boolean; email: string }) {
  const [setting, setSetting] = useState<CaldavSetting | null>(null)
  const [passwords, setPasswords] = useState<AppPassword[] | null>(null)
  const [newName, setNewName] = useState('')
  const [secret, setSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    try {
      const [s, list] = await Promise.all([api.caldavSetting(), api.listAppPasswords()])
      setSetting(s)
      setPasswords(list.appPasswords)
    } catch (err) {
      setError(message(err))
    }
  }
  useEffect(() => {
    void load()
  }, [])

  async function run(fn: () => Promise<void>) {
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

  return (
    <CaldavView isOwner={isOwner} email={email} setting={setting} passwords={passwords} newName={newName} secret={secret}
      error={error} busy={busy} onNameChange={setNewName} onDismissSecret={() => setSecret(null)}
      onToggle={(enabled) => void run(async () => setSetting(await api.setCaldavEnabled(enabled)))}
      onCreate={() => void run(async () => {
        const res = await api.createAppPassword(newName.trim() || 'Calendar app')
        setSecret(res.secret)
        setNewName('')
        await load()
      })}
      onRevoke={(id) => void run(async () => {
        await api.revokeAppPassword(id)
        await load()
      })} />
  )
}
