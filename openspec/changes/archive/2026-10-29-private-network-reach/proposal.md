# Narrow what the server can reach on its own network

## Why

An internal security audit found three ways the server could be made to send requests into the network it runs on:

- **Hosted tenants (High, hosted mode only).** The map proxy allowed private network targets for every address, because the provider is chosen by the owner. On a host the tenant's owner is not the operator, so a tenant could name a provider whose style points the server at the operator's private network or a cloud metadata service and read the answer back as a tile.
- **The map provider's style (Low).** On a self-hosted server the same allowance covered every address the provider's style hands out (tiles, fonts, sprites) and every redirect, so a compromised third-party provider, not the owner, could make the server fetch local addresses.
- **The "allow private network targets" switch (Low).** With it on, webhooks, notification channels, calendar subscriptions and issue connections, all created by any member, could also reach link-local and cloud metadata addresses and the host's "this network" address. Test sends and redeliveries had no limit.

## What Changes

- The map proxy allows a private network address only for the two hosts the owner typed (tile style and search). Addresses the provider's style or a redirect names go through the normal deny list. On a hosted tenant nothing on a private network is reachable through the map proxy.
- With private network targets allowed, unspecified and "this network" (`0.0.0.0/8`, `::`), link-local (`169.254.0.0/16`, `fe80::/10`) and the cloud metadata addresses (`169.254.169.254`, `fd00:ec2::254`, `100.100.100.200`), also when embedded in an IPv6 address, stay refused for every outbound feature. Loopback and the private ranges stay reachable once the owner allows them, as documented.
- Test sends and redeliveries of webhooks share a limit of 30 per user per hour (429 `rate_limited`).

Not **BREAKING**: no op change, no new route, no new environment variable. A webhook, channel, subscription or AI provider on a link-local address stops working; none is expected.

Out of scope: replacing the switch with an owner allow-list of hosts or ranges (a larger settings change), hiding delivery errors from members, and refusing loopback under the switch (it would break receivers on the same machine, such as Home Assistant at `localhost:8123`, and in the container image loopback is OpenTodo itself).

ROADMAP: hardening of shipped features (webhooks, task-locations, multi-tenant-host); no new item.

## Capabilities

### Modified Capabilities

- `webhooks`: "Private network protection" keeps link-local, unspecified and metadata addresses refused when private targets are allowed; new requirement for the hand-started send limit.
- `task-locations`: "Map proxy" says which hosts may be on a private network, and that a hosted tenant reaches none.

## Impact

- `internal/outbound` (`IsAlwaysDenied`, `Dialer.AllowPrivateHost`), `internal/httpapi/maps.go`, `internal/httpapi/webhooks.go`, `internal/httpapi/server.go`.
- Tests: `internal/outbound/outbound_test.go`, `internal/httpapi/maps_test.go`, `internal/httpapi/webhooks_test.go`.
- Docs: `docs/webhooks.md`, `docs/maps.md` (or the map section of self-hosting), CHANGELOG `### Security`.
