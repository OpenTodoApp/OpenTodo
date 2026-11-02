## ADDED Requirements

### Requirement: Encrypted objectives
For an encrypted account the device SHALL encrypt an objective's `title` (OpenSpec `plan-objectives`) before it leaves the device, and SHALL keep its `period`, `position`, `done_at`, `created_at` and `deleted_at` plaintext. Enabling encryption SHALL re-write existing objective titles with the other content fields. REST and the export SHALL return ciphertext titles. The MCP read SHALL return a title only through a device the user opted in to answer AI connectors, and otherwise `title: null` with `encrypted: true`. The documented field split SHALL list objectives.

#### Scenario: Title is ciphertext
- **WHEN** an encrypted account adds the weekly objective "Finish the grant"
- **THEN** the operation sent to the server carries ciphertext for `title` and the plaintext period `2026-W44`

#### Scenario: Enabling encryption later
- **WHEN** an account with three objectives enables encryption
- **THEN** the re-write job replaces the three titles with ciphertext, and the user's other devices show them decrypted

#### Scenario: Assistant without a relay device
- **WHEN** an assistant calls `list_objectives` for an encrypted account with no opted-in device online
- **THEN** each result carries the period and done state, `title: null` and `encrypted: true`
