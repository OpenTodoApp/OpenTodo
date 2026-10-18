# Trusted client identity

## Why

A security audit (SEC-2, SEC-9, SEC-10, SEC-11, SEC-13) found that the server could be told who the client is:

- **Client address.** With `OPENTODO_TRUSTED_PROXIES` unset, the last `X-Forwarded-For` hop was believed from any peer, so a client that reached the container directly could pick its own address. Every per-address limit (sign-in, second step, re-authentication, CalDAV, public links, single sign-on, demo sandboxes) and the audit log's address depended on it. IPv6 clients were limited per /128, and nothing limited failures per account.
- **First run.** Without a setup token, whoever registered first became the owner, from anywhere. With a base URL set, the origin check still accepted `Origin` equal to `Host`, so a page on another name that resolves to a fresh LAN install (DNS rebinding) could claim it.
- **Limiters.** One per-address limiter was shared by sign-in, registration, invitation and reset links, public-link misses, MCP bad tokens and passkey sign-in, and sign-in counted successes. Expired keys were swept inside the hit lock once the table passed 10,000 keys, and `caldav.go` duplicated a limiter helper.
- **Transport.** Cookies were `Secure` only with an https base URL, and the server never sent `Strict-Transport-Security`.

## What Changes

- `X-Forwarded-For`, `X-Forwarded-Host`, `X-Forwarded-Proto` and `CF-Connecting-IP` are believed only when the connection's peer is a trusted proxy. Unset, `OPENTODO_TRUSTED_PROXIES` means loopback, private and link-local networks. A configured list replaces that default; the new keyword `private` names it, and `cloudflare` keeps it and adds Cloudflare's edges. A list without any local address gets a configuration warning.
- Every rate limiter keys IPv6 clients by their /64.
- New per-account failure limit: 10 failed passwords, second-factor codes or re-authentications within 15 minutes lock the account's password sign-in, second step and re-authentication for the rest of the window (429 `account_locked`, `Retry-After`). A successful sign-in clears it.
- One limiter per purpose (sign-in failures, registration, password reset, invitation links, public-link misses, MCP bad tokens, passkey sign-in), each 10 a minute per address. Sign-in counts failures only. Expired windows are swept by a background task once a minute; the duplicate helper is gone.
- Without a setup token, the first registration from a public address (resolved as above) needs a one-time setup code that the server generates at startup while no owner exists and prints once in its log at WARN. It is sent in the setup-token field, compared in constant time, rate limited with registration and discarded once the owner exists. `auth/status` reports `setupCodeRequired`; the web app reuses the setup-token field with its own wording in all shipped languages. Registration from loopback or a private network works as before.
- With `OPENTODO_BASE_URL` set, the origin check also requires the request to be addressed to the base URL's host.
- Cookies are `Secure` also when the request arrived over TLS or a trusted proxy says https. With an https base URL every response carries `Strict-Transport-Security: max-age=31536000` (no `includeSubDomains`, no preload).

**Behaviour change, not BREAKING** (no new mandatory variable, no op-log change):

- A reverse proxy on a public address now has to be listed in `OPENTODO_TRUSTED_PROXIES` (with `private` if a local proxy also connects). Proxies on loopback, private or container networks, and `OPENTODO_TRUSTED_PROXIES=cloudflare`, need nothing.
- A fresh server opened from a public address asks for the setup code from the log.
- Behind a base URL, the app must be opened at the base URL's host for writes.
- Ten wrong passwords lock that account's password sign-in for up to 15 minutes; someone who knows an email address can keep it locked (passkeys, single sign-on and existing sessions still work).

## Out of scope

- Sliding windows or exponential back-off; the windows stay fixed.
- Persisting limiter state or the setup code across restarts (a restart prints a new code).
- `includeSubDomains` or preload for HSTS.
- Advances ROADMAP items `account-access` and `self-hosting` (hardening of shipped features).
