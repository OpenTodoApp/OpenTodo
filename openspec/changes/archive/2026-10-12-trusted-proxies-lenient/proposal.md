# Lenient OPENTODO_TRUSTED_PROXIES

## Why

An invalid `OPENTODO_TRUSTED_PROXIES` value stops the server at startup. On the public demo, a typo (`cloudflar`) made the new container fail its health check, Coolify rolled the deploy back, and the cause was only visible in the container log. A typo in an optional, advisory setting should not take an instance down, and the owner should learn about it without reading logs.

## What Changes

- `OPENTODO_TRUSTED_PROXIES` is parsed leniently: entries are separated by commas and/or whitespace; each is the keyword `cloudflare` (any case), an IP address or a CIDR prefix. Anything else is ignored, the valid entries still apply, and the server starts.
- A near miss of `cloudflare` (edit distance 2 or less) gets a `did you mean "cloudflare"?` hint.
- Ignoring an entry only ever trusts fewer hops (fail-safe). With every entry invalid, behaviour equals an unset variable.
- Startup logs one `slog.Error` line naming the invalid entries, the hint, what is accepted and what was applied.
- `GET /api/v1/me` gains an additive `config_warnings` array for the owner's own session (never for admins, members or API tokens). The web app shows it as a notice at the top of the Settings overview and of Settings → Administration, naming the ignored value and how to fix it. The field and the notice are generic, for future configuration warnings.
- The health check is unaffected. No other variable changes behaviour: every other invalid value still stops startup.
- Docs: `docs/self-hosting/docker.md` and `docs/self-hosting/coolify.md` troubleshooting; CHANGELOG.

## Out of scope

- Making other variables lenient. They keep stopping startup on invalid values; a security-relevant setting (sign-up, base URL, OIDC) failing loudly is still the right default.
- Live reload of the variable; fixing it still needs a restart.
- Notifying the owner through push or the in-app inbox.

ROADMAP: advances self-hosting robustness (easy deployment on Coolify). No ROADMAP item names this change.

## Impact

- Code: `internal/config` (parser, `Warning`, `LogWarnings`), `cmd/opentodo/main.go`, `internal/httpapi/server.go` (`/me`), `web/src/app/ConfigWarnings.tsx`, `web/src/app/SettingsView.tsx`, `web/src/lib/api.ts`, `web/src/lib/types.ts`.
- No new route, dependency, environment variable or op-log change. Not **BREAKING**: a value that used to stop startup now starts the server with fewer trusted proxies.
- Spec: `self-hosting` modifies "Optional configuration only" and adds "Lenient trusted proxies" and "Owner sees configuration warnings".
