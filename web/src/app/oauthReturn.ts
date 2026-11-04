// The OAuth authorize return (OpenSpec change mcp-oauth, design D5): a client sends
// the browser to /oauth/authorize, which needs a session and therefore sends a
// signed-out browser here with the address to come back to. Read once, before the
// router touches the URL, and followed only when it is this server's own authorize
// address — anything else is dropped.
import { useEffect, useState } from 'react'

/** After sign-in, returns the browser to `/oauth/authorize` when the app was opened with `?oauth=`. */
export function useOauthAuthorizeReturn(ready: boolean): void {
  const [next] = useState(() => new URLSearchParams(window.location.search).get('oauth'))
  useEffect(() => {
    if (!ready || !next) return
    let authorize: URL
    try {
      authorize = new URL(next, window.location.origin)
    } catch {
      return
    }
    const here = new URL(window.location.href)
    here.searchParams.delete('oauth')
    window.history.replaceState({}, '', here.pathname + here.search + here.hash)
    if (authorize.origin === window.location.origin && authorize.pathname === '/oauth/authorize') {
      window.location.assign(authorize.toString())
    }
  }, [ready, next])
}
