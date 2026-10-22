# Proposal

## Why

Adding an OpenTodo CalDAV account on macOS 15 and iOS fails with "Unable to verify account name or password" although the credentials work (issue #249). Apple's discovery follows `/.well-known/caldav`, whose redirect carries a relative `Location: /dav/`; the client loses the scheme and port, falls back to probing the host root and `/principals/` with `PROPFIND`, and the web app answers those with a bare 405 without `DAV` headers, so discovery ends there. The archived `caldav` change left the Apple client path unverified (task 5.1).

## What Changes

- The well-known redirect carries an absolute `Location`: the configured `OPENTODO_BASE_URL` or, without one, the origin the client asked for (scheme from TLS or a trusted proxy's `X-Forwarded-Proto`, host from `Host` or a trusted proxy's `X-Forwarded-Host`), the same rule as the CalDAV address Settings shows.
- `PROPFIND` on the host root redirects to `/dav/` the same way, `OPTIONS` on the root reports the `DAV` capabilities, and `/principals/…` redirects to the same path under `/dav/`, so a client that skips or mishandles the well-known address still finds the principal.
- While CalDAV is disabled nothing changes: the root keeps the web app's 405 for WebDAV methods and `/principals/` is 404, so the endpoint stays invisible. The demo instance refuses the new probes like every CalDAV path.
- No op, data or settings change. No new dependency.

Out of scope: serving the principal document directly at the root or at the well-known address; changes to the DAV responses themselves.

ROADMAP: hardens the shipped `caldav` item (Apple Reminders).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `caldav-sync`: "Discovery and calendar collections" (absolute redirect, root and `/principals/` probes); "Off by default, enabled by the owner" (the root and `/principals/` while disabled).

## Impact

- `internal/httpapi/caldav.go` (routes), `caldav_dav.go` (`davRedirect`, `handleDAVRoot`), `demo.go` (deny list), tests in `caldav_test.go` and `policy_test.go`.
- `docs/caldav.md` (Discovery), `CHANGELOG.md`.
