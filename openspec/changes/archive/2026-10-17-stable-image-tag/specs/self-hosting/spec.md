## ADDED Requirements

### Requirement: Stable image tag
Every release that is not a pre-release SHALL also publish the image as `ghcr.io/pixari/opentodo:stable`, pointing at the same image as its version tags. Pre-releases SHALL NOT move `stable`. A manual workflow SHALL point `stable` at an already published version without rebuilding it.

#### Scenario: A release moves stable
- **WHEN** the tag `v0.7.0` is pushed and the release job succeeds
- **THEN** `stable`, `0.7` and `0.7.0` resolve to the same image digest

#### Scenario: A release candidate does not
- **WHEN** the tag `v0.8.0-rc.1` is pushed
- **THEN** `stable` still resolves to the previous release

#### Scenario: Roll back
- **WHEN** the maintainer runs the promote workflow with version `0.7.0` after `0.7.1` was released
- **THEN** `stable` resolves to the `0.7.0` image and no image is rebuilt

## MODIFIED Requirements

### Requirement: Coolify one-click service template
The repository SHALL include a Coolify one-click service template, with an upstream-ready copy, that follows Coolify's template conventions: the `stable` image, domain on port 8080 passed as `OPENTODO_BASE_URL` unless the operator sets one, a named volume on `/data`, a `/opentodo healthcheck` health check, no required variable, and the useful optional `OPENTODO_*` variables referenced with defaults so Coolify's environment tab reaches the container.

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
- **WHEN** a new release is published, which moves the `stable` tag the template names, and the operator clicks Deploy
- **THEN** Coolify pulls the new image without any change to the compose file, the new server applies its migrations to the existing volume on start, and all accounts, tasks and settings are still present

#### Scenario: Behind Cloudflare's proxy
- **WHEN** the domain is proxied through Cloudflare and the operator sets `OPENTODO_TRUSTED_PROXIES=cloudflare` in the environment tab
- **THEN** the variable reaches the container, and rate limits and the audit log use the visitor's address from `CF-Connecting-IP` instead of a Cloudflare edge address

#### Scenario: Data survives redeploys
- **WHEN** the service is redeployed or restarted
- **THEN** the same `/data` volume is mounted and no data is lost

### Requirement: Template conformance check
An automated check run by `make check` SHALL fail when any platform template breaks its platform's conventions or the shared deployment facts, when its image is not `ghcr.io/pixari/opentodo:stable`, when it names an `OPENTODO_*` variable the server does not read, when an upstream copy differs from its template, or when the release job no longer publishes the `stable` tag.

#### Scenario: Template drifts from the release or the server
- **WHEN** a template's image tag is not `stable`, the health check or the `/data` volume is missing, a `build:` key appears, or it names an `OPENTODO_*` variable the server does not read
- **THEN** `make check` fails and names the problem

#### Scenario: A release bumps every template
- **WHEN** a release is prepared and every template names `stable`
- **THEN** `make check` passes without any template change, and the release reaches every template through the `stable` tag

#### Scenario: The release stops publishing stable
- **WHEN** the `stable` tag is removed from the image job's tags in the CI workflow
- **THEN** `make check` fails and says the templates name a tag that is no longer published

### Requirement: Unraid Community Applications template
The repository SHALL include an Unraid Community Applications template, published to a separate template repository from an identical checked copy, for the `stable` image, with the web port 8080, an appdata path on `/data`, the Web UI link, icon and overview, and the essential optional variables with descriptions. No variable SHALL be required.

#### Scenario: Install from the template
- **WHEN** an Unraid user adds the container from the template and changes nothing
- **THEN** the container starts healthy, the Web UI link opens the app on the host's address, the first visitor creates the owner, and tasks added there are saved on the server

#### Scenario: Data survives an update
- **WHEN** a new release is published and the user applies the update Unraid offers
- **THEN** the same appdata path is mounted, migrations run on start, and all accounts and tasks are still present
