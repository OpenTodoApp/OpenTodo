# Spec Delta

## ADDED Requirements

### Requirement: Host mode is optional
Host mode SHALL be enabled only by optional configuration (`OPENTODO_HOST_URL`, with its operator token). A server started without it SHALL behave as a single-tenant self-hosted server, with no host-mode routes and no operator listener, and no new variable SHALL become mandatory for it. Host mode SHALL refuse a data directory that holds a self-hosted server's database and SHALL NOT be combined with a demo instance.

#### Scenario: Plain container start
- **WHEN** the container starts with only a data volume, as documented today
- **THEN** it serves one tenant from that volume, with no host-mode routes and no operator interface

#### Scenario: Host mode without its token
- **WHEN** `OPENTODO_HOST_URL` is set without an operator token of the required length
- **THEN** the server refuses to start and names the missing variable
