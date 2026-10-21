## MODIFIED Requirements

### Requirement: Consequences for server-side reads and integrations
For an encrypted account, REST collections and the export SHALL return ciphertext for content fields, and the export SHALL include the wrapped key record; plaintext REST writes are accepted and encrypted later. The profile SHALL expose `encryption: {enabled, keyVersion}`. Server-side integrations SHALL treat content fields as opaque and be disabled or limited where they need content; project sharing SHALL be refused for an encrypted account, and so SHALL adding a member or a group to a workspace the account owns, creating a workspace invite link and granting a group a role on its projects. An encrypted account MAY create, rename and delete its own workspaces and move its projects, labels, views and tasks between them: workspace names, icons and colours are server-side data in plaintext like project membership, and everything inside a workspace stays encrypted under the account key. An encrypted account MAY be a member of another account's workspaces and groups and of their shared projects, which are plaintext as today. The one exception SHALL be an MCP tool call answered through a device the user opted in to answer AI connectors: the device decrypts or encrypts the values that call needs, the server never holds the key, and relayed plaintext exists only in the server's memory for the duration of that call, never stored, cached, logged or audited.

#### Scenario: REST read of an encrypted task
- **WHEN** a script requests a task of an encrypted account with a bearer token
- **THEN** the response contains the ciphertext string in `title` and the plaintext `due`, and the documentation explains the format

#### Scenario: Export includes keys and ciphertext
- **WHEN** an encrypted user downloads the export
- **THEN** the document contains ciphertext content, plaintext scheduling fields and the wrapped key record, enough to restore and decrypt with the passphrase elsewhere

#### Scenario: Sharing refused
- **WHEN** an encrypted account attempts to share a project
- **THEN** the request is refused with a 409 `encryption_enabled` error explaining that sharing is not yet available for encrypted accounts

#### Scenario: Relayed read leaves nothing behind
- **WHEN** an assistant reads task titles through an opted-in device and the server's database, op log, logs and audit log are inspected afterwards
- **THEN** they contain only ciphertext for those titles and no key material

#### Scenario: Workspace membership refused
- **WHEN** an encrypted account adds a member to its workspace "Work", creates a group there or creates a workspace invite link
- **THEN** the request is refused with 409 `encryption_enabled` and the Workspaces settings page explains it before the user tries

#### Scenario: Partition still works
- **WHEN** an encrypted account creates "Work" and moves a project into it
- **THEN** the workspace exists with its plaintext name, the project's title stays ciphertext on the server, and the user's other devices show the project in Work after sync

