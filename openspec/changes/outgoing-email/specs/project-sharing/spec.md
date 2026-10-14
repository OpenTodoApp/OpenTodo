# Spec Delta

## MODIFIED Requirements

### Requirement: Project invite link creation
The project's owner or an admin SHALL create a single-use link through `POST /api/v1/projects/{id}/invites` with role `viewer` or `editor` (`admin` only for the owner), an optional email and an expiry of 1–720 hours (default 168). The secret SHALL be returned once and stored only as a hash. With `"send": true`, an email and outgoing email configured, the server SHALL also mail the link to that address. Links are server-side data, never ops: they never sync and need a connection.

#### Scenario: Owner creates a link
- **WHEN** the owner posts `{"role":"editor"}` to the project's invites route
- **THEN** the response is 201 with the link's `id`, `role`, `expiresAt` and a `link` ending in `/invite/p/<secret>` that is never returned again

#### Scenario: Link sent by email
- **WHEN** the owner posts `{"role":"editor","email":"bob@example.com","send":true}` on a server with outgoing email
- **THEN** the response is 201 with the link and `sent: true`, bob@example.com receives a `project_invite` message naming the inviter and the project's role but not the project's name, and `project_invite.created` and `email.sent` are recorded

#### Scenario: Send without an email, unconfigured or failing
- **WHEN** `send` is true without an `email`, or outgoing email is not configured, or the message cannot be sent
- **THEN** the response is 400 `invalid_input`, 409 `smtp_disabled` or 502 `email_failed` respectively and no pending link remains

#### Scenario: Admin cannot grant admin
- **WHEN** a project admin creates a link with role `admin`
- **THEN** the response is a 403 `forbidden` error and no link exists

#### Scenario: Viewer, editor or stranger
- **WHEN** a viewer or editor of the project posts to the invites route, or a non-member does
- **THEN** the viewer or editor gets 403 `forbidden`, the non-member 404 `not_found`, and no link is created

#### Scenario: Anonymous or limited token
- **WHEN** a request without credentials, or with a `read` or `agent` API token, posts to the invites route
- **THEN** the response is 401 `unauthorized` or 403 `insufficient_scope` and no link is created

#### Scenario: Invalid input
- **WHEN** the body has an unknown role, `expiresInHours` outside 1–720 or an invalid `email`
- **THEN** the response is a 400 `invalid_input` error naming the field

### Requirement: Invite links in the share dialog
The share dialog SHALL offer the owner and admins an "Invite with a link" section: role, optional email and expiry, a created link shown once with a copy button and a notice, whether it can create accounts, and the pending links with revoke. When outgoing email is configured and an email is given, it SHALL offer "Send by email", on by default. Every action SHALL work with the keyboard. Offline, the controls SHALL be disabled with an explanation.

#### Scenario: Create and copy
- **WHEN** the owner creates a link in the share dialog
- **THEN** the link is shown with a copy button and a notice that it will not be shown again, and it appears in the pending list

#### Scenario: Create and send
- **WHEN** outgoing email is configured and the owner creates a link for bob@example.com with "Send by email" on
- **THEN** the dialog says the link was sent to bob@example.com, shows it once with its copy button, and lists it as pending

#### Scenario: Viewer sees no section
- **WHEN** a viewer or editor opens the member list
- **THEN** no "Invite with a link" section is shown

#### Scenario: Offline
- **WHEN** the dialog is opened without a network connection
- **THEN** creating and revoking are disabled and a message says invite links need a connection
