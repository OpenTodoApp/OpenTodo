## MODIFIED Requirements

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
