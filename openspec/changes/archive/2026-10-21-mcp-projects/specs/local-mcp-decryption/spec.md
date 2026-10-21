## ADDED Requirements

### Requirement: Unlocking the account key on the user's machine
For an account with end-to-end encryption, `ot encryption unlock` SHALL read the passphrase without echo from the terminal (or the recovery key with `--recovery`, or either from a file named by `--passphrase-file`), fetch the account's wrapped key record with the profile's token, accept it only within the same key-derivation bounds devices accept, unwrap the account key on the user's machine and store it with its key version in an owner-only file under the CLI's configuration directory, one per profile. The passphrase, the recovery key and the account key SHALL never be sent to the server, printed or written to any other file. After 5 failed attempts within a minute further attempts SHALL be delayed. `ot encryption lock` SHALL delete the stored key; `ot encryption status` SHALL report `locked`, `unlocked` or `stale` (the stored key's version differs from the account's) without printing key material. Unlocking needs the network, like every CLI command.

#### Scenario: Unlock with the passphrase
- **WHEN** the user runs `ot encryption unlock` for an encrypted account and types the correct passphrase
- **THEN** the key is stored owner-only for that profile, `ot encryption status` reports `unlocked`, and the server received only the token-authenticated read of the wrapped key record

#### Scenario: Wrong passphrase
- **WHEN** the typed passphrase cannot unwrap the key
- **THEN** the command exits with a non-zero status naming the problem, stores nothing, and after 5 failures within a minute waits before trying again

#### Scenario: Account without encryption
- **WHEN** the user runs `ot encryption unlock` for an account that has no key record
- **THEN** the command exits with a non-zero status saying the account is not encrypted and stores nothing

#### Scenario: Token missing or revoked
- **WHEN** the profile's token is missing, unknown or revoked
- **THEN** the key record request is refused with 401, the command exits with the authentication status and stores nothing

#### Scenario: Key derivation out of bounds
- **WHEN** the server serves a key record with an iteration count outside the accepted range
- **THEN** unlocking fails with the out-of-range error and nothing is stored

#### Scenario: Lock
- **WHEN** the user runs `ot encryption lock`
- **THEN** the stored key for that profile is deleted and a decrypting bridge started afterwards refuses to start

### Requirement: Decrypting bridge
`ot mcp --decrypt` SHALL behave as the stdio bridge and additionally replace, in every tool result and resource it forwards, each encrypted placeholder whose entity, id and field it can determine from the result's shape with the plaintext of that value, read as ciphertext from the user's own data through the REST API and decrypted on the user's machine, removing the item's encrypted marker once nothing of it stays encrypted; values it cannot attribute or decrypt SHALL keep the placeholder. Decrypted text SHALL stay inside the untrusted-text objects it came in. In every write tool call it forwards, it SHALL replace each content argument with a ciphertext envelope bound to the target entity, id and field, assigning a new random id to each created item that has none, so the server receives no content in plaintext. Tool definitions SHALL be forwarded with their ciphertext-only wording replaced by plaintext wording. Writes SHALL go through the server's write permission gate, limits and audit unchanged, and converge with device edits as any write does.

#### Scenario: Reading encrypted tasks
- **WHEN** an assistant connected through `ot mcp --decrypt` calls `list_tasks` for an unlocked encrypted account
- **THEN** it receives the tasks' titles and descriptions in plaintext inside their untrusted-text objects, while the server's response carried only ciphertext

#### Scenario: Creating a task with a title
- **WHEN** the assistant calls `create_tasks` with the title "Book the plumber" through the decrypting bridge
- **THEN** the server receives a chosen task id and a ciphertext title for that id, and every unlocked device shows "Book the plumber" after sync

#### Scenario: Renaming a section
- **WHEN** the assistant calls `update_sections` to rename a section through the decrypting bridge
- **THEN** the server stores only the envelope, and a phone that reordered the same section offline at the same time keeps its new position next to the new name after sync

#### Scenario: Value from another account or entity
- **WHEN** a result contains an envelope that does not decrypt with the stored key for its entity, id and field
- **THEN** that value keeps the encrypted placeholder and the rest of the result is delivered

#### Scenario: Write refused by the gate
- **WHEN** the owner has turned assistant writes off and the assistant calls `update_project` through the decrypting bridge
- **THEN** the server's refusal is forwarded unchanged and nothing is written

### Requirement: Starting without a usable key
`ot mcp --decrypt` SHALL refuse to start, writing no protocol data and naming `ot encryption unlock` on stderr, when the profile has no stored key, when the stored key's version differs from the account's, or when the account is not encrypted. When the account's key version changes during a session, the bridge SHALL answer each later request with a JSON-RPC error saying the key is stale and SHALL forward nothing. It SHALL never prompt for a passphrase.

#### Scenario: Not unlocked
- **WHEN** an MCP client starts `ot mcp --decrypt` for a profile that was never unlocked
- **THEN** the process exits with a non-zero status, stdout stays empty and stderr says to run `ot encryption unlock`

#### Scenario: Passphrase changed elsewhere
- **WHEN** the user changes the passphrase in the web app so that the key version changes, while a decrypting bridge is running
- **THEN** the bridge's next request returns a stale-key error and nothing is forwarded until the user unlocks again

#### Scenario: Server unreachable
- **WHEN** the configured server cannot be reached at start
- **THEN** the bridge exits with the unreachable-server status and writes no protocol response, as the plain bridge does

### Requirement: Plaintext notice
Starting the decrypting bridge SHALL write to stderr a notice that the assistant reads the encrypted content in plaintext and that the AI provider receives it. The assistants section of Settings and the documentation SHALL state the same next to the instructions for the decrypting bridge, and SHALL state that the server still receives only ciphertext.

#### Scenario: Notice on start
- **WHEN** `ot mcp --decrypt` starts with a usable key
- **THEN** stderr carries the plaintext notice before the first message is forwarded, and stdout carries only protocol data

#### Scenario: Notice in Settings
- **WHEN** an encrypted user opens the assistants section of Settings
- **THEN** it explains that remote assistants can change only colours, icons, order and dates, that `ot mcp --decrypt` lets a local assistant read and write content, and that the AI provider then receives that content
