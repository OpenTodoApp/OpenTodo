## ADDED Requirements

### Requirement: Other clients' deleted messages are never expunged
The poller SHALL remove its processed messages from the mailbox only with `UID EXPUNGE` (UIDPLUS) or `UID MOVE`, which affect only those messages. On a server with neither, it SHALL NOT send a bare `EXPUNGE`: processed messages SHALL stay in the mailbox flagged `\Seen` and `\Deleted` (with their copy in the processed folder when moving) and SHALL NOT be handled again.

#### Scenario: Server without UIDPLUS
- **WHEN** the mail server has no UIDPLUS or MOVE and another mail client flagged a message `\Deleted` without expunging it
- **THEN** after a poll that message is still in the mailbox, the processed message is flagged `\Seen` and `\Deleted`, and the next poll does not handle it again
