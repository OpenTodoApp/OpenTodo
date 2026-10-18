## ADDED Requirements

### Requirement: Gated and verifiable releases
CI SHALL publish the container image (including the `stable` and `latest` tags) and the GitHub release only after every other CI job of the run succeeded. Before publishing, CI SHALL build the image, scan it for known vulnerabilities and fail on a critical finding that has a fixed version, and start that same build the way the Coolify template does. The published image SHALL carry an SBOM and build provenance and its digest SHALL be signed keylessly with cosign; every GitHub release asset SHALL have a build provenance attestation. The self-hosting docs SHALL explain how to verify both.

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
