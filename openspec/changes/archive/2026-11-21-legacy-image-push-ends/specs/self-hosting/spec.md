## MODIFIED Requirements

### Requirement: Legacy image name after the move
After the repository moved from the user `pixari` to the organization `OpenTodoApp`, CI published every image it published (its tags and a cosign signature of its digest) also as `ghcr.io/pixari/opentodo`, every Helm chart also under `oci://ghcr.io/pixari/charts`, and the manual `stable` promotion also for the legacy name, for every release up to and including 0.16.0. That window is over: CI SHALL publish images, charts and the `stable` promotion only under `ghcr.io/opentodoapp/opentodo` and `oci://ghcr.io/opentodoapp/charts`, and no release step SHALL need a credential for the legacy names. The manual `stable` promotion SHALL still copy a release published only under the legacy name (0.14.2 and earlier) to the new name first, digest and signatures unchanged. Self-hosting documentation SHALL state the new name and the last release the legacy name received. The move changes no data, route or configuration, so offline behaviour and convergence are unaffected.

#### Scenario: A release in the transition window
- **WHEN** the tag `v0.15.0` was released
- **THEN** `ghcr.io/opentodoapp/opentodo:0.15.0` and `ghcr.io/pixari/opentodo:0.15.0` name the same digest, both signed

#### Scenario: After the window
- **WHEN** a release after 0.16.0 is tagged
- **THEN** only `ghcr.io/opentodoapp/opentodo` gets it, and `ghcr.io/pixari/opentodo:stable` stays on the last release it received

#### Scenario: The legacy push is refused
- **WHEN** the packages under `ghcr.io/pixari` refuse every push, or the repository has no credential for them
- **THEN** a release, the Helm publish and `Promote stable` run as before: none of them pushes to the legacy names or warns about them

#### Scenario: Promoting a release from before the move
- **WHEN** `Promote stable` runs for 0.14.2, which exists only under `ghcr.io/pixari/opentodo`
- **THEN** it is first copied to `ghcr.io/opentodoapp/opentodo:0.14.2` with the same digest and its signatures, then `stable` points at it
