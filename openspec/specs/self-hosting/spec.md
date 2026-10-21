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
The server SHALL apply embedded database migrations automatically at startup and SHALL refuse to start if a migration fails. It SHALL record the name of every applied migration file, and SHALL log an error naming any file numbered below an applied migration that was never applied, instead of skipping it silently. The repository checks SHALL fail a change that adds a migration not numbered above every migration on the main branch.

#### Scenario: Upgrade
- **WHEN** a newer image starts against a data directory from an older version
- **THEN** pending migrations run before the server accepts requests

#### Scenario: Migration merged below the current version
- **WHEN** the server starts with a migration file numbered below the database's version that was never applied
- **THEN** it logs an error naming that file

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
The repository SHALL include a `docker-compose.yml` that Coolify can deploy from the repository URL with no manual variables: it SHALL declare the magic domain variable for the service port, pass the generated public URL as `OPENTODO_BASE_URL`, mount a named volume on `/data`, and define a health check. The same file SHALL work with plain `docker compose up`. It SHALL publish the host port on every interface by default and let the operator choose the address with `OPENTODO_BIND`, and its comments SHALL name `127.0.0.1` as the safer choice behind a reverse proxy on the same machine.

#### Scenario: Deploy on Coolify
- **WHEN** the repository is added as a Docker Compose resource in Coolify and deployed
- **THEN** the app is reachable on the assigned HTTPS domain and the owner setup screen appears

#### Scenario: Home server on the LAN
- **WHEN** someone runs `docker compose up -d` with no `.env` on a NAS or home server
- **THEN** `http://localhost:8080` opens the app and other devices on the network reach it at the host's address and port

#### Scenario: Behind a reverse proxy on the same machine
- **WHEN** the operator sets `OPENTODO_BIND=127.0.0.1` in `.env` and starts the stack
- **THEN** the proxy on that machine reaches the app and other machines cannot reach port 8080 directly

### Requirement: Security headers
Responses SHALL carry a Content-Security-Policy restricting scripts, connections and frames to the app's own origin, plus `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` and a same-origin referrer policy. When `OPENTODO_BASE_URL` is https, every response SHALL also carry `Strict-Transport-Security: max-age=31536000`, without `includeSubDomains` or `preload`; without an https base URL it SHALL NOT be sent.

#### Scenario: Headers present
- **WHEN** the app shell is requested
- **THEN** the response includes the Content-Security-Policy with `script-src 'self'` and `frame-ancestors 'none'`

#### Scenario: HSTS with an https base URL
- **WHEN** `OPENTODO_BASE_URL` is `https://todo.example.com` and any route is requested
- **THEN** the response has `Strict-Transport-Security: max-age=31536000`, and a server without a base URL sends no such header

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

### Requirement: Static analysis gate
`make check` and CI SHALL run staticcheck at a version pinned in the repository over all Go packages and fail on any finding. Exclusions, if ever needed, SHALL be listed with a reason in a checked-in configuration file.

#### Scenario: Unchecked response in a test
- **WHEN** a test assigns an HTTP response and never reads it
- **THEN** `make staticcheck` fails and names the file and line

#### Scenario: Same version everywhere
- **WHEN** a contributor runs `make staticcheck` and CI runs the Go job
- **THEN** both run the staticcheck version named in the Makefile

### Requirement: Server code stays navigable
The test suite SHALL fail when a function in a non-test Go file under `internal/` is longer than 150 lines, counted from its `func` line to its closing brace, or when such a file is longer than 1,100 lines. An exception SHALL be listed in the check's allow-list with the reason it stays longer, and an entry that is no longer over the limit SHALL fail the check, so the list only shrinks. Splitting code to meet the limits SHALL NOT change routes, access policies, API responses or the op format.

#### Scenario: A function grows past the limit
- **WHEN** a contributor makes a function in `internal/` longer than 150 lines without listing it
- **THEN** `go test ./internal/codesize/` fails and names the file, the function and its length

#### Scenario: A listed exception is fixed
- **WHEN** a function in the allow-list is split below the limit and its entry stays
- **THEN** the check fails and asks for the entry to be removed

#### Scenario: Routes registered in any order
- **WHEN** a literal route such as `GET /api/v1/invitations/{token}` and the generic `GET /api/v1/{collection}/{id}` are both registered
- **THEN** a request to `/api/v1/invitations/<token>` reaches the invitation handler whichever was registered first, and every route still appears in the route policy table

### Requirement: Background jobs stop before the database closes
On shutdown (SIGTERM, interrupt or a restart for a web restore) the server SHALL cancel its background jobs and wait for them to finish, for at most 20 seconds, before it closes the database. A job that was sending something when shutdown began SHALL record the outcome of that send, so it is not repeated after the next start. When the wait times out the server SHALL log it and close anyway.

#### Scenario: Backup running at shutdown
- **WHEN** the server is stopped while a backup is uploading
- **THEN** the backup is cancelled and recorded as failed before the database closes, and no "database is closed" error is logged

#### Scenario: Digest sent during shutdown
- **WHEN** a weekly digest was handed to the mail server just as shutdown began
- **THEN** it is recorded as sent, and the next start does not send it again

#### Scenario: Reminder pushed during shutdown
- **WHEN** a reminder push was accepted by the push service just as shutdown began
- **THEN** the delivery is recorded, and the reminder is not pushed again after the restart

### Requirement: Patched release toolchain
Release binaries and images SHALL be built with the Go toolchain named by the `toolchain` line in `go.mod`, which SHALL be a patch release of the `go` line's version; the Dockerfile's default Go version SHALL be the same patch. CI SHALL fail when the Go in use differs from that toolchain, and SHALL run a pinned `govulncheck` that fails when the code can reach a known vulnerability.

#### Scenario: Runner with another Go
- **WHEN** a CI job that builds or tests the server runs with a Go other than the `go.mod` toolchain
- **THEN** the job fails naming the expected toolchain

#### Scenario: Reachable vulnerability
- **WHEN** a dependency or the standard library has a published vulnerability in a function the server calls
- **THEN** the server job fails until the toolchain or dependency is updated

#### Scenario: Dockerfile drifts from go.mod
- **WHEN** the `toolchain` line is bumped without the Dockerfile's `GO_VERSION`
- **THEN** the repository checks fail

### Requirement: CI path filter covers every input
The CI path filter SHALL classify every file that is compiled into the binary or checks the deploy templates (including `skills/`, `deploy/`, `scripts/deploy*` and the root `docker-compose.yml`) as code, so changes to them run the server jobs, and its classification SHALL be covered by a table of paths and expected outputs that runs in CI.

#### Scenario: Agent skill only
- **WHEN** a pull request changes only `skills/opentodo-cli/SKILL.md`
- **THEN** the filter reports `code=true` and the Go tests run

#### Scenario: Docs only
- **WHEN** a pull request changes only files under `docs/` and the generated in-app help
- **THEN** the filter reports `code=false` and `docs=true`

### Requirement: Templates for general container platforms
The repository SHALL include a checked template and a guide for Kubernetes (a Helm chart), Podman Quadlet, CapRover, Fly.io, Render and Synology Container Manager, each in `deploy/<platform>/` with a checker that applies the shared deployment facts and the image policy of that platform. Each template SHALL run a single instance with persistent storage on `/data` writable by the user the container runs as, the health check, closed sign-up by default and no required setting.

#### Scenario: Start from the template
- **WHEN** a user deploys OpenTodo with the template for their platform and opens it
- **THEN** the container becomes healthy and the first visitor gets the owner setup screen, while later visitors cannot register

#### Scenario: Data survives a redeploy
- **WHEN** the app is redeployed, updated or restarted on the platform
- **THEN** the same `/data` storage is mounted and every account and task is still there

#### Scenario: One writer
- **WHEN** a platform could run several instances or roll a new one before stopping the old one
- **THEN** the template runs exactly one instance and replaces it by stopping the old one first, because SQLite has one writer

### Requirement: Helm chart publishing
Every release that is not a pre-release SHALL publish the Helm chart as an OCI artifact under `oci://ghcr.io/pixari/charts`, and pull requests that change the chart SHALL lint it.

#### Scenario: A release publishes the chart
- **WHEN** the tag `v0.7.0` is pushed
- **THEN** a chart version for that release can be installed with `helm install` from `oci://ghcr.io/pixari/charts/opentodo`

#### Scenario: A broken chart is caught
- **WHEN** a pull request changes `deploy/helm/` so that the chart no longer lints or renders
- **THEN** the pull request's checks fail

### Requirement: The log names its level
The server's startup line SHALL include the log level in effect (`log_level=debug|info|warn|error`). With `OPENTODO_LOG_LEVEL=debug` the server SHALL also log, at startup and at debug level, a line saying that debug logging adds one line per API request.

#### Scenario: Debug is visible before any request
- **WHEN** the server starts with `OPENTODO_LOG_LEVEL=debug` and no request has been made yet
- **THEN** the log has the startup line with `log_level=debug` and a `level=DEBUG` line about request logging

#### Scenario: Info stays quiet
- **WHEN** the server starts with the default level
- **THEN** the startup line shows `log_level=info` and no debug line is written

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

### Requirement: Reads do not wait for writes
The server SHALL answer pure reads (lists, records, pulls, exports) from read-only connections while a write is in progress, SHALL keep every transaction that reads then writes on the single writer, and SHALL take the write lock when a write transaction begins. A read started after a commit SHALL see it. Offline behaviour and convergence are unchanged.

#### Scenario: List during a long write
- **WHEN** a large import or purge holds the database's write transaction and a user opens a task list or syncs
- **THEN** the list and the pull answer without waiting for that write to finish

#### Scenario: Own write is visible
- **WHEN** a client saves a change and then lists the same kind of record
- **THEN** the list includes the change

#### Scenario: Two processes write
- **WHEN** a newer server process writes to the data directory while the old one is in a write transaction during a rolling update
- **THEN** the second write waits and succeeds once the first commits, and neither fails with "database is locked"

#### Scenario: Restore
- **WHEN** a confirmed restore is applied and the server opens the restored database
- **THEN** reads come from the restored database, not from connections opened on the previous file

### Requirement: Read cost bounded by the visible data
Listing records and pulling ops SHALL read only the scopes the user can see (their personal data and the shared projects they are a member of), whatever the number of other users on the server. The server SHALL refresh the database's query planner statistics at startup and at least daily. Offline behaviour and convergence are unchanged.

#### Scenario: Member of a shared project lists tasks
- **WHEN** a user who joined one shared project lists their tasks on a server with many other users
- **THEN** the query reads that user's personal rows and the project's rows only, not other users' rows

#### Scenario: First pull after joining
- **WHEN** a member's device pulls its first page from cursor 0
- **THEN** the server reads at most one page of op positions per visible scope before reading the ops, and returns every visible op exactly once in sequence order over the following pages

#### Scenario: Statistics
- **WHEN** the server starts, and once a day while it runs
- **THEN** it refreshes the planner statistics of tables whose size changed a lot, reading a bounded sample

### Requirement: One strict parser for template YAML
The template conformance check SHALL read every YAML template with one shared strict parser, and each platform's checker SHALL name the profile of the subset its files may use. Every profile SHALL refuse YAML outside the subset (anchors, aliases, tags, flow maps, duplicate keys, inconsistent indentation) with the line number.

#### Scenario: Unsupported YAML in a template
- **WHEN** a contributor adds an anchor (`&x`) or a flow map to any platform's YAML template
- **THEN** `make check` fails with "not in the supported YAML subset" and the line number

#### Scenario: A construct the platform's profile does not allow
- **WHEN** a Coolify-style compose file gains a `|` block scalar or a `- key: value` item, or the Umbrel manifest gains a `|` block scalar
- **THEN** `make check` fails and names what the file may use

#### Scenario: Same reading in every check
- **WHEN** two checkers read `'it''s'`, `"a\"b"` or a folded `>` text with a blank line
- **THEN** both read `it's`, `a"b` and a text with one newline for the blank line

#### Scenario: A checker with its own parser
- **WHEN** a platform checker defines its own YAML parsing function
- **THEN** the deploy tests fail and point to the shared parser

### Requirement: Gated and verifiable releases
CI SHALL publish the container image (including the `stable` and `latest` tags) and the GitHub release only after every other CI job of the run succeeded. A check that runs as several parallel jobs (one per browser engine, or one per shard of the visual comparison) SHALL count as succeeded only when every one of its jobs succeeded. Before publishing, CI SHALL build the image, scan it for known vulnerabilities and fail on a critical finding that has a fixed version, and start that same build the way the Coolify template does. The published image SHALL carry an SBOM and build provenance and its digest SHALL be signed keylessly with cosign; every GitHub release asset SHALL have a build provenance attestation. The self-hosting docs SHALL explain how to verify both.

#### Scenario: A gate fails on a release tag
- **WHEN** the tag `v0.7.0` is pushed and the layout, UI, docs website or template check fails
- **THEN** no image tag moves and no GitHub release is published

#### Scenario: The smoke test runs the image under test
- **WHEN** a pull request changes the server
- **THEN** CI builds the image from that commit, scans it and runs the Coolify smoke test against it, without pulling a published image

#### Scenario: Fixable critical vulnerability
- **WHEN** the built image contains a package with a critical vulnerability that has a fixed version
- **THEN** the image job fails and nothing is published

#### Scenario: Operator verifies an image
- **WHEN** an operator runs `cosign verify` on a released image with the release workflow's identity and GitHub's OIDC issuer
- **THEN** the signature verifies, and `gh attestation verify` verifies a downloaded release binary

#### Scenario: One shard of a split check fails
- **WHEN** the visual comparison runs in three shards on a push to `main` and only the second shard finds a difference
- **THEN** the run fails, no image tag moves, and the second shard's report artifact holds the diff

### Requirement: Pinned build inputs
Workflow actions SHALL be pinned to full commit SHAs with the release named in a comment; Dockerfile base images and CI job images SHALL be pinned by digest next to their tag; the OpenSpec CLI SHALL run at one exact version. Dependabot SHALL propose updates weekly for Go modules, the web app's npm packages, GitHub Actions and Docker base images. Every CI job SHALL have a timeout, and every workflow a concurrency group that cancels superseded pull request runs but never a run for the main branch or a tag.

#### Scenario: A tag is moved upstream
- **WHEN** an action's maintainer (or an attacker) points an existing release tag at other code
- **THEN** CI keeps running the pinned commit until a reviewed update changes the SHA

#### Scenario: Unpinned reference added
- **WHEN** a workflow change adds `uses: some/action@v1` or a job image without a digest
- **THEN** the repository checks fail and name the reference

#### Scenario: Superseded pull request run
- **WHEN** a second commit is pushed to a pull request while its checks run
- **THEN** the first run is cancelled, while runs for main and tags always finish

### Requirement: CI runs the local checks
CI SHALL run every part of `make check` (including the gofmt gate, the design-system lint, the translation checks, the deploy template and site bundle tests, OpenSpec validation and the repository checks), the browser end-to-end checks of two devices converging after an offline edit and of saved views, and, at least nightly, the Go tests under the race detector. The repository checks SHALL fail when `make check` gains a step that CI does not run.

#### Scenario: Unformatted Go file
- **WHEN** a pull request adds a Go file that `gofmt -l` lists
- **THEN** the checks job fails

#### Scenario: Offline edit no longer converges
- **WHEN** a change breaks syncing an edit made offline on a second device
- **THEN** the end-to-end step of the layout job fails

#### Scenario: New make check step
- **WHEN** a target is added to `make check` but neither to `make ci-checks` nor to a CI step
- **THEN** the repository checks fail and name the target
