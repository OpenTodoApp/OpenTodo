# Spec Delta

## ADDED Requirements

### Requirement: One archive format for hosted and self-hosted data
A tenant export from a host SHALL be the same backup archive format as a self-hosted backup, readable by `opentodo restore` and by tenant creation from an archive, in both directions.

#### Scenario: Self-hosted to hosted
- **WHEN** a self-hosted owner's backup archive is used to create a hosted tenant
- **THEN** the tenant contains the same data, and encrypted archives ask for their passphrase as in a restore
