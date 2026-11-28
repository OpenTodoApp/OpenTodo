# Allow HTTP for shared address space servers in the KMP app

## Why

The KMP app permits plain HTTP only for local server addresses, but its IPv4 allowlist omits the shared address space `100.64.0.0/10`, commonly used by Tailscale and carrier-grade NAT. People using a server reachable at such an address cannot connect from the first-run screen.

## What Changes

- The KMP server address validator accepts HTTP for IPv4 addresses from `100.64.0.0` through `100.127.255.255`, alongside its existing local ranges.
- Other public addresses still require HTTPS.

## Capabilities

### Modified Capabilities

- `native-shells`: HTTP is allowed for IPv4 addresses in `100.64.0.0/10`.

## Impact

Only KMP client-side URL validation changes. No server, data, dependency, or network policy changes.
