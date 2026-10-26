# Design: private-network-reach

## Context

`internal/outbound.Dialer` resolves a host, filters the addresses through `IsDenied` and dials the checked address. One boolean, `AllowPrivate`, skipped the filter entirely. The map proxy set it to `true` unconditionally, and every member-created target (webhooks, channels, calendar subscriptions, issue connections, calendar sync) follows the owner's webhook switch.

## Decisions

### D1. The map proxy allows private addresses per host

`Dialer.AllowPrivateHost(ctx, host)` is a new optional hook: private addresses are allowed for that host name only. The map proxy passes `Server.mapsPrivateHost`, which answers true for the host names of the effective tiles and geocoder URLs (case-insensitive), and false on a hosted tenant. So:

- a self-hosted owner's Photon or tile server on the LAN keeps working;
- a URL from the provider's style (tiles, glyphs, sprite, TileJSON) on another host, or a redirect to another host, goes through the normal deny list;
- a hosted tenant reaches no private address. Adding maps to `hostRules` instead would have taken the provider choice from tenants for no gain.

Rejected: an owner-maintained allow-list. Larger UI and settings change; the per-host rule covers the documented setups.

### D2. Some addresses are never reachable

`IsAlwaysDenied` covers unspecified and `0.0.0.0/8`, IPv4 and IPv6 link-local (which holds `169.254.169.254`), `fd00:ec2::254` and `100.100.100.200`, also when carried in NAT64, IPv4-compatible or 6to4 addresses. The dialer refuses them even when `AllowPrivate` or `AllowPrivateHost` is true. No documented receiver lives there.

Loopback stays reachable under the switch, against the audit's suggestion: the switch is documented as including this machine, receivers such as Home Assistant at `localhost:8123` on a bare-metal install depend on it, and in the container image loopback is OpenTodo itself. The owner's switch remains the consent.

### D3. Hand-started sends are limited

`POST /webhooks/{id}/test` and `/deliveries/{did}/redeliver` share a per-user limiter of 30 per hour, checked before the lookup (429 `rate_limited`). Scheduled deliveries are not affected.

## Data model

None. No migration, no op field.

## Size and memory

No dependency. One more rate limiter map.
