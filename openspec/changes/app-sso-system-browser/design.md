# Design: single sign-on in the system browser for the apps

## D1. The provider step leaves the web view; the session stays in it

The session cookie must end up in the app's web view, because the whole app (sync, IndexedDB, the bridge) lives there. The provider step must run in the system browser, because providers such as Google refuse embedded web views. So the flow is split: the sheet runs start, provider and callback; the web view redeems the result.

Rejected:
- *Sign in the sheet and copy the cookie into the web view.* `ASWebAuthenticationSession` never exposes the browser's cookies, and copying an `HttpOnly` session cookie across stores is exactly what the platform prevents.
- *Use the paused native app's sign-in (`/app/sign-in`, `app` tokens).* It ends in access and refresh tokens; the shells run the web app on a cookie session, and the consent screen it adds is pointless for a sign-in the person just started.
- *A user-agent change so Google accepts the web view.* Against Google's policy and fragile; other providers may follow Google.

## D2. A single-use code bound to the app's PKCE challenge

The callback of an app flow keeps the verified claims (and the raw ID token, the session's sign-out hint) under a 32-byte random code, valid for two minutes, taken once whatever the outcome, and bound to the S256 challenge the app sent to the start route (RFC 7636, as in RFC 8252 for native apps). Codes live in memory, like the consumed flow states: no table, no migration; a restart aborts a sign-in in flight and the person starts again. At most 1,000 wait at once (the start and callback routes are already rate limited per address), and at most three for one identity (issuer and subject). The callback cannot refuse an identity before the redeem, which may link it from a signed-in web view, so without that cap one account at the provider could fill the store and hold every app sign-in off for two minutes. A fourth sign-in of the same identity replaces its oldest waiting code, preferring one not yet confirmed, rather than being refused: a sheet closed without Cancel leaves its code behind, and three of those must not lock the person out.

`opentodo://sso` can be claimed by another app on Android, and any app or page can open it. A code intercepted that way is useless without the verifier, which never leaves the app; a code injected into the app fails the app's state check and, failing that, the verifier check, so a person can never be signed in to someone else's account or have someone else's identity linked.

## D3. Login or link is decided where the redeem happens

The sheet is not the app: Safari may well be signed in to the same server as someone else, or not at all. So the start route never links in an app flow, and the redeem route decides with the web view's own cookie: no session, sign in (the callback's code path, unchanged: provisioning, linking by verified email, the owner and accounts with a second factor refused, SSO-only mode); a session, link to that account under the existing freshness rule. The callback's two endings were factored out (`finishOIDCLogin`, `finishOIDCLink`) so both routes share them.

The redeem is a same-origin `fetch` from a page of the server, run by the app in its web view: the cookie store is the web view's, the server's usual cross-site check applies (`cookieWriteAllowed`), and the response's redirects end where the callback's would (`location.replace(r.url)`). A cross-site page could otherwise redeem its own code in someone's web view (signing it in to the wrong account, or linking a foreign identity), so the check is required even though the route is public.

## D4. Feature detection, not version numbers

`GET /api/v1/health` answers `"app_sso": true`. An app asks right before it opens the sheet; without the flag (an older server, a proxy in the way) it loads the start route in the web view as before. An older server would otherwise ignore the app's parameters and sign in the sheet, leaving the person stuck there.

## D5. Platform pieces without dependencies

iPhone: `ASWebAuthenticationSession` with the `opentodo` callback scheme (already the app's URL scheme; the session catches the callback before the app's link handler), not ephemeral, so the browser's provider session is reused. Android: a `VIEW` intent with the Custom Tabs session extra (`android.support.customtabs.extra.SESSION`), which every browser with Custom Tabs honours, so no AndroidX browser library; a browser without them opens a page, which works the same. The return is an intent filter for `opentodo://sso` on the single-task main activity; the pending verifier survives the process being killed while the browser is in front (saved instance state).

## D6. Accepted risk: another app running its own flow

A custom URL scheme gives no app identity. Another app on the phone can start its own flow with its own challenge, open the start route in a browser, catch `opentodo://sso` and redeem the code with its own verifier. The redeem route refuses what a browser declares cross-site, but a client that is not a browser sends no `Origin` and passes like any API client. The result is a session for that app, for whoever completes the provider step in the browser it opened. If the provider remembers the person, that step may need no input from them.

Verified links (Android App Links, iOS universal links) would tie the return to our app, but they need a file on the server's domain naming the app, signed with our key. That can't work for arbitrary self-hosted domains. So the callback of an app flow does not hand the code over silently. It shows a page in the browser naming the account ("Continue to the OpenTodo app as …?") with Continue and Cancel. The page holds only a single-use ticket: the code exists for the app only once the person taps Continue, which posts the ticket back to the server. A silent completion is what the attack relies on. With the page, an app that starts its own flow still needs the person's tap, on a page that shows a sign-in they did not start.

The page is rendered by the server, not the web app: it must work in the system browser before there is a session, with no script. Its policy is `default-src 'none'` (its one style by hash), `form-action 'self' opentodo:`, since the post's answer redirects to the app's scheme, and `frame-ancestors 'none'`. Its words follow the browser's language through the mail texts' choice (`mail.LangFrom`): English and German now, English for the rest, as mail does.

The page names the account (the provider's verified email, else the name it gives), but it cannot name the app that asked: the browser does not know which app opened it. A malicious app with its own "Sign in with …" button therefore still gets the tap, from a person who believes they are signing in to that app.

We accept the risk that remains, and that limit with it: it needs a malicious app installed on the phone, and that app gets only what the person confirms in the browser it opens.

## Data model and size

No op, table or setting. Two optional fields in the signed flow-state cookie (`ac`, `as`). No new dependency on any platform; the Android APK and the iOS app grow by a few kilobytes of code. Server memory: at most 1,000 pending codes of about 2 KB each, three per identity.

## Interface

No app screen changes: the existing "Sign in with …" button and Settings → Linked accounts start it; errors show through the sign-in screen's existing `?error=` codes. The browser shows one new page, the confirmation (D6).
