# Spec Delta

## ADDED Requirements

### Requirement: Coolify one-click service template
The repository SHALL include a Coolify one-click service template, with an upstream-ready copy, that follows Coolify's template conventions: pinned release image, domain on port 8080 passed as `OPENTODO_BASE_URL` unless the operator sets one, a named volume on `/data`, a `/opentodo healthcheck` health check, no required variable, and the useful optional `OPENTODO_*` variables referenced with defaults so Coolify's environment tab reaches the container.

#### Scenario: Fresh deploy creates the owner on first visit
- **WHEN** an operator deploys the template in Coolify with a domain and sets no variable
- **THEN** the container becomes healthy, the app answers on the domain over https, and the first visitor gets the owner setup screen, while later visitors cannot register because sign-up is closed

#### Scenario: Domain assigned, passkeys and cookies work
- **WHEN** the service's domain is `https://todo.example.com`
- **THEN** the server runs with `OPENTODO_BASE_URL=https://todo.example.com`, sets `Secure` session cookies, accepts same-origin writes from that host, and offers passkeys for that host

#### Scenario: Operator overrides the URL
- **WHEN** the service has two domains and the operator sets `OPENTODO_BASE_URL` to the second one in the environment tab
- **THEN** the server uses the operator's value instead of the first domain Coolify generated

#### Scenario: Upgrade by changing the tag
- **WHEN** a new release line is published and the template's image tag is changed to it (for example `0.2` to `0.3`) and the operator clicks Deploy
- **THEN** Coolify pulls the new image, the new server applies its migrations to the existing volume on start, and all accounts, tasks and settings are still present

#### Scenario: Behind Cloudflare's proxy
- **WHEN** the domain is proxied through Cloudflare and the operator sets `OPENTODO_TRUSTED_PROXIES=cloudflare` in the environment tab
- **THEN** the variable reaches the container, and rate limits and the audit log use the visitor's address from `CF-Connecting-IP` instead of a Cloudflare edge address

#### Scenario: Data survives redeploys
- **WHEN** the service is redeployed or restarted
- **THEN** the same `/data` volume is mounted and no data is lost

### Requirement: Template conformance check
An automated check run by `make check` SHALL fail when the Coolify template breaks Coolify's conventions, when its image tag does not match the latest release in the changelog, when it names an `OPENTODO_*` variable the server does not read, or when the upstream copy differs from it.

#### Scenario: Template drifts from the release or the server
- **WHEN** the template's image tag differs from the latest release line in `CHANGELOG.md`, the health check or the `/data` volume is missing, a `build:` key appears, or it names an `OPENTODO_*` variable the server does not read
- **THEN** `make check` fails and names the problem

### Requirement: Build version from source
An image built from source without an explicit version SHALL report a version that identifies the commit whenever the build receives Coolify's `SOURCE_COMMIT` build argument, and SHALL report `dev` otherwise. Release builds SHALL keep reporting the release version.

#### Scenario: Coolify build with the source commit available
- **WHEN** Coolify builds the Dockerfile with `SOURCE_COMMIT=0123456789abcdef` and no `VERSION`
- **THEN** `opentodo version` and `/healthz` report `dev+0123456`

#### Scenario: Release build
- **WHEN** the image is built with `VERSION=0.2.1`
- **THEN** it reports `0.2.1` whatever `SOURCE_COMMIT` is
