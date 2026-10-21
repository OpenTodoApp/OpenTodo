## MODIFIED Requirements

### Requirement: CI path filter covers every input
The CI path filter SHALL classify every file that is compiled into the binary or checks the deploy templates (including `skills/`, `deploy/`, `scripts/deploy*` and the root `docker-compose.yml`) as code, so changes to them run the server jobs, and its classification SHALL be covered by a table of paths and expected outputs that runs in CI. Files under `mobile/` SHALL be classified as `mobile`, so a change there runs the Android shell job, and a change to nothing else runs only that job and the repository checks.

#### Scenario: Agent skill only
- **WHEN** a pull request changes only `skills/opentodo-cli/SKILL.md`
- **THEN** the filter reports `code=true` and the Go tests run

#### Scenario: Docs only
- **WHEN** a pull request changes only files under `docs/` and the generated in-app help
- **THEN** the filter reports `code=false` and `docs=true`

#### Scenario: Android shell only
- **WHEN** a pull request changes only `mobile/android/app/src/main/AndroidManifest.xml`
- **THEN** the filter reports `mobile=true` and `code=false`, the Android job runs and the Go tests do not
