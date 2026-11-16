## MODIFIED Requirements

### Requirement: Upload of file bytes
`PUT /api/v1/attachments/{id}/content` SHALL accept the raw bytes of an attachment whose metadata the caller created, as a streamed request body, verify the byte count against the stored size and the digest against the stored digest, and store the file. It SHALL require authentication, SHALL refuse a second upload of an attachment that reads uploaded, SHALL mark an attachment uploaded again without reading the body when its file is already stored but it reads not uploaded, and SHALL enforce the per-file limit and the account quota before reading the body when the length is known.

#### Scenario: Upload after sync
- **WHEN** a device has synced an attachment's metadata and uploads matching bytes
- **THEN** the response is 204, the file is stored, and the attachment's `uploaded_at` is set

#### Scenario: Anonymous request
- **WHEN** a request without credentials sends bytes to the content route
- **THEN** the response is 401 `unauthorized` and nothing is stored

#### Scenario: Digest mismatch
- **WHEN** the uploaded bytes do not hash to the stored digest or their count differs from the stored size
- **THEN** the response is 400 `attachment_mismatch`, the temporary file is removed and the attachment stays not uploaded

#### Scenario: Not the author or unknown
- **WHEN** an account uploads bytes for an attachment it did not create, or for an id that does not exist in a scope it can see
- **THEN** the response is 404 `not_found` and nothing is stored

#### Scenario: Stored file, row not uploaded
- **WHEN** the author uploads bytes for an attachment whose file is stored but which reads not uploaded
- **THEN** the response is 204 and the attachment, and every copy sharing its file, reads uploaded again

#### Scenario: Already uploaded
- **WHEN** bytes are uploaded for an attachment that already has its file
- **THEN** the response is 409 `already_uploaded` and the stored file is unchanged

### Requirement: Upload confirmation is server-authoritative
`uploaded_at` SHALL be written only by the server, as an operation with device `server`, once the file is stored, so every device learns through ordinary sync that the bytes are available. The server's operation SHALL carry a timestamp greater than the field's current winning timestamp, so it wins whatever clock the device that created the row had; an upload whose confirmation could not be recorded SHALL NOT answer success. `/api/v1/sync` SHALL refuse submitted operations whose device is `server`, and the server SHALL reject any device-written `uploaded_at`, on an existing attachment whatever its value, except the author's repeat of `null` while the attachment is not uploaded. Until it is set, clients show the attachment as uploading and offer no download.

#### Scenario: Other device sees availability
- **WHEN** a phone uploads a file and a laptop syncs afterwards
- **THEN** the laptop shows the attachment as available and can open it

#### Scenario: Device clock ahead
- **WHEN** a phone whose clock runs 90 seconds ahead of the server creates an attachment and uploads its bytes
- **THEN** the response is 204, the attachment is listed as uploaded, and the phone itself receives `uploaded_at` on its next sync

#### Scenario: Forged confirmation
- **WHEN** a device submits an `uploaded_at` operation, or any operation with device `server`
- **THEN** the sync request is refused with 400 `invalid_op` or the operation is rejected, and the attachment stays not uploaded

