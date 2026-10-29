## MODIFIED Requirements

### Requirement: Link attachments
An attachment MAY carry a link instead of a file. A link attachment SHALL have an `http` or `https` URL, no stored bytes, size zero, SHALL not count toward any quota, and SHALL be shown as a link that opens in a new tab without referrer. The app SHALL open a link attachment only when its URL, as the device reads it after any decryption, is `http` or `https`: the server cannot check an encrypted URL. Link metadata syncs and converges like every other attachment field.

#### Scenario: Attach a link
- **WHEN** a user attaches `https://example.org/spec.pdf` to a task
- **THEN** the task lists a link attachment named after the URL's last path segment, opening in a new tab with `rel="noopener noreferrer"`

#### Scenario: Unsafe scheme
- **WHEN** a device submits a link attachment whose URL scheme is `javascript`
- **THEN** the operation is rejected as invalid and nothing is stored

#### Scenario: Unsafe scheme inside an encrypted value
- **WHEN** an encrypted account's link attachment decrypts on the device to a `javascript:` or `data:` URL
- **THEN** opening it does nothing, and no page or script runs

### Requirement: Download
`GET /api/v1/attachments/{id}/content` SHALL stream the stored bytes of an attachment the caller can read, support range requests, send the stored size, a strong validator derived from the digest and `Cache-Control: private, no-cache`, so the browser may keep a copy but revalidates it with the server (a 304 while signed in) before every use. Signing out SHALL answer with `Clear-Site-Data: "cache"`, so a browser that honours it drops its cached files and pictures of the site. It SHALL require a session or token and SHALL not reveal whether an unreadable id exists.

#### Scenario: Member downloads
- **WHEN** a viewer of a shared project requests the content of an uploaded attachment of one of its tasks
- **THEN** the response is 200 with the bytes, their length, a validator and the headers of the safe-serving requirement

#### Scenario: Anonymous request
- **WHEN** a request without credentials asks for an attachment's content
- **THEN** the response is 401 `unauthorized`

#### Scenario: Not uploaded or unreadable
- **WHEN** the attachment has no stored file yet, is removed, or belongs to a scope the caller cannot see
- **THEN** the response is 404 `not_found` in every case

#### Scenario: Range request
- **WHEN** a video player requests bytes 0–1048575 of a 40 MB attachment
- **THEN** the response is 206 with exactly that range

#### Scenario: Cached copy after sign-out
- **WHEN** a user viewed an image attachment, signed out, and someone else opens its address in the same browser
- **THEN** the browser cannot show the file without revalidating it, and the server answers 401 `unauthorized`

### Requirement: Per-file and per-account limits
The server SHALL enforce a per-file limit (default 25 MB, 1–2048) and a per-account quota (default 1024 MB, 0 for unlimited), set by the owner and optionally preset once with `OPENTODO_ATTACHMENTS_MAX_FILE_MB` and `OPENTODO_ATTACHMENTS_QUOTA_MB`. The quota counts the stored bytes of the account's non-removed attachments. A creation whose size exceeds the per-file limit SHALL be rejected at receipt so no device ever shows it. An upload in progress SHALL hold its size against the quota until it ends, so parallel uploads cannot together go over it. Restoring a removed attachment whose file is stored SHALL be rejected with reason `quota_exceeded` when it would take its author over the quota; the device reverts the restore and shows the reason, and devices converge on the attachment staying removed.

#### Scenario: Over the per-file limit
- **WHEN** a device syncs an attachment whose size is 30 MB and the limit is 25 MB
- **THEN** the operations are rejected with reason `too_large`, the device drops the attachment and tells the user the limit

#### Scenario: Quota reached
- **WHEN** an account with 1,000 MB stored and a 1,024 MB quota uploads a 30 MB file
- **THEN** the response is 403 `quota_exceeded` naming the remaining space, nothing is stored, and the app keeps the file queued and shows the reason

#### Scenario: Removal frees quota
- **WHEN** the account removes a 100 MB attachment
- **THEN** its usage drops by 100 MB at once, even though the file stays for the retention period

#### Scenario: Restore over the quota
- **WHEN** an account removes a 100 MB attachment, fills the freed space with new uploads, and then restores the removed one
- **THEN** the restore is rejected with reason `quota_exceeded` and the attachment stays removed on every device

#### Scenario: Parallel uploads
- **WHEN** an account with room for one more 10 MB file starts two 10 MB uploads at the same time
- **THEN** one is stored and the other answers 403 `quota_exceeded`

#### Scenario: Invalid preset
- **WHEN** `OPENTODO_ATTACHMENTS_MAX_FILE_MB=huge` is set
- **THEN** the process exits non-zero with a message naming the variable
