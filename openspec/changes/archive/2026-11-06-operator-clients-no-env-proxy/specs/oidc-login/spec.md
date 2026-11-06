## ADDED Requirements

### Requirement: Provider connections go directly to the issuer

Requests to the configured provider (discovery, key set, code exchange) SHALL connect directly and SHALL NOT use a proxy from the `HTTP_PROXY` or `HTTPS_PROXY` environment variables, and SHALL NOT follow a redirect: a redirect answer is a failure of that step. Each request SHALL time out after 10 seconds. Sign-on creates no ops, so offline behaviour and convergence are unaffected.

#### Scenario: Proxy variables are ignored

- **WHEN** the server runs with `HTTPS_PROXY` set and someone signs in with the provider
- **THEN** the code exchange, with the client secret, goes directly to the issuer's token endpoint

#### Scenario: Provider redirects

- **WHEN** the token endpoint answers with a redirect to another host
- **THEN** the redirect is not followed, the other host receives nothing, and the sign-in fails with the generic `oidc_failed` indication
