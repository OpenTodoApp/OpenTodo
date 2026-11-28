import { dismissRefusal, dismissWorkerChange, type Refusal } from '../lib/appUpdate'
import { causeMessage, REFUSED, SIGNED_UPDATES_PAGE, WHAT_TO_DO, WORKER_CHANGED } from '../lib/appCodeCopy'
import { t } from '../lib/i18n'
import { Icon, ToastRegion } from '../ui'
import { UPDATE_NOTICE_CLASS } from './UpdateBanner'
import { navigate } from './router'

/**
 * An update the worker refused (OpenSpec change signed-web-app, design D18):
 * the likely cause, the help page, a close button and no reload. With
 * `workerChanged`, it first warns that the server serves a worker no verified
 * list names (D8). Loaded only when there is one, so the first load doesn't
 * carry it.
 */
export default function RefusedBanner({ refused, workerChanged = false }: { refused: Refusal | null; workerChanged?: boolean }) {
  const dismiss = () => { dismissWorkerChange(); dismissRefusal() }
  return (
    <ToastRegion side="start">
      <div role="alert" data-update-banner={workerChanged ? 'worker-changed' : 'refused'} className={`${UPDATE_NOTICE_CLASS} flex items-start gap-2`}>
        <p className="min-w-0 flex-1">
          {workerChanged && t(WORKER_CHANGED)}
          {workerChanged && refused && ' '}
          {refused && (
            <>
              {t(REFUSED)} {t(causeMessage(refused.check.cause, refused.ownKey))}{' '}
              <button type="button" className="underline" onClick={() => navigate({ view: 'help', page: SIGNED_UPDATES_PAGE })}>{t(WHAT_TO_DO)}</button>
            </>
          )}
        </p>
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm -me-1 px-1 py-1" aria-label={t('Dismiss')} onClick={dismiss}><Icon name="x" size="xs" /></button>
      </div>
    </ToastRegion>
  )
}
