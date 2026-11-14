// The pull-to-sync indicator (OpenSpec change pull-to-sync): a small round mark at
// the top of the page that follows the pull, turns while the sync runs and goes when
// it settles. Loaded only on touch devices (Shell). The gesture is pullToSync.ts.
import { useEffect, useRef, useState, type RefObject } from 'react'
import { t } from '../lib/i18n'
import { takeOverPull } from '../lib/shell'
import { syncNow, syncSnapshot } from '../lib/sync'
import { Icon } from '../ui'
import { showActionToast } from './bulk/toastStore'
import { noMotion, prefersReducedMotion, tick } from './motion'
import { PULL, pullFires, watchPull } from './pullToSync'

/** Where the mark rests while the sync runs (its travel, under the release threshold). */
const REST = 52

/**
 * What a pulled sync says when it could not sync: the sync status's own words
 * (SyncStatus), or the server's sentence. Null when it synced.
 */
export function pullNotice(s: { state: string; error: string | null }): string | null {
  if (s.state === 'offline') return t('Offline')
  if (s.state === 'unauthenticated') return t('Signed out')
  if (s.state === 'locked') return t('Locked')
  return s.error
}

/** Syncs now and says why when it could not. Never reloads, never rejects. */
async function pulledSync(): Promise<void> {
  await syncNow().catch(() => undefined)
  const notice = pullNotice(syncSnapshot())
  if (notice) showActionToast(notice)
}

export default function PullToSync({ scroller }: { scroller: RefObject<HTMLElement | null> }) {
  const mark = useRef<HTMLDivElement>(null)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    const page = scroller.current
    const el = mark.current
    if (!page || !el) return
    // A shell with its own pull to refresh (iOS) leaves the pull to this page, on every
    // load: also when the page comes back from the browser's page cache without loading.
    takeOverPull()
    const shown = (e: PageTransitionEvent) => { if (e.persisted) takeOverPull() }
    window.addEventListener('pageshow', shown)
    let busy = false
    let armed = false
    let gone = false
    // Written straight to the element: a pull moves it on every touch move.
    const show = (offset: number, dragging: boolean) => {
      // Reduced motion: the mark appears in place instead of following the finger.
      const still = prefersReducedMotion() || noMotion()
      const y = still ? (offset > 0 ? REST : 0) : offset
      el.style.transition = dragging && !still ? 'none' : ''
      el.style.transform = `translateY(${y}px)`
      el.style.opacity = String(Math.min(1, (2 * y) / PULL.threshold))
      el.style.setProperty('--pull-turn', still ? '0deg' : `${Math.round((offset / PULL.threshold) * 270)}deg`)
      el.toggleAttribute('data-armed', pullFires(offset))
    }
    const stop = watchPull(page, {
      busy: () => busy,
      onPull: (offset) => {
        if (pullFires(offset) && !armed) tick()
        armed = pullFires(offset)
        show(offset, true)
      },
      onEnd: (fire) => {
        armed = false
        if (!fire) return show(0, false)
        busy = true
        setSyncing(true)
        show(REST, false)
        void pulledSync().then(() => {
          busy = false
          if (gone) return
          setSyncing(false)
          show(0, false)
        })
      },
    })
    return () => {
      gone = true
      window.removeEventListener('pageshow', shown)
      stop()
    }
  }, [scroller])

  return (
    // No height of its own: the mark hangs over the top of the page and is clipped above it.
    <div className="pointer-events-none relative z-20 h-0" data-pull-sync={syncing ? 'syncing' : 'idle'}>
      <div className="absolute inset-x-0 top-0 flex h-28 justify-center overflow-hidden">
        <div ref={mark} className="relative -top-9 flex size-8 items-center justify-center rounded-full border border-default bg-surface text-muted opacity-0 shadow-2 transition-[transform,opacity] duration-(--duration-emphasis) ease-calm data-armed:text-accent">
          <span className="flex" style={{ rotate: 'var(--pull-turn, 0deg)' }}>
            <Icon name="loader-circle" className={syncing ? 'animate-spin motion-reduce:animate-none' : undefined} />
          </span>
        </div>
      </div>
      <span role="status" className="sr-only">{syncing ? t('Syncing…') : ''}</span>
    </div>
  )
}
