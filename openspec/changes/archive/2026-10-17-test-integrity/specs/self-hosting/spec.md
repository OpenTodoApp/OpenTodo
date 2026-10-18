## ADDED Requirements

### Requirement: Static analysis gate
`make check` and CI SHALL run staticcheck at a version pinned in the repository over all Go packages and fail on any finding. Exclusions, if ever needed, SHALL be listed with a reason in a checked-in configuration file.

#### Scenario: Unchecked response in a test
- **WHEN** a test assigns an HTTP response and never reads it
- **THEN** `make staticcheck` fails and names the file and line

#### Scenario: Same version everywhere
- **WHEN** a contributor runs `make staticcheck` and CI runs the Go job
- **THEN** both run the staticcheck version named in the Makefile
