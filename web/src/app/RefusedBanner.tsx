import { dismissRefusal, type Refusal } from '../lib/appUpdate'
import { causeMessage, REFUSED, SIGNED_UPDATES_PAGE, WHAT_TO_DO } from '../lib/appCodeCopy'
import { t } from '../lib/i18n'
import { Icon } from '../ui'
import { navigate } from './router'

/**
 * An update the worker refused (OpenSpec change signed-web-app, design D18):
 * the likely cause, the help page, a close button and no reload. Loaded only
 * when there is one, so the first load doesn't carry it.
 */
export default function RefusedBanner({ refused }: { refused: Refusal }) {
  return (
    <div role="alert" data-update-banner="refused" className="flex items-start gap-2 border-b border-warning bg-warning-soft px-4 py-2 text-body text-on-warning-soft">
      <p className="min-w-0 flex-1">
        {t(REFUSED)} {t(causeMessage(refused.check.cause, refused.ownKey))}{' '}
        <button type="button" className="underline" onClick={() => navigate({ view: 'help', page: SIGNED_UPDATES_PAGE })}>{t(WHAT_TO_DO)}</button>
      </p>
      <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm -mr-1 px-1 py-1" aria-label={t('Dismiss')} onClick={dismissRefusal}><Icon name="x" size="xs" /></button>
    </div>
  )
}
