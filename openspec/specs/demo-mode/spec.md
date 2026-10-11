# demo-mode Specification

## Purpose
Defines demo mode: a public instance with shared demo accounts, realistic data written through the op log, a nightly reset that devices recover from on their own, and features that could be abused on a public server refused with a clear error.

## Requirements

### Requirement: Demo accounts
With demo mode on, the server SHALL create on an empty data directory a hidden owner whose random password is never stored or shown, and SHALL ensure two member accounts exist: the public demo account and a second demo member. Startup SHALL be idempotent. The demo account SHALL NOT be the owner, so owner-only settings stay at their defaults.

#### Scenario: First start
- **WHEN** a server with demo mode on starts on an empty data directory
- **THEN** three accounts exist: the hidden owner, the demo account and the second member, the demo account has the member role

#### Scenario: Restart
- **WHEN** the server restarts with demo mode on
- **THEN** no account is created twice

### Requirement: Seeded demo data
The server SHALL seed the demo accounts with projects, sections, a sub-project, labels, recurring tasks, subtasks, comments, a shared project with the second member, saved views, a dashboard, reminders, completed and trashed items. Every write SHALL go through the op log with server ops; due dates SHALL be relative to the day of seeding. Devices receive the data by normal sync, so offline and convergence behavior is that of any server write.

#### Scenario: Data goes through the op log
- **WHEN** the demo data has been seeded
- **THEN** every stored field is backed by an op with the same value and clock

#### Scenario: Fresh dates
- **WHEN** the data is seeded on any day
- **THEN** tasks due today, overdue and upcoming exist relative to that day

### Requirement: Nightly reset
The server SHALL wipe and reseed the demo accounts' data every day at 03:00 UTC and at startup when the last seed predates the most recent 03:00 UTC. Removed entities SHALL get purge markers and removed shared projects leave the membership list, so a device drops its copy on its next sync, offline edits of removed entities are discarded, and all devices converge. Sessions SHALL survive.

#### Scenario: Connected device recovers
- **WHEN** the reset runs while a signed-in browser is open
- **THEN** its next sync removes the old data, shows the new seed and the session stays valid

#### Scenario: Offline edit of wiped data
- **WHEN** a device queued an edit for a task before the reset and syncs afterwards
- **THEN** the edit is discarded and the task does not reappear

#### Scenario: Missed reset
- **WHEN** the server was stopped at 03:00 UTC and starts later that day
- **THEN** it resets the data before serving requests

### Requirement: Restricted features
With demo mode on, requests to sign-up, invitations, user administration, password change or reset, API tokens, app passwords, CalDAV, passkeys, two-factor, server settings, backups, webhooks, email to task, import, end-to-end encryption, web push, sharing changes and MCP SHALL be refused with 403 `demo_restricted` before authentication. The server SHALL make no outbound request. Rate limits SHALL stay.

#### Scenario: Refused while signed in
- **WHEN** the signed-in demo account POSTs to `/api/v1/tokens`
- **THEN** the response is 403 with error code `demo_restricted` and no token exists

#### Scenario: Refused without authentication
- **WHEN** an anonymous client POSTs to `/api/v1/auth/register`
- **THEN** the response is 403 `demo_restricted` and no account is created

#### Scenario: Everyday use allowed
- **WHEN** the demo account creates, edits, completes and deletes tasks, syncs or exports
- **THEN** the requests succeed as on any instance

#### Scenario: Demo mode off
- **WHEN** demo mode is off
- **THEN** no request is ever answered with `demo_restricted`

### Requirement: Demo sign-in and banner
With demo mode on, `GET /api/v1/auth/status` SHALL include a `demo` object with the public credentials and the next reset time. The sign-in screen SHALL show the credentials and a "Try the demo" button that signs in as the demo account, the app SHALL show the banner "Demo instance — data resets every night, don't store anything private.", and Settings SHALL hide or disable restricted controls with a short note.

#### Scenario: Try the demo
- **WHEN** a visitor opens the demo instance and clicks "Try the demo"
- **THEN** they are signed in as the demo account, see the seeded data and the banner

#### Scenario: Restricted control
- **WHEN** the demo account opens Settings
- **THEN** Import is disabled and restricted sections are replaced by a note saying they are off on the demo

#### Scenario: Status without demo mode
- **WHEN** demo mode is off and the status is requested
- **THEN** the response has no `demo` field
