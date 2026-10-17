import { useUpdateReason } from '../lib/appUpdate'
import { t } from '../lib/i18n'

/**
 * The reload prompt after a server upgrade (OpenSpec change
 * client-sync-robustness): a newer release took over this tab's service worker,
 * or a newer tab upgraded the local database (this tab can no longer save).
 */
export function UpdateBanner() {
  const reason = useUpdateReason()
  if (!reason) return null
  return (
    <div role="alert" data-update-banner className="border-b border-warning bg-warning-soft px-4 py-2 text-body text-on-warning-soft">
      {reason === 'database'
        ? t('A newer version of OpenTodo is open in another tab. Reload this tab to keep working.')
        : t('A new version of OpenTodo is ready.')}{' '}
      <button type="button" className="underline" onClick={() => window.location.reload()}>{t('Reload to update')}</button>
    </div>
  )
}
