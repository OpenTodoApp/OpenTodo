# Spec Delta

## ADDED Requirements

### Requirement: Protected first deploy on Coolify
The Coolify one-click template SHALL pass a Coolify-generated secret as `OPENTODO_SETUP_TOKEN`, so a freshly deployed public instance cannot be claimed by a visitor who does not have access to the Coolify project. Deployments that do not set the variable SHALL keep the first-visit owner setup.

#### Scenario: One-click deploy
- **WHEN** an operator deploys the template and a stranger opens the URL before the operator
- **THEN** the stranger sees the setup screen asking for a setup token and cannot create the owner

#### Scenario: Plain Docker
- **WHEN** the image runs without `OPENTODO_SETUP_TOKEN`
- **THEN** the first visitor creates the owner, as before
