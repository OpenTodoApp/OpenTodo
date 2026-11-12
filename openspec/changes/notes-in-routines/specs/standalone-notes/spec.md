## MODIFIED Requirements

### Requirement: Integrations that leave notes out
CalDAV, the Markdown vault, webhooks, the activity feed, automation rules and public task pages SHALL not include standalone notes and SHALL be unaffected by them.

#### Scenario: Calendar app
- **WHEN** a calendar app syncs the account over CalDAV
- **THEN** it receives the tasks as before and no entry for any note

#### Scenario: Webhook
- **WHEN** a note is created in a project with a webhook
- **THEN** no webhook delivery is queued for it

