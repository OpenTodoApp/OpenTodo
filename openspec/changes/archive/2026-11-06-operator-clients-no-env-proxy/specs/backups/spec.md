## ADDED Requirements

### Requirement: Destination connections stay with the destination

Requests to an S3 or WebDAV destination SHALL connect directly and SHALL NOT use a proxy from the `HTTP_PROXY` or `HTTPS_PROXY` environment variables. A destination's redirect SHALL be followed at most 3 times and only to the scheme and host (with port) of the configured destination; a redirect anywhere else SHALL fail the request with `cross_host_redirect` before any request is sent to the other host. Private and local network destinations stay allowed, because only the operator configures them. Backups are server-side and create no ops, so offline behaviour and convergence are unaffected.

#### Scenario: Proxy variables are ignored

- **WHEN** the server runs with `HTTPS_PROXY` set and a backup runs to a configured destination
- **THEN** the request goes directly to the destination and never to the proxy

#### Scenario: Redirect within the destination

- **WHEN** a WebDAV destination answers a request with a redirect to another path on the same scheme and host
- **THEN** the request follows it and the run continues

#### Scenario: Redirect to another host

- **WHEN** a destination answers with a redirect to another host, or from https to http
- **THEN** the run fails with `cross_host_redirect`, and the other host receives no request
