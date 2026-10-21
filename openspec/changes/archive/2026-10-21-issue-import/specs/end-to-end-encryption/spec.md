# Spec Delta

## ADDED Requirements

### Requirement: Issue connections for encrypted accounts
For an encrypted account, creating or enabling an issue connection (OpenSpec `issue-connections`) SHALL be refused with 409 `encryption_enabled`, because the server would write issue titles and bodies as plaintext operations on every poll. Enabling encryption SHALL stop the account's existing connections with reason `encrypted_account`, the response SHALL report it, and the encryption screen SHALL say so; tasks already created stay and are encrypted with the rest of the account's content.

#### Scenario: Enable encryption with connections
- **WHEN** a user with two enabled issue connections turns on encryption
- **THEN** both connections are stopped with reason `encrypted_account`, the encryption screen lists them, their tasks are re-written as ciphertext like every other task, and no poll happens afterwards

#### Scenario: Connection refused
- **WHEN** an encrypted account posts an issue connection
- **THEN** the response is a 409 `encryption_enabled` error and nothing is stored
