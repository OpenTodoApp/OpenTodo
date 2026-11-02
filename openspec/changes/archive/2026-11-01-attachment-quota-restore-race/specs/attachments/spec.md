# Spec Delta

## MODIFIED Requirements

### Requirement: Per-file and per-account limits
The server SHALL enforce a per-file limit (default 25 MB, 1–2048) and a per-account quota (default 1024 MB, 0 for unlimited), set by the owner and optionally preset once with `OPENTODO_ATTACHMENTS_MAX_FILE_MB` and `OPENTODO_ATTACHMENTS_QUOTA_MB`. The quota counts the stored bytes of the account's non-removed attachments. A creation whose size exceeds the per-file limit SHALL be rejected at receipt so no device ever shows it. An upload in progress SHALL hold its size against the quota until it ends, so parallel uploads cannot together go over it. Restoring a removed attachment whose file is stored SHALL be rejected with reason `quota_exceeded` when it would take its author over the quota, counting the uploads in progress; a restore that fits SHALL hold its size until it is stored, so an upload and a restore that overlap cannot together go over the quota. The device reverts a rejected restore and shows the reason, and devices converge on the attachment staying removed.

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

#### Scenario: Restore during an upload
- **WHEN** an account has room for one more 1 MB file, a 1 MB upload is in progress, and a device restores a removed 1 MB attachment
- **THEN** the restore is rejected with reason `quota_exceeded`, the upload is stored, and the account's usage stays within the quota

#### Scenario: Parallel uploads
- **WHEN** an account with room for one more 10 MB file starts two 10 MB uploads at the same time
- **THEN** one is stored and the other answers 403 `quota_exceeded`

#### Scenario: Invalid preset
- **WHEN** `OPENTODO_ATTACHMENTS_MAX_FILE_MB=huge` is set
- **THEN** the process exits non-zero with a message naming the variable
