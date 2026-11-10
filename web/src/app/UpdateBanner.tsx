import { lazy, Suspense } from 'react'
import { useRefusal, useUpdateReason } from '../lib/appUpdate'
import { t } from '../lib/i18n'
import { ToastRegion } from '../ui'

const RefusedBanner = lazy(() => import('./RefusedBanner'))

/** The notice floats in the bottom corner as a toast, so it never moves the page under the user's finger (no-layout-jump). */
export const UPDATE_NOTICE_CLASS = 'pointer-events-auto rounded-control border border-warning bg-warning-soft px-3 py-2 text-body text-on-warning-soft shadow-2'

/**
 * The reload prompt after a server upgrade (OpenSpec change
 * client-sync-robustness): a newer release took over this tab's service worker,
 * or a newer tab upgraded the local database (this tab can no longer save).
 * Once refusal is on (signed-web-app), an update the worker refused shows here
 * too, with its likely cause and the help page, and no reload.
 */
export function UpdateBanner() {
  const reason = useUpdateReason()
  const refused = useRefusal()
  if (reason) {
    return (
      <ToastRegion side="start">
        <div role="alert" data-update-banner className={UPDATE_NOTICE_CLASS}>
          {reason === 'database'
            ? t('A newer version of OpenTodo is open in another tab. Reload this tab to keep working.')
            : t('A new version of OpenTodo is ready.')}{' '}
          <button type="button" className="underline" onClick={() => window.location.reload()}>{t('Reload to update')}</button>
        </div>
      </ToastRegion>
    )
  }
  if (!refused) return null
  return <Suspense fallback={null}><RefusedBanner refused={refused} /></Suspense>
}
