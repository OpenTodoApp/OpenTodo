// The pill of pull to sync (OpenSpec change phone-delight, design D3): under the
// phone bar, centred, held in place in the screen's own scroller (a screen can be a pane), it follows the pull and then the sync, and says how the sync
// ended in the sync status's own words. Announced politely while it says something.
import { t } from '../../lib/i18n'
import { useSyncStatus } from '../../lib/sync'
import { Icon } from '../../ui'
import { prefersReducedMotion } from '../../app/motion'
import type { PullState } from '../pullToSync'

export function PullToSync({ pull }: { pull: PullState }) {
  const sync = useSyncStatus()
  const ended = sync.state === 'offline' ? t('Offline') : sync.state === 'error' ? t('Sync error') : t('Synced')
  const text = pull.phase === 'pulling' ? t('Pull to sync') : pull.phase === 'armed' ? t('Release to sync') : pull.phase === 'syncing' ? t('Syncing…') : pull.phase === 'done' ? ended : ''
  const icon = pull.phase === 'syncing' ? 'loader-circle' : pull.phase === 'done' ? (sync.state === 'offline' ? 'signal-low' : sync.state === 'error' ? 'circle-alert' : 'check') : 'arrow-down'
  const still = prefersReducedMotion()
  return (
    <div aria-live="polite" data-pull-to-sync={pull.phase === 'idle' ? undefined : pull.phase}
      className="pointer-events-none sticky top-[calc(3.25rem+max(0.25rem,var(--safe-top)))] z-20 flex h-0 items-start justify-center overflow-visible">
      {pull.phase !== 'idle' && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-soft bg-surface/90 px-3 py-1.5 text-meta text-default shadow-2 backdrop-blur-xl dark:bg-raised/90"
          style={still ? undefined : { transform: `translateY(${pull.offset}px)` }}>
          <Icon name={icon} size="sm" className={`${pull.phase === 'syncing' ? 'animate-spin' : ''} ${pull.phase === 'armed' ? 'rotate-180' : ''} transition-transform duration-(--duration-ui)`} />
          {text}
        </span>
      )}
    </div>
  )
}
