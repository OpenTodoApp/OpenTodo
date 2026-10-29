## MODIFIED Requirements

### Requirement: Client address from trusted proxies only
The server SHALL believe `X-Forwarded-For`, `X-Forwarded-Host`, `X-Forwarded-Proto` and `CF-Connecting-IP` only from a trusted proxy peer: loopback, private and link-local networks when `OPENTODO_TRUSTED_PROXIES` is unset, otherwise the configured list. From any other peer, the peer is the client. From a trusted peer, the client SHALL be the nearest untrusted `X-Forwarded-For` hop read from the right (or `CF-Connecting-IP` at a trusted Cloudflare edge hop); when every hop is trusted, the client SHALL be the last `X-Forwarded-For` entry, the one the nearest proxy appended, never an earlier entry the client could write. Every limit and the audit log use it. The first request from a trusted peer other than loopback that carries no `X-Forwarded-For` SHALL log one warning per process saying that every client behind that address shares it.

#### Scenario: Direct client forges the header
- **WHEN** a client on a public address connects directly and sends `X-Forwarded-For: 192.168.1.5`
- **THEN** the client is its own public address

#### Scenario: Local reverse proxy
- **WHEN** the variable is unset and a proxy on a container network (`172.18.0.3`) forwards a request with `X-Forwarded-For: 6.6.6.6, 203.0.113.4`
- **THEN** the client is `203.0.113.4`

#### Scenario: Every hop trusted
- **WHEN** the variable is unset and a proxy on a container network forwards a request with `X-Forwarded-For: 127.0.0.1, 192.168.1.20`
- **THEN** the client is `192.168.1.20`

#### Scenario: Forwarder that adds no header
- **WHEN** the variable is unset and requests arrive from `172.17.0.1` without `X-Forwarded-For`
- **THEN** the client is `172.17.0.1` and the log has one warning naming that address

#### Scenario: Cloudflare edge vouches for the client
- **WHEN** the value is `cloudflare` and a local proxy forwards a request whose nearest hop is a Cloudflare edge with `CF-Connecting-IP: 198.51.100.9`
- **THEN** the client is `198.51.100.9`

#### Scenario: Configured list replaces the default
- **WHEN** the variable is `192.0.2.0/24` and a request comes from `10.0.0.2` with `X-Forwarded-For: 203.0.113.4`
- **THEN** the client is `10.0.0.2`
