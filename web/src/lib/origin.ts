// The server refuses a page opened at a host other than its OPENTODO_BASE_URL
// (trusted-client-identity). The sign-in screen then names the right address
// instead of asking for a reload that cannot help (issue #125).
import { ApiError } from './api'
import { t } from './i18n'

/**
 * The message for a `bad_origin` refusal when this page is not at the server's
 * configured host (`passkeyDomain` in auth/status), or null when that does not
 * explain it.
 */
export function wrongHostMessage(err: unknown, configuredHost: string | undefined, here = location.hostname): string | null {
  if (!(err instanceof ApiError) || err.code !== 'bad_origin' || !configuredHost) return null
  if (configuredHost.toLowerCase() === here.toLowerCase()) return null
  return t('This server is set up for {host}. Open https://{host} and try again.', { host: configuredHost })
}
