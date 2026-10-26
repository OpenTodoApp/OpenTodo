## ADDED Requirements

### Requirement: Legacy image name after the move
After the repository moved from the user `pixari` to the organization `OpenTodoApp`, CI SHALL keep publishing every image it publishes (its tags and a cosign signature of its digest) also as `ghcr.io/pixari/opentodo`, every Helm chart also under `oci://ghcr.io/pixari/charts`, and the manual `stable` promotion also for the legacy name, for every release up to and including the 0.16 releases and for builds of the main branch until a later release exists. The legacy push SHALL use the repository secret `GHCR_LEGACY_TOKEN` when it is set and the workflow's own token otherwise, and SHALL NOT fail the workflow when the registry refuses it: it SHALL print a warning naming the secret instead. Self-hosting documentation SHALL state the new name and the last release the legacy name receives. The move changes no data, route or configuration, so offline behaviour and convergence are unaffected.

#### Scenario: A release in the transition window
- **WHEN** the tag `v0.15.0` is released
- **THEN** `ghcr.io/opentodoapp/opentodo:0.15.0` and `ghcr.io/pixari/opentodo:0.15.0` name the same digest, both signed, and `stable` moves under both names

#### Scenario: After the window
- **WHEN** the tag `v0.17.0` is released
- **THEN** only `ghcr.io/opentodoapp/opentodo` gets it, and `ghcr.io/pixari/opentodo:stable` stays on the last 0.16 release

#### Scenario: The legacy push is refused
- **WHEN** the registry refuses the push to `ghcr.io/pixari/opentodo` because neither token may write that package
- **THEN** the release still succeeds and the run shows a warning that names `GHCR_LEGACY_TOKEN`

## MODIFIED Requirements

### Requirement: Template conformance check
An automated check run by `make check` SHALL fail when any platform template breaks its platform's conventions or the shared deployment facts, when its image does not follow its platform's image policy (by default `ghcr.io/opentodoapp/opentodo:stable`), when it names an `OPENTODO_*` variable the server does not read, when an upstream copy differs from its template, or when the release job no longer publishes the `stable` tag.

#### Scenario: Template drifts from the release or the server
- **WHEN** a template's image breaks its platform's image policy, the health check or the `/data` volume is missing, a `build:` key appears, or it names an `OPENTODO_*` variable the server does not read
- **THEN** `make check` fails and names the problem

#### Scenario: A release bumps every template
- **WHEN** a release is prepared, templates with the `stable` policy name `stable`, and the pinned templates name the new version
- **THEN** `make check` passes, and the release reaches the `stable` templates through the tag and the pinned ones through their store's update

#### Scenario: The release stops publishing stable
- **WHEN** the `stable` tag is removed from the image job's tags in the CI workflow
- **THEN** `make check` fails and says the templates name a tag that is no longer published

### Requirement: Stable image tag
Every release that is not a pre-release SHALL also publish the image as `ghcr.io/opentodoapp/opentodo:stable`, pointing at the same image as its version tags. Pre-releases SHALL NOT move `stable`. A manual workflow SHALL point `stable` at an already published version without rebuilding it.

#### Scenario: A release moves stable
- **WHEN** the tag `v0.7.0` is pushed and the release job succeeds
- **THEN** `stable`, `0.7` and `0.7.0` resolve to the same image digest

#### Scenario: A release candidate does not
- **WHEN** the tag `v0.8.0-rc.1` is pushed
- **THEN** `stable` still resolves to the previous release

#### Scenario: Roll back
- **WHEN** the maintainer runs the promote workflow with version `0.7.0` after `0.7.1` was released
- **THEN** `stable` resolves to the `0.7.0` image and no image is rebuilt

#### Scenario: Releases before the move are promoted to the new name
- **WHEN** the manual workflow points `stable` at `0.14.2`, which was published only as `ghcr.io/pixari/opentodo:0.14.2`
- **THEN** it first copies that release to `ghcr.io/opentodoapp/opentodo:0.14.2` with the same digest and its signatures, then moves `stable` under both names

### Requirement: Image policy per platform
Each platform checker SHALL declare an image policy: `stable` (the image `ghcr.io/opentodoapp/opentodo:stable`), `release` (the latest release in `CHANGELOG.md`) or `release-digest` (that release plus a `sha256` index digest). Templates SHALL use `stable` unless the platform's store rejects moving tags or offers updates only when a version changes.

#### Scenario: A release bumps the pinned templates
- **WHEN** a release is prepared and a template with the `release` or `release-digest` policy still names the previous version
- **THEN** `make check` fails and names that template, while templates with the `stable` policy need no change

#### Scenario: Digest refreshed after the release
- **WHEN** the release image is published and the maintainer runs `node scripts/deploy/pin.mjs`
- **THEN** every pinned digest under `deploy/` is replaced by the registry's multi-arch index digest for that version, and `--check` reports any that still differ

#### Scenario: A digest pinned before the move
- **WHEN** a `release-digest` template pins a release up to the last one published before the move (`0.14.2`)
- **THEN** the check requires the legacy name `ghcr.io/pixari/opentodo` for it, and after the next release it requires `ghcr.io/opentodoapp/opentodo`, which `scripts/deploy/pin.mjs` writes with the new digest

### Requirement: Helm chart publishing
Every release that is not a pre-release SHALL publish the Helm chart as an OCI artifact under `oci://ghcr.io/opentodoapp/charts`, and pull requests that change the chart SHALL lint it.

#### Scenario: A release publishes the chart
- **WHEN** the tag `v0.7.0` is pushed
- **THEN** a chart version for that release can be installed with `helm install` from `oci://ghcr.io/opentodoapp/charts/opentodo`

#### Scenario: A broken chart is caught
- **WHEN** a pull request changes `deploy/helm/` so that the chart no longer lints or renders
- **THEN** the pull request's checks fail

### Requirement: Home Assistant add-on
The repository SHALL include a Home Assistant add-on repository in `deploy/homeassistant/upstream/`, published as `OpenTodoApp/opentodo-homeassistant-addons`, whose add-on runs the OpenTodo binary of the latest release on Home Assistant OS and Supervised installations for amd64 and aarch64, keeps its data in the add-on's `/data`, offers the essential variables of the deployment facts as options with the catalogue's defaults and descriptions, requires none, and is opened on a published port rather than through Ingress. A checker SHALL verify the add-on against the deployment facts and the latest release.

#### Scenario: Install and open
- **WHEN** a user adds the repository URL in Home Assistant, installs the OpenTodo add-on, starts it and clicks Open Web UI
- **THEN** OpenTodo opens on port 8080 of the Home Assistant machine and the first visitor gets the owner setup screen, while later visitors cannot register

#### Scenario: Options reach OpenTodo
- **WHEN** the user sets `allow_signup`, `base_url` or `log_level` and restarts the add-on
- **THEN** OpenTodo runs with the matching `OPENTODO_*` values, and an option left empty keeps OpenTodo's default

#### Scenario: Data survives a restart and is in the backup
- **WHEN** the add-on is restarted, or a Home Assistant backup that includes it is restored
- **THEN** every account and task is still there, and the backup was taken with the add-on stopped so the database is consistent

#### Scenario: A release becomes an update
- **WHEN** OpenTodo publishes a release that is not a pre-release
- **THEN** the add-on repository publishes images for that version before its `version` changes, and Home Assistant offers the update

#### Scenario: A stale add-on fails the check
- **WHEN** `CHANGELOG.md` names a newer release than the add-on's `version` or the OpenTodo version in its `Dockerfile`, or an option is missing or has a default that differs from the catalogue
- **THEN** `make check` fails and names the problem
