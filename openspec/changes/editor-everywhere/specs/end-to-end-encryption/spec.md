## ADDED Requirements

### Requirement: Reactions, note mentions and embedded images under encryption
For an encrypted account, a comment's reaction fields and a task's `note_mentions` id list SHALL stay plaintext (they name accounts and one of six reaction names, never text the user wrote), while mentions, tables, images and every other node inside `notes_doc` and a comment's body SHALL be inside the ciphertext as today. An embedded image SHALL be shown only after the device has decrypted the attachment's bytes; the server SHALL serve ciphertext only, and a locked device SHALL show "Encrypted image" in its place. The documented field split SHALL name reactions and note mentions among the plaintext fields.

#### Scenario: Reaction on an encrypted account's comment
- **WHEN** an encrypted account reacts to its own comment
- **THEN** the `reactions.<id>` operation carries the plaintext list `["heart"]` and the comment's `body` stays ciphertext

#### Scenario: Mention inside the ciphertext
- **WHEN** an encrypted account writes `@Me` in a personal note
- **THEN** `notes_doc` and `description` are ciphertext, `note_mentions` is the empty plaintext list (personal task), and the server learns nothing of the mention

#### Scenario: Embedded image on a locked device
- **WHEN** a locked device of an encrypted account opens a note that embeds a photo
- **THEN** the note shows "Encrypted image" where the photo belongs and no plaintext is requested or shown
