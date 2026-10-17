## ADDED Requirements

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

## MODIFIED Requirements

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
