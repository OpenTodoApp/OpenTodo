# self-hosting Specification

## Purpose
Defines the deployment contract: one small container, one data directory, configuration through optional environment variables, health reporting, how configuration problems are reported, security headers and compatibility with Coolify and plain Docker Compose.

## Requirements

### Requirement: Single container, single binary
The server SHALL ship as one container image containing one statically linked binary that serves both the API and the web app. The image SHALL run as a non-root user, SHALL contain no shell or package manager, and the compressed image SHALL stay under 50 MB.

#### Scenario: Run with no arguments
- **WHEN** the container starts with no configuration
- **THEN** it listens on port 8080 and serves the app and API on the same origin

### Requirement: One data directory
All persistent state SHALL live under the configured data directory (`/data` in the image). Backing up that directory SHALL be sufficient to restore everything.

#### Scenario: Restore from a copy
- **WHEN** the data directory is copied to a new host and the container is started there
- **THEN** all accounts, projects, tasks and tokens are available

### Requirement: Schema migrations
The server SHALL apply embedded database migrations automatically at startup and SHALL refuse to start if a migration fails.

#### Scenario: Upgrade
- **WHEN** a newer image starts against a data directory from an older version
- **THEN** pending migrations run before the server accepts requests

### Requirement: Optional configuration only
Every setting SHALL be an `OPENTODO_*` environment variable with a working default: `ADDR`, `DATA_DIR`, `BASE_URL`, `ALLOW_SIGNUP`, `SESSION_DAYS`, `LOG_LEVEL`. Invalid values SHALL stop startup with a clear message, except `OPENTODO_TRUSTED_PROXIES`, whose invalid entries are ignored with a warning (requirement "Lenient trusted proxies").

#### Scenario: Invalid value
- **WHEN** `OPENTODO_SESSION_DAYS=abc` is set
- **THEN** the process exits non-zero with a message naming the variable

### Requirement: Outgoing email from the environment
Outgoing email SHALL be configured by the optional `OPENTODO_SMTP_HOST`, `_SECURITY`, `_USER`, `_PASSWORD` (or `_PASSWORD_FILE`) and `_FROM`; `HOST` and `FROM` are required together, `USER` and a password together, and each one set locks its field in Settings.

#### Scenario: Partial SMTP configuration
- **WHEN** `OPENTODO_SMTP_HOST` is set without `OPENTODO_SMTP_FROM`, or `OPENTODO_SMTP_USER` without a password
- **THEN** the process exits non-zero with a message naming the missing variable

#### Scenario: SMTP from the environment only
- **WHEN** `OPENTODO_SMTP_HOST=smtp.example.com:587` and `OPENTODO_SMTP_FROM=todo@example.com` are set and nothing was stored in Settings
- **THEN** outgoing email is configured with STARTTLS, the authentication status reports it enabled, and the Outgoing email panel shows both fields as managed by the environment

#### Scenario: Password from a file
- **WHEN** `OPENTODO_SMTP_PASSWORD_FILE` names a readable file
- **THEN** its content without the trailing line break is the password and it never appears in the process environment listing of a child or in logs

### Requirement: Health check
The binary SHALL offer a `healthcheck` subcommand that exits 0 only when the local server answers `/healthz` with 200, so container platforms without curl can probe it.

#### Scenario: Container health
- **WHEN** the orchestrator runs the configured health check
- **THEN** it succeeds while the server is up and fails when the database is unavailable

### Requirement: Coolify-compatible compose file
The repository SHALL include a `docker-compose.yml` that Coolify can deploy from the repository URL with no manual variables: it SHALL declare the magic domain variable for the service port, pass the generated public URL as `OPENTODO_BASE_URL`, mount a named volume on `/data`, and define a health check. The same file SHALL work with plain `docker compose up`.

#### Scenario: Deploy on Coolify
- **WHEN** the repository is added as a Docker Compose resource in Coolify and deployed
- **THEN** the app is reachable on the assigned HTTPS domain and the owner setup screen appears

### Requirement: Security headers
Responses SHALL carry a Content-Security-Policy restricting scripts, connections and frames to the app's own origin, plus `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` and a same-origin referrer policy.

#### Scenario: Headers present
- **WHEN** the app shell is requested
- **THEN** the response includes the Content-Security-Policy with `script-src 'self'` and `frame-ancestors 'none'`

### Requirement: No telemetry
The server and client SHALL make no network requests to third parties and SHALL collect no usage data. The only outbound requests the server makes SHALL be to destinations the owner or a user explicitly configured (such as a backup destination or a webhook endpoint), and none of them SHALL carry usage data beyond the configured payload.

#### Scenario: Network audit
- **WHEN** the app is used for a session with the network inspected and no integration is configured
- **THEN** every request goes to the server's own origin

#### Scenario: Only configured destinations
- **WHEN** the owner has configured a backup destination and the server's outbound traffic is inspected
- **THEN** every outbound request goes to that destination and to nothing else

### Requirement: Optional demo mode
The server SHALL accept an optional `OPENTODO_DEMO` variable, off when unset. `true` SHALL turn the instance into a public demo (OpenSpec `demo-mode`); an invalid value SHALL stop startup with a message naming the variable. Demo mode SHALL need no other variable and SHALL be meant for a dedicated data directory.

#### Scenario: Unset
- **WHEN** the server starts without `OPENTODO_DEMO`
- **THEN** it behaves exactly as before and the owner setup screen appears on an empty data directory

#### Scenario: Invalid value
- **WHEN** `OPENTODO_DEMO=sometimes` is set
- **THEN** the process exits non-zero with a message naming `OPENTODO_DEMO`

### Requirement: Rolling updates
A new server process SHALL start and serve on a data directory that an older process still serves, so orchestrators can replace a container without downtime. Background jobs (reminder push, webhook deliveries, backups, email polling, Trash retention, audit pruning, demo reset) SHALL run in only one process at a time and SHALL move to the new process when the old one stops. Maintenance commands SHALL still refuse while any server runs.

#### Scenario: Coolify rolling update
- **WHEN** a new container starts on the volume while the old one still runs
- **THEN** the new one passes its health check and serves requests, the old one keeps running the background jobs until it stops, and the new one then takes them over

#### Scenario: Restore while serving
- **WHEN** `opentodo restore` runs while any server process uses the data directory
- **THEN** it refuses and asks to stop the server first

#### Scenario: Leader crashes
- **WHEN** the process running the background jobs is killed
- **THEN** another running process starts them within a few seconds

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
An automated check run by `make check` SHALL fail when any platform template breaks its platform's conventions or the shared deployment facts, when its image does not follow its platform's image policy (by default `ghcr.io/pixari/opentodo:stable`), when it names an `OPENTODO_*` variable the server does not read, when an upstream copy differs from its template, or when the release job no longer publishes the `stable` tag.

#### Scenario: Template drifts from the release or the server
- **WHEN** a template's image breaks its platform's image policy, the health check or the `/data` volume is missing, a `build:` key appears, or it names an `OPENTODO_*` variable the server does not read
- **THEN** `make check` fails and names the problem

#### Scenario: A release bumps every template
- **WHEN** a release is prepared, templates with the `stable` policy name `stable`, and the pinned templates name the new version
- **THEN** `make check` passes, and the release reaches the `stable` templates through the tag and the pinned ones through their store's update

#### Scenario: The release stops publishing stable
- **WHEN** the `stable` tag is removed from the image job's tags in the CI workflow
- **THEN** `make check` fails and says the templates name a tag that is no longer published

### Requirement: Build version from source
An image built from source without an explicit version SHALL report a version that identifies the commit whenever the build receives Coolify's `SOURCE_COMMIT` build argument, and SHALL report `dev` otherwise. Release builds SHALL keep reporting the release version.

#### Scenario: Coolify build with the source commit available
- **WHEN** Coolify builds the Dockerfile with `SOURCE_COMMIT=0123456789abcdef` and no `VERSION`
- **THEN** `opentodo version` and `/healthz` report `dev+0123456`

#### Scenario: Release build
- **WHEN** the image is built with `VERSION=0.2.1`
- **THEN** it reports `0.2.1` whatever `SOURCE_COMMIT` is

### Requirement: Lenient trusted proxies
`OPENTODO_TRUSTED_PROXIES` SHALL accept entries separated by commas or whitespace, each `cloudflare` (any case), an IP or a CIDR. Invalid entries SHALL NOT stop startup or fail the health check: the server SHALL ignore them, apply the valid ones and log one error naming them, what is accepted and what applies, hinting `cloudflare` for a near miss. Ignoring SHALL never widen trust; with no valid entry it SHALL behave as unset.

#### Scenario: Typo in the keyword
- **WHEN** the server starts with `OPENTODO_TRUSTED_PROXIES=cloudflar`
- **THEN** it starts and passes its health check, logs an error naming `cloudflar` with a "did you mean cloudflare?" hint, and attributes requests exactly as with the variable unset

#### Scenario: Mixed valid and invalid entries
- **WHEN** the value is `nope, 192.0.2.0/24`
- **THEN** hops in `192.0.2.0/24` are skipped as trusted proxies and `nope` is ignored and logged

#### Scenario: Separators and case
- **WHEN** the value is `CloudFlare 192.0.2.1` with a space instead of a comma
- **THEN** both entries apply and nothing is logged

### Requirement: Owner sees configuration warnings
`GET /api/v1/me` SHALL carry a `config_warnings` array (variable, message, ignored values) for the owner's session only, empty without warnings. Admins, members and API tokens SHALL never receive it. The app SHALL show each warning to the owner at the top of the Settings overview and Settings → Administration, naming the ignored value and the fix. The data is server configuration, not synced; offline the notice is absent.

#### Scenario: Owner sees the typo
- **WHEN** an entry of `OPENTODO_TRUSTED_PROXIES` was ignored and the owner opens Settings
- **THEN** a notice names `OPENTODO_TRUSTED_PROXIES`, the ignored value and that the value must be corrected and the server restarted

#### Scenario: Others never see it
- **WHEN** an admin or member session, or any API token including the owner's, requests `GET /api/v1/me`
- **THEN** the response has no `config_warnings` and the app shows no notice

#### Scenario: Unauthenticated request
- **WHEN** `GET /api/v1/me` is requested without a session or token
- **THEN** the server answers 401 and reveals no warning

### Requirement: Protected first deploy on Coolify
The Coolify one-click template SHALL pass a Coolify-generated secret as `OPENTODO_SETUP_TOKEN`, so a freshly deployed public instance cannot be claimed by a visitor who does not have access to the Coolify project. Deployments that do not set the variable SHALL keep the first-visit owner setup.

#### Scenario: One-click deploy
- **WHEN** an operator deploys the template and a stranger opens the URL before the operator
- **THEN** the stranger sees the setup screen asking for a setup token and cannot create the owner

#### Scenario: Plain Docker
- **WHEN** the image runs without `OPENTODO_SETUP_TOKEN`
- **THEN** the first visitor creates the owner, as before

### Requirement: Host mode is optional
Host mode SHALL be enabled only by optional configuration (`OPENTODO_HOST_URL`, with its operator token). A server started without it SHALL behave as a single-tenant self-hosted server, with no host-mode routes and no operator listener, and no new variable SHALL become mandatory for it. Host mode SHALL refuse a data directory that holds a self-hosted server's database and SHALL NOT be combined with a demo instance.

#### Scenario: Plain container start
- **WHEN** the container starts with only a data volume, as documented today
- **THEN** it serves one tenant from that volume, with no host-mode routes and no operator interface

#### Scenario: Host mode without its token
- **WHEN** `OPENTODO_HOST_URL` is set without an operator token of the required length
- **THEN** the server refuses to start and names the missing variable

### Requirement: Shared deployment facts
The repository SHALL keep the facts every platform template must agree on in one file: image, container port, data directory, health check, and a catalogue of the optional `OPENTODO_*` variables a template may offer, each with its default and description, marking the ones every template must offer.

#### Scenario: A template drifts from the facts
- **WHEN** a platform template names another port, mounts something other than the data directory, offers a variable missing from the catalogue, or gives a catalogued variable a different default
- **THEN** `make check` fails and names the template and the problem

#### Scenario: A platform without a check
- **WHEN** a folder for a new platform is added under `deploy/` without its checker
- **THEN** `make check` fails and names the folder

### Requirement: Unraid Community Applications template
The repository SHALL include an Unraid Community Applications template, published to a separate template repository from an identical checked copy, for the `stable` image, with the web port 8080, an appdata path on `/data`, the Web UI link, icon and overview, and the essential optional variables with descriptions. No variable SHALL be required.

#### Scenario: Install from the template
- **WHEN** an Unraid user adds the container from the template and changes nothing
- **THEN** the container starts healthy, the Web UI link opens the app on the host's address, the first visitor creates the owner, and tasks added there are saved on the server

#### Scenario: Data survives an update
- **WHEN** a new release is published and the user applies the update Unraid offers
- **THEN** the same appdata path is mounted, migrations run on start, and all accounts and tasks are still present

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

### Requirement: Platform catalog templates
The repository SHALL include a template, in the platform's own format, for CasaOS, Umbrel, TrueNAS Community Edition, Runtipi, Dokploy, Easypanel, Portainer and Cosmos Cloud, each in `deploy/<platform>/` with a checker, a guide in `docs/self-hosting/` and, where a store repository receives it, an `upstream/` copy laid out as that repository expects. Each SHALL run the image with the shared deployment facts, closed sign-up and no required setting.

#### Scenario: Install from the platform's catalog
- **WHEN** a user installs OpenTodo from the template on its platform and opens it
- **THEN** the container becomes healthy and the first visitor gets the owner setup screen, while later visitors cannot register

#### Scenario: Data survives an update
- **WHEN** the app is updated or restarted through the platform
- **THEN** the same data folder is mounted and every account and task is still there

#### Scenario: Upstream copy drifts
- **WHEN** a file under `deploy/<platform>/upstream/` differs from the template it copies
- **THEN** `make check` fails and names the file

### Requirement: Image policy per platform
Each platform checker SHALL declare an image policy: `stable` (the image `ghcr.io/pixari/opentodo:stable`), `release` (the latest release in `CHANGELOG.md`) or `release-digest` (that release plus a `sha256` index digest). Templates SHALL use `stable` unless the platform's store rejects moving tags or offers updates only when a version changes.

#### Scenario: A release bumps the pinned templates
- **WHEN** a release is prepared and a template with the `release` or `release-digest` policy still names the previous version
- **THEN** `make check` fails and names that template, while templates with the `stable` policy need no change

#### Scenario: Digest refreshed after the release
- **WHEN** the release image is published and the maintainer runs `node scripts/deploy/pin.mjs`
- **THEN** every pinned digest under `deploy/` is replaced by the registry's multi-arch index digest for that version, and `--check` reports any that still differ
