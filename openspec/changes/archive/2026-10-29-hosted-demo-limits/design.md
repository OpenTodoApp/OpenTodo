# Design: hosted-demo-limits

## D1. The host's request limit is per tenant and client

`Host.ServeHTTP` runs before any tenant's authentication, so it cannot tell a user from an outsider. Keying the window by `tenant + " " + httpapi.ClientKey(r)` gives each client address its own budget of `requests_per_minute` on each tenant. `ClientKey` is the address every server limiter uses (`clientIP`, trusted proxies, IPv6 `/64`). `httpapi.ConfigureClientIdentity(cfg)` installs the operator's trusted proxies in `host.Open`, because the first request is counted before any tenant (and so `httpapi.New`) exists.

Rejected: a separate anonymous budget. The host would have to judge a session cookie or token before the tenant opens, and an outsider can send a made-up cookie. Also rejected: keeping a tenant-wide ceiling next to the per-client one; any ceiling an outsider can reach brings back the lockout. Load per tenant stays bounded by the other limits (ops per hour, storage, open tenants).

## D2. At the demo's cap, the oldest sandbox gives way

`makeRoom` first deletes the least recently active sandbox idle for `EvictAfter` (as before). When there is none, it deletes the oldest sandbox created more than `EvictAfter` ago. A newcomer is refused only while every sandbox is younger than 15 minutes, so holding the cap means creating the whole cap every 15 minutes, which the rates below forbid. A real visitor can lose a sandbox after 15 minutes when the demo is full and no other sandbox is idle; that is the price of a fair share and the same experience as the existing expiry.

## D3. Creation limits

- The per-address limit (5 per hour) keys IPv6 by `/48` (`demoAddrKey`); IPv4 stays per address.
- A global creation rate of `GlobalPerHourFactor` (2) times the live cap per hour, counted in memory under `createMu` because evicted sandboxes leave no row. Over it: 503 `demo_busy`. In a rolling update two processes may each allow the rate; that bound is good enough for a showroom.

## Data model

None.

## Size and memory

No dependency. At most `2 × maxSandboxes` timestamps in memory (1,000 by default).
