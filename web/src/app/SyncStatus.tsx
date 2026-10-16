import { Tooltip } from '../ui'
import { requestSync, useSyncStatus } from '../lib/sync'
import { useDemo } from '../lib/demo'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { t } from '../lib/i18n'

/** Fired to show the two-factor enrolment wizard (App listens; OpenSpec `mfa-totp`). */
export const ENROLMENT_EVENT = 'opentodo:mfa-enrolment-required'

export function SyncStatus({ compact = false }: { compact?: boolean } = {}) {
  const dt = useDateTimeFormat()
  const s = useSyncStatus()
  const demo = !!useDemo()
  const map = {
    idle: { dot: 'bg-success', text: s.pending > 0 ? t('{n} pending', { n: s.pending }) : t('Synced') },
    syncing: { dot: 'bg-info animate-pulse', text: t('Syncing…') },
    reseeding: { dot: 'bg-info animate-pulse', text: t('Re-syncing after restore…') },
    offline: { dot: 'bg-faint', text: s.pending > 0 ? t('Offline · {n} pending', { n: s.pending }) : t('Offline') },
    error: { dot: 'bg-danger', text: t('Sync error') },
    unauthenticated: { dot: 'bg-warning', text: t('Signed out') },
    restricted: { dot: 'bg-warning', text: s.pending > 0 ? t('Set up two-factor · {n} waiting', { n: s.pending }) : t('Set up two-factor to sync') },
    // End-to-end encryption (OpenSpec e2ee): no key on this device, sync paused.
    locked: { dot: 'bg-warning', text: t('Locked') },
    // Demo sandbox write budget used up (OpenSpec `demo-sandboxes`), or a hosted
    // server's limit (multi-tenant-host); changes wait on this device.
    limited: demo
      ? { dot: 'bg-warning', text: s.pending > 0 ? t('Demo limit · {n} waiting', { n: s.pending }) : t('Demo limit reached') }
      : { dot: 'bg-warning', text: s.pending > 0 ? t('Server limit · {n} waiting', { n: s.pending }) : t('Server limit reached') },
  }[s.state]
  // Live state is secondary information: shown next to the existing text, and only
  // when it says something (offline and signed out already imply "not live").
  const showLive = s.state !== 'offline' && s.state !== 'unauthenticated' && s.state !== 'restricted' && s.state !== 'locked'
  const liveTitle = s.live ? t('Live updates connected') : t('Live updates disconnected; checking every 30 s')
  const lastSynced = s.lastSyncedAt ? t('Last synced {time}', { time: dt.formatInstant(s.lastSyncedAt, 'time') }) : t('Click to sync now')
  // Quiet (ux-overhaul, app-shell "Sync status is quiet"): the text is visible only
  // while something needs attention (offline, error, pending, locked…); when synced
  // the dot alone shows and the text lives in the tooltip and the accessible name.
  const quiet = s.state === 'idle' && s.pending === 0
  const detail = s.state === 'locked' ? t('This device is locked: unlock it with your encryption passphrase to sync.') : s.state === 'restricted' ? t('The server owner requires two-factor authentication for your account. Click to set it up; your changes upload afterwards.') : s.error ?? `${lastSynced} · ${liveTitle}`
  const name = `${map.text}${showLive ? ` · ${liveTitle}` : ''}`
  const button = (
    <button
      type="button"
      onClick={() => (s.state === 'restricted' ? window.dispatchEvent(new Event(ENROLMENT_EVENT)) : requestSync(0))}
      aria-label={quiet ? name : `${name}. ${detail}`}
      data-sync-status={s.state}
      className={`flex min-h-9 items-center gap-2 rounded-control text-meta text-muted hover:bg-sunken dark:hover:bg-raised ${compact ? 'justify-center px-0' : 'px-2 py-1'}`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${map.dot}`} />
      {!quiet && !compact && <span className="min-w-0 truncate">{map.text}</span>}
    </button>
  )
  return <Tooltip label={quiet ? name : detail} side={compact ? 'right' : 'top'}>{button}</Tooltip>
}
