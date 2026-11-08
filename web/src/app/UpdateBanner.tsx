import { lazy, Suspense } from 'react'
import { useRefusal, useUpdateReason } from '../lib/appUpdate'
import { t } from '../lib/i18n'

const RefusedBanner = lazy(() => import('./RefusedBanner'))

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
      <div role="alert" data-update-banner className="border-b border-warning bg-warning-soft px-4 py-2 text-body text-on-warning-soft">
        {reason === 'database'
          ? t('A newer version of OpenTodo is open in another tab. Reload this tab to keep working.')
          : t('A new version of OpenTodo is ready.')}{' '}
        <button type="button" className="underline" onClick={() => window.location.reload()}>{t('Reload to update')}</button>
      </div>
    )
  }
  if (!refused) return null
  return <Suspense fallback={null}><RefusedBanner refused={refused} /></Suspense>
}
