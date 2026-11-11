## MODIFIED Requirements

### Requirement: Digest settings route
`GET` and `PUT /api/v1/me/email-digest` SHALL read and set the caller's digest: `enabled`, `weekday` (0–6, 0 = Sunday), `hour` (0–23), `timeZone` (an IANA zone) and `language` (one of `en`, `de`, `fr`, `es`, `it`, `pt`, `zh`). They SHALL require a session or full-access token. The settings are server data, never synced, and need a connection; the message goes to the account's email address. Storing `zh` is that same server write, not an operation: an offline client cannot save it, and nothing converges because the value never enters the op log.

#### Scenario: Enable
- **WHEN** a user puts `{"enabled":true,"weekday":5,"hour":7,"timeZone":"Europe/Zurich","language":"de"}` on a server with outgoing email
- **THEN** the response is 200 with the stored values and `nextSendAt`, and `GET` returns the same

#### Scenario: Outgoing email unavailable
- **WHEN** outgoing email is not configured
- **THEN** `PUT` answers 404 `smtp_disabled`, `GET` reports `available: false`, and the app shows that the digest needs outgoing email configured by the owner

#### Scenario: Demo instance
- **WHEN** the instance runs in demo mode
- **THEN** `PUT` is refused with 403 `demo_restricted`, `GET` reports `available: false`, and no digest is ever sent

#### Scenario: Encrypted account refused
- **WHEN** an account with end-to-end encryption puts `enabled: true`
- **THEN** the response is a 409 `encryption_enabled` error explaining that the digest would contain task titles, and nothing is stored

#### Scenario: Invalid input
- **WHEN** the body has an unknown time zone, an hour outside 0–23 or an unsupported language
- **THEN** the response is a 400 `invalid_input` error naming the field

#### Scenario: Anonymous or limited token
- **WHEN** a request without credentials, or with a `read` or `agent` token, calls either route
- **THEN** the response is 401 `unauthorized` or 403 `insufficient_scope`

#### Scenario: Simplified Chinese
- **WHEN** a user puts `{"enabled":true,"weekday":1,"hour":8,"timeZone":"Asia/Shanghai","language":"zh"}` on a server with outgoing email
- **THEN** the response is 200 with `language` `zh`, and `GET` returns the same

#### Scenario: Offline
- **WHEN** the device is offline and the user saves the digest with `language` `zh`
- **THEN** the save does not succeed and nothing is stored

### Requirement: Digest words for tasks that are late
The digest SHALL head the list of open tasks due before the send day "Still open from earlier" and SHALL NOT use the word "overdue" or its translation in any of its languages; the list itself (up to 15 tasks with due date and project) and the digest's numbers are unchanged. The wording SHALL be pinned by the golden files of every language.

#### Scenario: Heading in English
- **WHEN** a user with two tasks due before the send day receives the digest in English
- **THEN** the section is headed "Still open from earlier" and lists the two tasks with their dates and projects

#### Scenario: Every language
- **WHEN** the digest is rendered in each of the seven languages for the test fixture
- **THEN** no rendering contains the word "overdue" or its translation, and each matches its golden file
