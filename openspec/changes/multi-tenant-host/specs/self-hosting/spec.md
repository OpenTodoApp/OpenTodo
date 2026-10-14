# Spec Delta

## ADDED Requirements

### Requirement: Host mode is optional
Host mode and outgoing email SHALL be enabled only by optional configuration. A server started with no new variables SHALL behave as a single-tenant self-hosted server, and no new variable SHALL become mandatory.

#### Scenario: Plain container start
- **WHEN** the container starts with only a data volume, as documented today
- **THEN** it serves one tenant from that volume, with no host-mode routes and no email sending
