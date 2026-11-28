// The page's Content-Security-Policy as the service worker writes it (OpenSpec
// change signed-web-app, design D7): the policy of the signed build, never the
// server's, so scripts come only from the app's own origin whatever the server
// sends. The one part that follows the owner's settings is connect-src: the
// on-device assistant's provider origins (assistant-on-device D4), taken from
// the server's latest policy, origins only.
import fixture from '../../../internal/httpapi/testdata/csp_fixture.json'

/** The server's cspBase (internal/httpapi/assistant_device.go), kept equal by the shared fixture. */
export const CSP_BASE: string = fixture.base

/** An http(s) origin and nothing else: no keyword, wildcard or path. */
const ORIGIN = /^https?:\/\/(?:[a-z0-9-]+\.)*[a-z0-9-]+(?::\d{1,5})?$|^https?:\/\/\[[0-9a-f:.]+\](?::\d{1,5})?$/i

/** The build's policy, with the connect-src origins of the server's policy added. */
export function pagePolicy(serverPolicy: string | null | undefined): string {
  if (!serverPolicy) return CSP_BASE
  const connect = serverPolicy.split(';').map((d) => d.trim().split(/\s+/)).find((d) => d[0]?.toLowerCase() === 'connect-src')
  const base = new Set(CSP_BASE.split(';').map((d) => d.trim()).find((d) => d.startsWith('connect-src'))!.split(/\s+/))
  const extra = [...new Set((connect ?? []).slice(1).filter((o) => ORIGIN.test(o) && !base.has(o)))]
  return extra.length ? `${CSP_BASE} ${extra.join(' ')}` : CSP_BASE
}

/**
 * The policy the worker adds to a document from one of the server's addresses
 * once refusal is on (design D7, phase 2): no script runs, so the document cannot
 * read the app's storage. Forms and the origin stay, so the server's sign-in steps
 * still post with their Origin; a stricter policy the server sends (an
 * attachment's own sandbox) still applies beside it.
 */
export const SERVER_DOCUMENT_POLICY = 'sandbox allow-forms allow-same-origin'

/** Statuses whose response has no body. */
const NO_BODY = new Set([101, 103, 204, 205, 304])

/** The server's document with SERVER_DOCUMENT_POLICY added; a redirect is no document and passes as it is. */
export function sandboxed(res: Response): Response {
  if (res.type === 'opaqueredirect' || res.type === 'opaque' || res.status === 0) return res
  const headers = new Headers(res.headers)
  headers.append('Content-Security-Policy', SERVER_DOCUMENT_POLICY)
  return new Response(NO_BODY.has(res.status) ? null : res.body, { status: res.status, statusText: res.statusText, headers })
}
