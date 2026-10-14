import { requestSync, useSyncStatus } from '../lib/sync'
import { useDateTimeFormat } from './DateTimePrefsProvider'

/** Fired to show the two-factor enrolment wizard (App listens; OpenSpec `mfa-totp`). */
export const ENROLMENT_EVENT = 'opentodo:mfa-enrolment-required'

export function SyncStatus() {
  const dt = useDateTimeFormat()
  const s = useSyncStatus()
  const map = {
    idle: { dot: 'bg-emerald-500', text: s.pending > 0 ? `${s.pending} pending` : 'Synced' },
    syncing: { dot: 'bg-sky-500 animate-pulse', text: 'Syncing…' },
    reseeding: { dot: 'bg-sky-500 animate-pulse', text: 'Re-syncing after restore…' },
    offline: { dot: 'bg-slate-400', text: s.pending > 0 ? `Offline · ${s.pending} pending` : 'Offline' },
    error: { dot: 'bg-red-500', text: 'Sync error' },
    unauthenticated: { dot: 'bg-amber-500', text: 'Signed out' },
    restricted: { dot: 'bg-amber-500', text: s.pending > 0 ? `Set up two-factor · ${s.pending} waiting` : 'Set up two-factor to sync' },
    // End-to-end encryption (OpenSpec e2ee): no key on this device, sync paused.
    locked: { dot: 'bg-amber-500', text: 'Locked' },
    // Demo sandbox write budget used up (OpenSpec `demo-sandboxes`); changes wait.
    limited: { dot: 'bg-amber-500', text: s.pending > 0 ? `Demo limit · ${s.pending} waiting` : 'Demo limit reached' },
  }[s.state]
  // Live state is secondary information: shown next to the existing text, and only
  // when it says something (offline and signed out already imply "not live").
  const showLive = s.state !== 'offline' && s.state !== 'unauthenticated' && s.state !== 'restricted' && s.state !== 'locked'
  const liveText = s.live ? 'Live' : 'Polling'
  const liveTitle = s.live ? 'Live updates connected' : 'Live updates disconnected; checking every 30 s'
  const lastSynced = s.lastSyncedAt ? `Last synced ${dt.formatInstant(s.lastSyncedAt, 'time')}` : 'Click to sync now'
  return (
    <button
      type="button"
      onClick={() => (s.state === 'restricted' ? window.dispatchEvent(new Event(ENROLMENT_EVENT)) : requestSync(0))}
      title={s.state === 'locked' ? 'This device is locked: unlock it with your encryption passphrase to sync.' : s.state === 'restricted' ? 'The server owner requires two-factor authentication for your account. Click to set it up; your changes upload afterwards.' : s.error ?? `${lastSynced} · ${liveTitle}`}
      className="flex items-center gap-2 rounded-md px-2 py-1 text-xs text-muted hover:bg-slate-100 dark:hover:bg-slate-800"
    >
      <span className={`h-2 w-2 rounded-full ${map.dot}`} />
      {map.text}
      {showLive && (
        <span className={`hidden sm:inline ${s.live ? 'text-faint' : 'text-faint'}`} aria-label={liveTitle}>
          · {liveText}
        </span>
      )}
    </button>
  )
}
