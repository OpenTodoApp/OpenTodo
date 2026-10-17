# Spec Delta

## ADDED Requirements

### Requirement: Link attachments follow the encryption mode
Turning encryption on SHALL move the account's personal link attachments to ciphertext, and turning it off SHALL move them back to plaintext. Since the server fixes a link's address at creation, each link SHALL be replaced in one batch by a copy in the new form while the old one moves to the Trash. This SHALL work offline, upload on the next sync and never replace a link twice; links in shared projects SHALL stay unchanged.

#### Scenario: Enable with an existing link
- **WHEN** a personal task has a link attachment and the user turns encryption on
- **THEN** after the next sync the server holds one live link for the task whose address and name are ciphertext, the plaintext link is in the Trash, and the device shows the same address and name

#### Scenario: Disable with an encrypted link
- **WHEN** the user turns encryption off on an account with an encrypted personal link
- **THEN** after the next sync the server holds one live link for the task whose address and name are plaintext

#### Scenario: Nothing left to migrate
- **WHEN** the migration has run and is started again
- **THEN** no link is replaced again
