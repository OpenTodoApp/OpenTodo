# account-profile Specification

## Purpose
Each person, the owner included, keeps their own profile in Settings: the name others see, the email address used to sign in and for mail (changed only from a recently confirmed session), and a profile picture cropped to a circle in the browser and shown wherever their avatar appears.

## Requirements

### Requirement: Profile in Settings
Settings → Account SHALL open with a Profile card holding the user's picture (or initials), name and email, each with an edit action. Every user SHALL be able to change their own name, email and picture; changing another account's profile is not part of this capability. Profile data is server-side account data, not operations: changing it SHALL need a connection, and offline the card SHALL show the last loaded values with the edit actions disabled and a note that a connection is needed.

#### Scenario: Offline
- **WHEN** the user opens Settings → Account without a connection
- **THEN** the Profile card shows the last loaded name, email and picture, and the edit actions are disabled with a note

### Requirement: Changing the name
`PATCH /api/v1/me/profile` with `name` (1 to 80 characters after trimming, no control characters) SHALL change the signed-in user's display name, SHALL require a session or a `full` token, SHALL be denied on the demo instance, and SHALL answer the updated profile. The new name SHALL appear wherever the account is named (comments, assignees, members, the account menu) on every device after its next refresh of account data. Errors: `unauthorized`, `invalid_input`.

#### Scenario: Rename
- **WHEN** a user changes their name from "Raffa" to "Raffaele"
- **THEN** the account menu shows "Raffaele" at once, a member of a shared project sees "Raffaele" on their comments after the next sync, and `account.name_changed` is recorded

#### Scenario: Empty name refused
- **WHEN** the request carries a name of only spaces
- **THEN** the response is 400 `invalid_input` naming `name` and the name is unchanged

#### Scenario: Without a session
- **WHEN** a request without credentials sends a new name
- **THEN** the response is 401 `unauthorized`

### Requirement: Changing the email
`POST /api/v1/me/email` with the new address SHALL require a recently confirmed session (the `recent` route policy), SHALL be denied on the demo instance, and SHALL refuse an address another account uses (`email_taken`) or that is not a valid address (`invalid_input`). When outgoing email is configured and the server has a base URL, the server SHALL store the address as pending, send a confirmation link valid for 24 hours to the new address and a notice to the old one, and change the email only when the link is opened by the same account (`POST /api/v1/me/email/confirm` with the link's token, which answers `invalid_token` when it is unknown, used or expired); a newer request replaces a pending one. Without outgoing email the change SHALL apply at once after the recent confirmation. The sign-in email is what changes; existing sessions stay signed in. An account that signs in only through single sign-on SHALL see its email as managed by the provider and SHALL not be offered the change. Errors: `unauthorized`, `reauth_required`, `email_taken`, `invalid_input`, `rate_limited` (at most 5 requests per hour per account).

#### Scenario: Confirmed by link
- **WHEN** a user on a server with outgoing email changes their email to `new@example.com` after confirming their password
- **THEN** the card shows "Waiting for confirmation: new@example.com", the old address gets a notice, and after the user opens the link the email is `new@example.com` and sign-in with it works

#### Scenario: Without outgoing email
- **WHEN** the server has no outgoing email and a user changes their email after confirming their password
- **THEN** the email changes at once and `account.email_changed` is recorded

#### Scenario: Address in use
- **WHEN** the new address belongs to another account
- **THEN** the response is 409 `email_taken` and nothing is sent

#### Scenario: Stale session
- **WHEN** the session was confirmed more than the recent window ago
- **THEN** the response is 403 `reauth_required` and the client asks for the password or a passkey before retrying

#### Scenario: Without a session
- **WHEN** a request without credentials posts a new email address, or opens a confirmation link while signed in as another account
- **THEN** the response is 401 `unauthorized` (or, for the link, 403 `forbidden`) and the email is unchanged

### Requirement: Profile picture
A user SHALL be able to set a profile picture: the client SHALL let them choose a PNG, JPEG or WebP image of at most 10 MB, show a circular crop with zoom and pan (keyboard: arrow keys pan, `+` and `-` zoom), and upload the crop as a 256×256 JPEG or PNG to `PUT /api/v1/me/avatar` (at most 512 KB). The server SHALL decode the image, refuse anything that is not a 256×256 PNG or JPEG (`invalid_input`), re-encode it as JPEG so no metadata (such as a location) is kept, and store it under `<data>/avatars/<account id>.jpg`, included in backups and in the account's export archive. `DELETE /api/v1/me/avatar` SHALL remove it. Both routes SHALL require a session or a `full` token and be denied on the demo instance. `GET /api/v1/users/{id}/avatar` SHALL serve the picture to the account itself and to accounts that share a project or a workspace with it, with a version in the URL so it can be cached for a year, and SHALL answer 404 to anyone else. The picture SHALL be drawn as a circle wherever the account's initials are drawn today, with the initials as the fallback while it loads, offline, or when there is none. The picture is account data, not task content: it is not end-to-end encrypted, and the encryption settings say so.

#### Scenario: Crop and upload
- **WHEN** a user picks a 4000×3000 photo, zooms in on their face and saves
- **THEN** the account menu, their comments and their assignee chips show the round picture, and the stored file is a 256×256 JPEG without metadata

#### Scenario: Remove
- **WHEN** the user removes their picture
- **THEN** their initials are shown again everywhere and the file is deleted

#### Scenario: Not shared
- **WHEN** an account that shares no project or workspace with the user requests their picture
- **THEN** the response is 404

#### Scenario: Wrong file
- **WHEN** the upload is a 1024×1024 PNG or a GIF
- **THEN** the response is 400 `invalid_input` and the previous picture stays

#### Scenario: Upload without a session
- **WHEN** a request without credentials puts a picture
- **THEN** the response is 401 `unauthorized` and nothing is stored

#### Scenario: Too large
- **WHEN** the upload is larger than 512 KB
- **THEN** the response is 413 `too_large` and the previous picture stays
