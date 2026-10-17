## Decisions

- **Warn only when the page is same-host.** The warning is logged when the refused request's `Origin` equals its own host, which is the misconfiguration case. A request whose `Origin` names another site is a real cross-site request and stays silent.
- **Bounded memory.** The warned hosts sit in a set capped at 32 entries; after that, nothing more is recorded or logged until restart.
- **Client hint from `passkeyDomain`.** `GET /api/v1/auth/status` already reports the base URL's host as `passkeyDomain`, so no new field is needed. When it is absent (no https base URL), the existing messages stay.
- **No redirect.** Redirecting browsers to the base URL would hide the misconfiguration and could loop when the proxy redirects back; the operator fixes the variable or the proxy.
