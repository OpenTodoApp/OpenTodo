## MODIFIED Requirements

### Requirement: Guest replies become comments
`POST /api/v1/pages/{secret}/replies` with `{name, body}` (body 1–4000 characters of plain text, rendered as Markdown without images) SHALL, for a page with reply rights on a task the server can read, write a comment on the task as operations authored by the publisher with device `page:<page-id>`, the guest's name in `guest_name`, the page id in `page_id` and server time, through the same path as an API write. Devices receive it on their next sync, it converges like any comment, and the members' devices are woken. Only the server's page writer, and the publisher's device importing a reply to an encrypted page, SHALL write `guest_name` and `page_id`: a device SHALL set them only on a comment it creates, with `page_id` naming a page of that comment's task the writer published, and SHALL NOT change them on a stored comment. A guest SHALL NOT edit or delete a reply after sending it; the task's owner and the project's admins can delete it as any comment.

#### Scenario: Reply
- **WHEN** a guest posts `{"name":"Marco","body":"Done the first coat, need more paint"}`
- **THEN** the response is 201, the task has the comment by "Marco (guest)" on every member device after its next sync, and the stored op carries device `page:<page-id>`

#### Scenario: Guest marks from another member
- **WHEN** a member who did not publish the page syncs a comment on its task with `guest_name` and `page_id` set
- **THEN** both fields are refused, and the comment is stored as the member's own

#### Scenario: Read-only page
- **WHEN** a guest posts a reply to a page with `view` rights
- **THEN** the response is 403 `forbidden` and nothing is written

#### Scenario: Invalid reply
- **WHEN** the body is empty or longer than 4000 characters, or the name is missing or longer than 40 characters
- **THEN** the response is 400 `invalid_input` naming the field and nothing is written

#### Scenario: Invalid page
- **WHEN** the secret is unknown, revoked or expired
- **THEN** the response is 404 `page_invalid` and nothing is written
