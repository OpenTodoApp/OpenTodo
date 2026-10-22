## MODIFIED Requirements

### Requirement: Upload confirmation is server-authoritative
`uploaded_at` SHALL be written only by the server, as an operation with device `server`, once the file is stored, so every device learns through ordinary sync that the bytes are available. The server's operation SHALL carry a timestamp greater than the field's current winning timestamp, so it wins whatever clock the device that created the row had; an upload whose confirmation could not be recorded SHALL NOT answer success. `/api/v1/sync` SHALL refuse submitted operations whose device is `server`, and the server SHALL reject any device-written `uploaded_at`. Until it is set, clients show the attachment as uploading and offer no download.

#### Scenario: Other device sees availability
- **WHEN** a phone uploads a file and a laptop syncs afterwards
- **THEN** the laptop shows the attachment as available and can open it

#### Scenario: Device clock ahead
- **WHEN** a phone whose clock runs 90 seconds ahead of the server creates an attachment and uploads its bytes
- **THEN** the response is 204, the attachment is listed as uploaded, and the phone itself receives `uploaded_at` on its next sync

#### Scenario: Forged confirmation
- **WHEN** a device submits an `uploaded_at` operation, or any operation with device `server`
- **THEN** the sync request is refused with 400 `invalid_op` or the operation is rejected, and the attachment stays not uploaded
