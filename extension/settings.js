// The extension's settings and the decisions about them (OpenSpec change
// extension-v2, design D2; share-capture "Extension privacy with a token"). The
// server address and the mode live in storage.sync; the token only in
// storage.local, which the browser never synchronises. Pure helpers, tested with
// `node --test extension/settings.test.js`.

export const MODE_CAPTURE = 'capture'
export const MODE_QUICK = 'quick'

/** Whether a token may be sent to `server`: https, or plain http on this machine only. */
export function tokenAllowed(server) {
  try {
    const u = new URL(server)
    return u.protocol === 'https:' || (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1'))
  } catch {
    return false
  }
}

/**
 * What a token's scope allows: {save, parse, reason}. Quick save needs a full or
 * admin token; a read token can only parse; an agent token is refused, since it
 * writes only under the assistant switches.
 */
export function scopeDecision(scope) {
  switch (scope) {
    case 'full':
    case 'admin':
      return { save: true, parse: true, reason: '' }
    case 'read':
      return { save: false, parse: true, reason: 'tokenRead' }
    case 'agent':
      return { save: false, parse: false, reason: 'tokenAgent' }
    default:
      return { save: false, parse: false, reason: 'tokenRejected' }
  }
}

/**
 * The mode the popup works in from the stored settings: Quick save only with a
 * server, a token it may receive, and a scope that saves; else Capture screen.
 */
export function effectiveMode({ server, mode, token, scope } = {}) {
  if (mode !== MODE_QUICK || !server || !token || !tokenAllowed(server)) return MODE_CAPTURE
  return scopeDecision(scope).save ? MODE_QUICK : MODE_CAPTURE
}

/** Whether the popup may ask the parse route for chips (a read token parses too). */
export function canParse({ server, token, scope } = {}) {
  return !!server && !!token && tokenAllowed(server) && scopeDecision(scope).parse
}

/** The browser's extension API (Firefox `browser`, Chromium `chrome`). */
export const ext = globalThis.browser ?? globalThis.chrome

/** Read every setting: sync for server and mode; local for the token and its scope. */
export async function readSettings(api = ext) {
  const sync = await api.storage.sync.get(['server', 'mode'])
  const local = await api.storage.local.get(['token', 'scope', 'account'])
  return { server: sync.server ?? '', mode: sync.mode ?? MODE_CAPTURE, token: local.token ?? '', scope: local.scope ?? '', account: local.account ?? '' }
}
