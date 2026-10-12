# Design: lenient OPENTODO_TRUSTED_PROXIES

## D1 Parsing

`config.ParseTrustedProxies(raw) TrustedProxies` never fails. It splits on commas and Unicode whitespace (`strings.FieldsFunc`), so `cloudflare, 192.0.2.0/24`, `cloudflare 192.0.2.0/24` and a value wrapped over lines all work. Each entry is:

- `cloudflare`, compared case-insensitively; expands to the embedded Cloudflare ranges once, however often it appears;
- a CIDR prefix when it contains `/` (`netip.ParsePrefix`, masked);
- otherwise an IP address (`netip.ParseAddr`, unmapped). An address with a zone (`fe80::1%eth0`) is invalid: a zoned address cannot form a prefix and used to be accepted silently as an invalid prefix that matched nothing.

Anything else goes to `Invalid`. The result also records `Applied` (valid entries as written, for the log) and `Hint`.

## D2 Near-miss hint

If any invalid entry, lowercased, is within Levenshtein distance 2 of `cloudflare`, the hint is `did you mean "cloudflare"?`. Distance 2 covers one transposition (`cluodflare`), a dropped or added letter (`cloudflar`, `cloudflares`) and two slips, while short unrelated words (`cdn`, `cloud`) stay far away. The distance function is a dozen lines in `proxies.go`; no dependency.

## D3 Security: fail-safe

Trusted proxies are hops the client-address logic skips. Dropping an entry only shrinks that set, so the client address becomes a nearer hop, never a farther (more forgeable) one. A misspelt keyword also never turns on `CF-Connecting-IP`. With every entry invalid, the result equals an unset variable: only the nearest hop counts. Rate limits then group visitors behind a CDN under the CDN's edge address, which is the same degraded but safe state as before the variable was set, and the owner is told.

## D4 Startup log

`config.Load` records a `config.Warning` in `Config.Warnings`. `main` calls `cfg.LogWarnings(log)` right after creating the logger (config loads before the logger exists). One line per warning:

```
level=ERROR msg="OPENTODO_TRUSTED_PROXIES: invalid entries ignored" invalid=cloudflar hint="did you mean \"cloudflare\"?" accepted="IP addresses, CIDR prefixes (such as 192.0.2.0/24) and the keyword \"cloudflare\", separated by commas or spaces" applied="none (only the nearest proxy is trusted, as when unset)"
```

## D5 Owner warning

`config.Warning` is `{variable, message, ignored?}` and is generic: a future lenient setting adds a warning the same way and the UI needs no change.

Where: `GET /api/v1/me`, which already describes the caller and its credential. It gains `config_warnings` only when the caller is the owner **and** authenticated with a session. Admins (who see Administration), members and every API token (even the owner's, so agents and scripts never read server configuration) get no field. For the owner the field is always an array, empty when there is nothing to report, so the client can tell "nothing" from an older server. `/api/v1/auth/status` was not used: it is a public route, and the warning is not needed before sign-in.

The message names the ignored values, the hint, what is accepted, what is still applied (or that behaviour equals unset) and that the fix is to correct the environment and restart. It contains only the operator's own value, never secrets.

UI: `ConfigWarningsNotice` (`web/src/app/ConfigWarnings.tsx`) fetches `/me` for the owner on mount and renders an amber section with a heading, one line per warning and "Only you, the owner, see this." It sits at the top of the Settings overview (under the profile line) and at the top of Settings → Administration. It renders nothing for other roles, without warnings, offline or on older servers. It is self-contained: two lines in `SettingsView.tsx`.

## D6 Unchanged

- `/healthz` and the `healthcheck` command do not look at warnings.
- Every other variable keeps stopping startup on an invalid value; the "Optional configuration only" requirement names this one exception.
- `clientIP` logic is unchanged; for a valid value the result is identical.

## Data model, size

No schema, op or migration change. No dependency. Binary: a few hundred bytes. Web bundle: one small component in the Settings chunk (under 1 KB minified).
