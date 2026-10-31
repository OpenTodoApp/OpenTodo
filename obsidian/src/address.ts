// The server address and version rules of the connect step (obsidian-plugin D12,
// D13): https, or http only for this device and private networks after a
// warning; a server too old for the obsidian origin and push-only sync is refused.

export type AddressCheck =
  | { ok: true; url: string; warning?: 'plain_http' }
  | { ok: false; reason: 'invalid' }
  | { ok: false; reason: 'insecure'; suggestion: string }

/** Hosts that may be reached over plain http: this device, private and link-local ranges, .local names. */
export function privateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.lan')) return true
  if (h === '::1' || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe80:/.test(h)) return true
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h)
  if (!m) return false
  const [a, b] = [Number(m[1]), Number(m[2])]
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127)
}

/**
 * The address as the plugin stores it: scheme and host (and a path when the
 * server lives under one), no trailing slash. A bare host gets https.
 */
export function checkAddress(input: string): AddressCheck {
  let raw = input.trim()
  if (!raw) return { ok: false, reason: 'invalid' }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = 'https://' + raw
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return { ok: false, reason: 'invalid' }
  }
  if ((u.protocol !== 'https:' && u.protocol !== 'http:') || !u.hostname || u.username || u.password || u.search || u.hash) return { ok: false, reason: 'invalid' }
  const url = (u.origin + u.pathname).replace(/\/+$/, '')
  if (u.protocol === 'http:') {
    if (!privateHost(u.hostname)) return { ok: false, reason: 'insecure', suggestion: url.replace(/^http:/, 'https:') }
    return { ok: true, url, warning: 'plain_http' }
  }
  return { ok: true, url }
}

/**
 * The oldest release that accepts the obsidian origin kind and the push_only
 * feature. A development build `v0.19.0-12-gabc123` (commits after the 0.19.0
 * tag) counts as newer than 0.19.0; a build with no version ("dev") is accepted.
 */
export const MIN_SERVER_VERSION = '0.19.1'
const LAST_WITHOUT = [0, 19, 0]

export function serverVersionOK(version: string | undefined): boolean {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(-(\d+)-g[0-9a-f]+)?/.exec(version ?? '')
  if (!m) return !/^v?\d/.test(version ?? '')
  const v = [Number(m[1]), Number(m[2]), Number(m[3])]
  const min = MIN_SERVER_VERSION.split('.').map(Number)
  const cmp = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
  if (cmp(v, min) >= 0) return true
  return m[4] !== undefined && cmp(v, LAST_WITHOUT) >= 0
}
