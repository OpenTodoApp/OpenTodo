## ADDED Requirements

### Requirement: Forwarded host only from trusted proxies
The server SHALL honour `X-Forwarded-Host` and `X-Forwarded-Proto` only on a connection whose peer address is in `OPENTODO_TRUSTED_PROXIES`. Otherwise it SHALL use the request's `Host` and the connection's TLS state, both for links shown without a base URL (invite and reset links to copy, CalDAV address, calendar feeds, public links, MCP endpoint, OIDC redirect) and for the cookie origin check. A configured `OPENTODO_BASE_URL` always takes precedence.

#### Scenario: Untrusted peer
- **WHEN** no base URL is set and a client that is not a trusted proxy sends `X-Forwarded-Host: todo.example.com`
- **THEN** links use the request's `Host`, and an `Origin` of `https://todo.example.com` is not accepted on the strength of that header

#### Scenario: Trusted proxy
- **WHEN** no base URL is set, `OPENTODO_TRUSTED_PROXIES` contains the proxy's address, and the proxy sends `X-Forwarded-Host: todo.example.com` and `X-Forwarded-Proto: https`
- **THEN** links start with `https://todo.example.com`

### Requirement: Warning for email without a base URL
While outgoing email is enabled and `OPENTODO_BASE_URL` is unset, the owner's `config_warnings` SHALL include an entry for `OPENTODO_BASE_URL` saying that reset, verification and invitation emails are not sent until it is set. The entry SHALL disappear once a base URL is configured or email is turned off. The data is server configuration, not synced; offline the notice is absent.

#### Scenario: Owner configures SMTP on a LAN install
- **WHEN** the owner saves an SMTP configuration on a server without `OPENTODO_BASE_URL` and opens Settings
- **THEN** a configuration warning names `OPENTODO_BASE_URL` and the fix

#### Scenario: Not for others
- **WHEN** an admin, a member or an API token requests `GET /api/v1/me` on that server
- **THEN** the response carries no `config_warnings`
