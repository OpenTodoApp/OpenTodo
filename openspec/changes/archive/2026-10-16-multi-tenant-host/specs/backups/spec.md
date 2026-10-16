# Spec Delta

## ADDED Requirements

### Requirement: One archive format for hosted and self-hosted data
A tenant export from a host, and the owner's download of a hosted tenant, SHALL be the same backup archive format as a self-hosted backup, readable by `opentodo restore` and by tenant creation from an archive, in both directions. A restored archive SHALL get a fresh log generation, so devices re-send their local changes and converge as after any restore.

#### Scenario: Self-hosted to hosted
- **WHEN** a self-hosted owner's backup archive is used to create a hosted tenant
- **THEN** the tenant contains the same data, and encrypted archives ask for their passphrase as in a restore

#### Scenario: Hosted to self-hosted
- **WHEN** a hosted tenant's archive is restored with `opentodo restore` into an empty data directory
- **THEN** the self-hosted server starts with the tenant's accounts and data, and its owner signs in with the same credentials
