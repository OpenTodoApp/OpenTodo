# Tasks

## 1. Server

- [x] 1.1 `davRedirect` builds the well-known redirect from `publicOrigin`; verify `TestDavDisabledIs404` (Location is the test server's absolute `/dav/`), `TestDavRootDiscovery` (forwarded host and scheme) and `TestDavWellKnownUsesBaseURL` (`OPENTODO_BASE_URL` wins) in `go test ./internal/httpapi/...` — done
- [x] 1.2 `handleDAVRoot` on `PROPFIND /{$}`, `OPTIONS /{$}`, `/principals` and `/principals/`: redirect, capabilities, 405 and 404 while disabled; verify `TestDavRootDiscovery` — done
- [x] 1.3 Demo deny list refuses the root probes and `/principals`; verify `TestDemoDenyListMatchesPolicy` — done

## 2. Documentation

- [x] 2.1 `docs/caldav.md` Discovery bullet names the absolute redirect and the root probes; `CHANGELOG.md` Fixed entry — done
