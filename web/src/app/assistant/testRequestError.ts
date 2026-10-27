import { ApiError } from '../../lib/api'
import { t } from '../../lib/i18n'

/**
 * The text of a "Test connection" whose request the server itself refused
 * (api-method-not-allowed, GitHub issue 501): a 405 or an unknown route means
 * the request was changed on its way, usually by a redirect in a reverse proxy,
 * so the provider was never asked. The server's own message names the method
 * and path it received. Other failures read as `fallback` words them.
 */
export function testRequestError(err: unknown, fallback: (err: unknown) => string): string {
  if (err instanceof ApiError && (err.code === 'method_not_allowed' || (err.status === 404 && err.code === 'not_found'))) {
    return t('The server rejected the test request ({status}: {reason}). A reverse proxy or a redirect may have changed it on the way; the provider was not asked.', {
      status: err.status,
      reason: err.serverMessage,
    })
  }
  return fallback(err)
}
