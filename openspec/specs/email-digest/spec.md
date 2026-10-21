# email-digest Specification

## Purpose
An opt-in weekly email digest per user, sent on the user's review day: last week's numbers, what is overdue and due soon, projects without a next action, and a link to the review. Sent through `outgoing-email`; never for encrypted accounts.

## Requirements

### Requirement: Digest settings route
`GET` and `PUT /api/v1/me/email-digest` SHALL read and set the caller's digest: `enabled`, `weekday` (0–6, 0 = Sunday), `hour` (0–23), `timeZone` (an IANA zone) and `language` (one of the six supported). They SHALL require a session or full-access token. The settings are server data, never synced, and need a connection; the message goes to the account's email address.

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

### Requirement: Digest schedule
The server SHALL send a user's digest once per chosen weekday, within 15 minutes after the chosen hour in the user's time zone, from the jobs leader only. A send that fails SHALL be retried at later passes, at most every 15 minutes, for up to six hours after the hour, then skipped and recorded as `email.failed`. A restart SHALL NOT send a second digest for the same day.

#### Scenario: Sent once
- **WHEN** Friday 07:00 Europe/Zurich passes with the digest enabled
- **THEN** one `digest` message is sent before 07:15 local time and `email.sent` with kind `digest` is recorded, and no second message is sent that day even after a restart

#### Scenario: Relay down for an hour
- **WHEN** the SMTP server is unreachable from 07:00 to 08:00
- **THEN** the digest is sent by the first retry after 08:00 (no later than 08:15) and one `email.failed` per failed attempt is recorded

### Requirement: Digest in host mode
In host mode (multi-tenant-host) each tenant user SHALL opt in to the digest for themselves, and the host's shared scheduler SHALL send it through the operator's outgoing email, opening the tenant only when a digest is due.

#### Scenario: Digest in a closed tenant
- **WHEN** a hosted tenant is closed and one of its users' digest hour passes while the operator has configured outgoing email
- **THEN** the host opens the tenant, sends one `digest` message, and indexes the next one a week later

### Requirement: Digest content
The digest SHALL contain: completed, created, completed late and slipped for the last full week by the user's week start; overdue tasks (up to 15, with due date and project); tasks due in the next seven days (up to 15); projects with no open task (up to 10); when the last review was; and a link to `/review`. It SHALL be plain text in the stored language, with no other person's data beyond names already visible to the user.

#### Scenario: Content
- **WHEN** a user completed 12 tasks last week, has 2 overdue and 1 project without a next action
- **THEN** the digest states those numbers, lists the 2 tasks and the project, says when the last review was, and ends with the review link

### Requirement: Digest numbers match the statistics
The digest's numbers and lists SHALL follow the same definitions as `statistics`, including whose tasks count in shared projects, the exclusion of skipped habit occurrences and the user's day start (the day a completion counts for begins at the user's `day_start` in the digest's time zone, midnight when unset or invalid), pinned by a fixture that the device and the server both evaluate.

#### Scenario: Shared project tasks
- **WHEN** an overdue task lives in a shared project and is assigned to another member
- **THEN** it is not listed; tasks assigned to the user or unassigned in their projects are

#### Scenario: Same numbers as the screen
- **WHEN** the shared fixture is evaluated by the device and by the server
- **THEN** both produce the same completed, created, late and slipped counts

#### Scenario: Night owl's week
- **WHEN** a user with a day start of `04:00` completed a task at 01:30 on the Monday that starts a new week, and the digest for the previous week is built
- **THEN** the completion counts in the previous week, as the Statistics screen shows it, and the fixture holds this case

#### Scenario: No day start stored
- **WHEN** the user's preferences row has no `day_start` or an invalid one
- **THEN** the digest counts days from midnight in the digest's time zone, as before

### Requirement: Encryption turns the digest off
Enabling end-to-end encryption SHALL disable the user's digest and SHALL be reported in the response; a digest is never built for an account with encryption on, and the server records `email.failed` with reason `encrypted_account` if a scheduled send meets such an account.

#### Scenario: Enable encryption with a digest on
- **WHEN** a user with the digest enabled turns on encryption
- **THEN** the digest is disabled, the encryption screen says so, and no digest is sent afterwards

### Requirement: Digest card in Settings
Settings → Notifications SHALL show a Weekly digest card that leads with its state (off; or on, weekday and hour, and the last send's outcome), opens weekday and hour from an action, captures the time zone and language from the browser when saving and shows them, and explains when the digest is unavailable (no outgoing email, encrypted account, demo). Offline the card SHALL say it needs a connection.

#### Scenario: Turn on
- **WHEN** a user turns the digest on and picks Friday 07:00
- **THEN** the card reads "On, Fridays at 07:00 (Europe/Zurich)" after saving and names the next send

#### Scenario: Unavailable
- **WHEN** the server has no outgoing email
- **THEN** the card explains that the owner has to configure outgoing email first and offers no switch

#### Scenario: Encrypted account
- **WHEN** an encrypted account opens Notifications
- **THEN** the card says the digest is not available for encrypted accounts because it would contain task titles
