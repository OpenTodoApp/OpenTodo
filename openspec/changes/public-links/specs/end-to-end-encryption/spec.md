# Spec Delta

## ADDED Requirements

### Requirement: Encrypted projects cannot be published
An account with encryption on SHALL NOT create a public link for a project it has not shared (409 `encryption_enabled`), because the server holds only ciphertext for it. A public link of an unshared project whose creator enables encryption later SHALL answer 404 `link_invalid` from then on, so ciphertext never reaches a guest. Links on shared projects, which are plaintext, are unaffected.

#### Scenario: Creation refused
- **WHEN** an encrypted account creates a public link for an unshared project
- **THEN** the response is 409 `encryption_enabled` and no link exists

#### Scenario: Encryption enabled after publishing
- **WHEN** the owner of a published, unshared project enables encryption and a guest reloads the page
- **THEN** the response is 404 `link_invalid` and the page says the link no longer works

#### Scenario: Shared project
- **WHEN** an encrypted account that is an admin of a shared project creates a public link for it
- **THEN** the link works and serves the plaintext titles every member sees
