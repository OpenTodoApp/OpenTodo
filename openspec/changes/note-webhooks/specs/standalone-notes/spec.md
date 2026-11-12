## MODIFIED Requirements

### Requirement: Integrations that leave notes out
CalDAV, the Markdown vault, the activity feed and public task pages SHALL not include standalone notes and SHALL be unaffected by them. Routines SHALL reach standalone notes only as `routines` "Notes in routines" states. Webhooks SHALL deliver note events only as `webhooks` "Note events" states.

#### Scenario: Calendar app
- **WHEN** a calendar app syncs the account over CalDAV
- **THEN** it receives the tasks as before and no entry for any note

#### Scenario: Webhook
- **WHEN** a note is created in a project with a webhook that subscribes to no note event
- **THEN** no webhook delivery is queued for it

#### Scenario: Activity feed
- **WHEN** a note is created in a shared project
- **THEN** the project's activity feed shows no entry for it
