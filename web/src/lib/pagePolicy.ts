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
