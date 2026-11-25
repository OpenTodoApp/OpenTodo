## MODIFIED Requirements

### Requirement: Transport through the unchanged operation log
Ciphertext SHALL be a string value beginning with a version prefix, carrying the nonce, the authenticated ciphertext and a binding to the entity, id and field it belongs to. From format version 2 (`enc:v2:`) it SHALL also carry a stamp, in the clear and in the authenticated data, equal to the timestamp of the operation that carries it. The server SHALL validate, store and serve such operations as any other string value, and SHALL additionally refuse a version 2 value whose stamp differs from its operation's timestamp; the operation schema, limits and sync endpoint SHALL NOT change otherwise. A value whose binding does not match where it is found SHALL be shown as undecryptable, never as another field's content.

#### Scenario: Server accepts ciphertext as an ordinary value
- **WHEN** an encrypted device syncs operations with ciphertext titles
- **THEN** the server applies them under the existing validation and the response reports them as applied

#### Scenario: Ciphertext too large
- **WHEN** a description's ciphertext exceeds the existing per-value limit
- **THEN** the sync request is refused with the existing 400 `invalid_op` error and the client shows which item is too long

#### Scenario: Ciphertext moved to another field
- **WHEN** a value encrypted for one task's `title` is presented under another task or field
- **THEN** the client renders an "undecryptable" placeholder for that field and keeps the operation

#### Scenario: Stamp and timestamp differ on upload
- **WHEN** a sync push carries a version 2 title whose stamp is not the operation's timestamp
- **THEN** the server refuses that operation as `invalid_op` with detail `stamp_mismatch`, stores nothing for it, and applies the rest of the batch

#### Scenario: A version 2 operation from a clock far ahead
- **WHEN** a sync push carries a version 2 value more than five minutes ahead of the server's clock, from a client that did not declare the `clock_skew` feature
- **THEN** the server refuses it as `clock_skew` instead of moving its timestamp, and the client stamps and seals it again

## ADDED Requirements

### Requirement: Ciphertext is bound to its operation's timestamp
Every writer of version 2 ciphertext SHALL seal with the timestamp of the operation that will carry the value. Writers that upload operations (the web app, the Obsidian plugin, `ot vault`) SHALL seal at upload with the operation's timestamp, and SHALL seal again when an operation is stamped again. When the server writes a client-made version 2 envelope as an operation (REST, MCP tools, the device relay, import), that operation SHALL take the envelope's stamp as its timestamp. The server SHALL refuse such a write when the stamp would not win over the field's current operation (409 `stale_ciphertext` with `currentTs`) or is more than five minutes ahead of its clock (400 `clock_skew`). The authentication and authorization of each write path SHALL stay as they are. Offline, writers seal when the operation is uploaded, so queued edits are unaffected; convergence stays last-writer-wins on the timestamp, which is now the stamp.

#### Scenario: Offline edit uploaded later
- **WHEN** an unlocked device edits a title offline and syncs an hour later
- **THEN** the uploaded title is a version 2 envelope whose stamp is the operation's timestamp, and every other device decrypts it and applies it by last-writer-wins

#### Scenario: A stale stamp through MCP
- **WHEN** `ot mcp --decrypt` writes a task title sealed with a stamp older than the title's current operation
- **THEN** the server answers 409 `stale_ciphertext` with `currentTs`, and `ot` seals the title again with a later stamp and the retry is applied

#### Scenario: Unauthenticated write of ciphertext
- **WHEN** a REST request without a session or token writes a version 2 title
- **THEN** the server answers 401 as for any write and stores nothing

#### Scenario: Relay encryption
- **WHEN** the server asks an opted-in device to encrypt a title for an assistant's write
- **THEN** the device seals it with its own clock as the stamp, and the server stores the operation with that stamp as its timestamp

#### Scenario: Undo of a routine run that changed encrypted text
- **WHEN** a user undoes a routine run that changed an encrypted task title on an encrypted account
- **THEN** the title is not put back, the undo lists it under not undoable, and the run's other changes are undone

### Requirement: Devices refuse an older ciphertext
Before applying incoming operations, a device SHALL refuse a version 2 value whose stamp differs from its operation's timestamp, and, from the release in which writers write version 2, a version 1 value that would win over a field the device holds as version 2, or over any value it holds once its re-seal of existing values has finished. A refused operation SHALL NOT be applied: the field keeps its value and clock, sync continues, nothing is re-written automatically, and the device records the refusal locally (at most 200 entries) and shows in Settings → Encryption how many items it kept, with their list. Operations that lose last-writer-wins SHALL be ignored as before. A device that never held the field SHALL accept the winning authentic value. Offline, nothing is checked until the operations arrive; two devices that refuse the same operation keep the same value, and the next edit of the field converges every device again.

#### Scenario: Replay under a new timestamp
- **WHEN** the server serves last month's title ciphertext of a task inside an operation with today's timestamp
- **THEN** the device keeps the title it shows, records the refusal, and Settings → Encryption reads "The server sent older versions of 1 item. This device kept its own."

#### Scenario: Replay with the original timestamp
- **WHEN** the server serves an older version 2 title with its original timestamp to a device that holds a newer title
- **THEN** last-writer-wins keeps the newer title and nothing is recorded

#### Scenario: Downgrade to version 1
- **WHEN** the server serves a version 1 ciphertext of a title the device holds as version 2, in an operation that would win
- **THEN** the device keeps its title and records the refusal

#### Scenario: A new device
- **WHEN** a device unlocks for the first time and pulls the account
- **THEN** it applies every winning authentic value, of either version, and records nothing

#### Scenario: Revision history
- **WHEN** the history page shows a change whose version 2 value carries a stamp other than the change's timestamp
- **THEN** that value reads "[Cannot decrypt]"

### Requirement: Existing ciphertext is re-sealed with a stamp
After the release in which writers write version 2, the next unlocked device that completes a sync SHALL re-seal every content value of the personal scope that the server holds as version 1, through ordinary operations of the re-write job, resumable after a reload and skipping values already in version 2. Two devices doing it at once SHALL produce ciphertexts of the same plaintext, of which one wins. From that release the server SHALL refuse new version 1 values for an encrypted account (409 `ciphertext_outdated`), so that an older app, `ot` or plugin names the update instead of writing values devices refuse. Values of version 1 SHALL stay readable. Offline, the re-seal waits for a complete sync, as the catch-up does.

#### Scenario: Re-seal after the update
- **WHEN** an unlocked device of an account with 500 encrypted tasks updates to the writer release and syncs
- **THEN** it re-seals their content as version 2 with progress in Settings, and a second device that syncs afterwards writes nothing again

#### Scenario: An older ot writes version 1
- **WHEN** an `ot` older than the reader release writes a version 1 title for an encrypted account after the writer release
- **THEN** the server answers 409 `ciphertext_outdated` and `ot` shows that it needs an update

#### Scenario: An older app meets version 2
- **WHEN** an app, `ot` or Obsidian plugin older than the reader release receives a version 2 title
- **THEN** it shows the title as undecryptable and never writes the placeholder back

### Requirement: Devices notice an older key record
A device SHALL remember the newest key record it adopted (its creation time and version), across turning encryption off and until sign-out. When the server serves a record with an earlier creation time, or with the same creation time and a lower version, the device SHALL keep using its cached record, SHALL NOT stop sync, the re-send after a server restore or any account action, and SHALL say so in Settings → Encryption with an action that uploads its own record as the next version. A passphrase change or reset while an older record is served SHALL replace that record. A record returned by the device's own upload SHALL always be adopted. The record's version and creation time are not authenticated, so this notices an older record served unchanged only. Offline, the cached record is used as before.

#### Scenario: Passphrase change rolled back
- **WHEN** the passphrase was changed (record version 2) and the server later serves the version 1 record again
- **THEN** the device keeps the version 2 record, the old passphrase does not unlock it, sync goes on, and Settings offers "Upload this device's key record"

#### Scenario: Server restored from an older backup
- **WHEN** the server is restored from a backup made before the last passphrase change
- **THEN** the device warns about the older record and still re-sends its data, encrypted, to the restored server

#### Scenario: Uploading this device's record
- **WHEN** the user chooses "Upload this device's key record" and confirms that it replaces the server's record
- **THEN** the server stores this device's record as the next version, the warning goes, this device stays unlocked, and other devices adopt it on their next refresh without locking

#### Scenario: Uploading over an earlier enablement's record
- **WHEN** the server served the record of an earlier time encryption was on and the user uploads this device's record
- **THEN** the server gives it a fresh creation time, this device and the other devices of the current account key stay unlocked, and a device of another account key locks as before

#### Scenario: Restore after the server lost the record
- **WHEN** the server lost the key record and the user restores it from this device
- **THEN** the device adopts the new record the server returns and other devices adopt it on their next refresh

## REMOVED Requirements

### Requirement: Ciphertext rollback is a documented limit
**Reason**: Devices now refuse a field's older ciphertext (version 2 stamps bound to the operation's timestamp) and notice an older key record served unchanged.
**Migration**: The threat model lists rollback as defended, with the remaining limits: a device that never held the newer value, a server that withholds the newest operations, and a server that shows different histories to different devices ("Devices refuse an older ciphertext").
