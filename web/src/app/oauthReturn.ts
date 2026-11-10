// The OAuth authorize return (OpenSpec change mcp-oauth, design D5): a client sends
// the browser to /oauth/authorize, or the OpenTodo app to /app/sign-in
// (native-app-foundation D5), which need a session and therefore send a
// signed-out browser here with the address to come back to. Read once, before the
// router touches the URL, and followed only when it is one of these two addresses
// of this server — anything else is dropped.
import { useEffect, useState } from 'react'

/** After sign-in, returns the browser to `/oauth/authorize` or `/app/sign-in` when the app was opened with `?oauth=`. */
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
    if (authorize.origin === window.location.origin && (authorize.pathname === '/oauth/authorize' || authorize.pathname === '/app/sign-in')) {
      window.location.assign(authorize.toString())
    }
  }, [ready, next])
}
