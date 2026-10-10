import { requestSync, useSyncStatus } from '../lib/sync'

export function SyncStatus() {
  const s = useSyncStatus()
  const map = {
    idle: { dot: 'bg-emerald-500', text: s.pending > 0 ? `${s.pending} pending` : 'Synced' },
    syncing: { dot: 'bg-sky-500 animate-pulse', text: 'Syncing…' },
    offline: { dot: 'bg-slate-400', text: s.pending > 0 ? `Offline · ${s.pending} pending` : 'Offline' },
    error: { dot: 'bg-red-500', text: 'Sync error' },
    unauthenticated: { dot: 'bg-amber-500', text: 'Signed out' },
  }[s.state]
  return (
    <button
      type="button"
      onClick={() => requestSync(0)}
      title={s.error ?? (s.lastSyncedAt ? `Last synced ${new Date(s.lastSyncedAt).toLocaleTimeString()}` : 'Click to sync now')}
      className="flex items-center gap-2 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
    >
      <span className={`h-2 w-2 rounded-full ${map.dot}`} />
      {map.text}
    </button>
  )
}
