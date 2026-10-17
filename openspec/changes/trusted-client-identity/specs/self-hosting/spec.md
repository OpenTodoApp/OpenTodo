## ADDED Requirements

### Requirement: Client address from trusted proxies only
The server SHALL believe `X-Forwarded-For`, `X-Forwarded-Host`, `X-Forwarded-Proto` and `CF-Connecting-IP` only from a trusted proxy peer: loopback, private and link-local networks when `OPENTODO_TRUSTED_PROXIES` is unset, otherwise the configured list. From any other peer, the peer is the client. From a trusted peer, the client SHALL be the nearest untrusted `X-Forwarded-For` hop read from the right (or `CF-Connecting-IP` at a trusted Cloudflare edge hop). Every limit and the audit log use it.

#### Scenario: Direct client forges the header
- **WHEN** a client on a public address connects directly and sends `X-Forwarded-For: 192.168.1.5`
- **THEN** the client is its own public address

#### Scenario: Local reverse proxy
- **WHEN** the variable is unset and a proxy on a container network (`172.18.0.3`) forwards a request with `X-Forwarded-For: 6.6.6.6, 203.0.113.4`
- **THEN** the client is `203.0.113.4`

#### Scenario: Cloudflare edge vouches for the client
- **WHEN** the value is `cloudflare` and a local proxy forwards a request whose nearest hop is a Cloudflare edge with `CF-Connecting-IP: 198.51.100.9`
- **THEN** the client is `198.51.100.9`

#### Scenario: Configured list replaces the default
- **WHEN** the variable is `192.0.2.0/24` and a request comes from `10.0.0.2` with `X-Forwarded-For: 203.0.113.4`
- **THEN** the client is `10.0.0.2`

### Requirement: Warning for a list without a local proxy
When the valid entries of `OPENTODO_TRUSTED_PROXIES` name no loopback, private or link-local address, the server SHALL start normally, log one error line and add an owner configuration warning saying that a reverse proxy on the machine or a container network is no longer trusted and that `private` keeps it trusted.

#### Scenario: Public proxy only
- **WHEN** the value is `203.0.113.10`
- **THEN** the owner sees a warning for `OPENTODO_TRUSTED_PROXIES` that suggests adding `private`

#### Scenario: Keywords keep the default
- **WHEN** the value is `cloudflare` or `private, 203.0.113.10`
- **THEN** no such warning is shown

## MODIFIED Requirements

### Requirement: Security headers
Responses SHALL carry a Content-Security-Policy restricting scripts, connections and frames to the app's own origin, plus `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` and a same-origin referrer policy. When `OPENTODO_BASE_URL` is https, every response SHALL also carry `Strict-Transport-Security: max-age=31536000`, without `includeSubDomains` or `preload`; without an https base URL it SHALL NOT be sent.

#### Scenario: Headers present
- **WHEN** the app shell is requested
- **THEN** the response includes the Content-Security-Policy with `script-src 'self'` and `frame-ancestors 'none'`

#### Scenario: HSTS with an https base URL
- **WHEN** `OPENTODO_BASE_URL` is `https://todo.example.com` and any route is requested
- **THEN** the response has `Strict-Transport-Security: max-age=31536000`, and a server without a base URL sends no such header

### Requirement: Lenient trusted proxies
`OPENTODO_TRUSTED_PROXIES` SHALL accept entries separated by commas or whitespace, each `cloudflare` or `private` (any case), an IP or a CIDR. `private` SHALL stand for the default trusted ranges; `cloudflare` SHALL stand for Cloudflare's published edge ranges plus the default ranges. Invalid entries SHALL NOT stop startup or fail the health check: the server SHALL ignore them, apply the valid ones and log one error naming them, what is accepted and what applies, hinting `cloudflare` or `private` for a near miss. Ignoring SHALL never widen trust; with no valid entry it SHALL behave as unset.

#### Scenario: Typo in the keyword
- **WHEN** the server starts with `OPENTODO_TRUSTED_PROXIES=cloudflar`
- **THEN** it starts and passes its health check, logs an error naming `cloudflar` with a "did you mean cloudflare?" hint, and attributes requests exactly as with the variable unset

#### Scenario: Mixed valid and invalid entries
- **WHEN** the value is `nope, 192.0.2.0/24`
- **THEN** hops in `192.0.2.0/24` are skipped as trusted proxies and `nope` is ignored and logged

#### Scenario: Separators and case
- **WHEN** the value is `CloudFlare 192.0.2.1` with a space instead of a comma
- **THEN** both entries apply and nothing is logged
