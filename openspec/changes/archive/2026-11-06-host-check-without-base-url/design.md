# Design: host check without a base URL

## Context

`originAllowed` accepts a cookie or registration request whose `Origin` names the request's host. With `OPENTODO_BASE_URL` set it also requires that host to be the base URL's; without it, any host is accepted. DNS rebinding makes a page under a name someone controls resolve to the server's address, so `Origin` and `Host` agree and the check passes. Registration needs no cookie, so before the owner exists this is the one write such a page could make that matters: creating the owner.

## Decisions

### D1 — Classify the host, not the origin

Comparing `Origin` with `Host` cannot help: under rebinding they are the same name. What can be told apart is whether the name could be someone else's. A browser shows a page under an IP literal only when it connected to that address, and names without a dot or under suffixes public DNS never answers for (`.localhost`, `.local`, `.home.arpa`, `.internal`, `.test` are reserved; `.lan`, `.home`, `.corp` are not delegated) cannot be registered by another site. Every other name is "unverified". The host is `requestHost` (the `Host` header, or `X-Forwarded-Host` from a trusted proxy), the same one the origin check uses.

### D2 — Ask for the setup code, which already exists

Refusing outright would leave a hostname-only first visit (a reverse proxy without a base URL, a PaaS domain) with no way forward except changing configuration. The setup code is the existing mechanism with the right properties: printed once in the log, which only the operator reads, 80 bits, constant-time, rate limited, discarded once the owner exists. So while no base URL is set, the server generates it even with `OPENTODO_SETUP_CODE` off, and asks for it only under an unverified host. The person can enter it, open the server by IP once, or set `OPENTODO_BASE_URL`; the screen says all three.

`auth.SetupFrom{Local, UnverifiedHost}` replaces the `local bool` of `RegisterFrom`: `SetupCodeNeeded` is `token == "" && ((codeOn && !Local) || (hostCheck && UnverifiedHost))`. The loopback exemption of the code-on mode does not apply to an unverified host, since a browser on the server itself can be the one showing the rebound page.

### D3 — Off with a base URL

`services.Build` turns the host check on only when `cfg.Origin()` is empty. With a base URL, `originAllowed` already refuses a page under another host, and no code is generated for the check.

### D4 — No Settings warning

The threat model suggested also warning in Settings while no base URL is set. After setup, a rebound name has no session cookie (cookies belong to the real name), so it reaches only public routes, the same as any internet client. The warning would add a notice and six translations for little; it is left out.

## Risks / Trade-offs

- A first visit through `https://todo.example.com` on a reverse proxy without `OPENTODO_BASE_URL` now needs the code from the log. Every deploy template that knows its domain already sets the base URL; the docs and the start-up warning say what to do.
- A LAN that uses a real domain for internal names (`nas.home.example.com`) is treated as unverified; the code or the base URL is the answer.

## Data model, size

No data or op change. One boolean in the status response. No dependency; the first load gains one translated string.
