import { requestSync, useSyncStatus } from '../lib/sync'

export function SyncStatus() {
  const s = useSyncStatus()
  const map = {
    idle: { dot: 'bg-emerald-500', text: s.pending > 0 ? `${s.pending} pending` : 'Synced' },
    syncing: { dot: 'bg-sky-500 animate-pulse', text: 'Syncing…' },
    reseeding: { dot: 'bg-sky-500 animate-pulse', text: 'Re-syncing after restore…' },
    offline: { dot: 'bg-slate-400', text: s.pending > 0 ? `Offline · ${s.pending} pending` : 'Offline' },
    error: { dot: 'bg-red-500', text: 'Sync error' },
    unauthenticated: { dot: 'bg-amber-500', text: 'Signed out' },
  }[s.state]
  // Live state is secondary information: shown next to the existing text, and only
  // when it says something (offline and signed out already imply "not live").
  const showLive = s.state !== 'offline' && s.state !== 'unauthenticated'
  const liveText = s.live ? 'Live' : 'Polling'
  const liveTitle = s.live ? 'Live updates connected' : 'Live updates disconnected; checking every 30 s'
  const lastSynced = s.lastSyncedAt ? `Last synced ${new Date(s.lastSyncedAt).toLocaleTimeString()}` : 'Click to sync now'
  return (
    <button
      type="button"
      onClick={() => requestSync(0)}
      title={s.error ?? `${lastSynced} · ${liveTitle}`}
      className="flex items-center gap-2 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
    >
      <span className={`h-2 w-2 rounded-full ${map.dot}`} />
      {map.text}
      {showLive && (
        <span className={`hidden sm:inline ${s.live ? 'text-slate-400 dark:text-slate-500' : 'text-slate-400/70 dark:text-slate-600'}`} aria-label={liveTitle}>
          · {liveText}
        </span>
      )}
    </button>
  )
}
