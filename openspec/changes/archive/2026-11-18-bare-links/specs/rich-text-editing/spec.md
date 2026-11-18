## ADDED Requirements

### Requirement: Bare addresses read as links
In the rich-text editor, an `http(s)` address in a note's text, outside code and outside a link, SHALL read as a link that Ctrl/Cmd-click opens in a new tab, by the same rule the read-only views use, while the note SHALL keep the address as typed. A pasted plain-text address SHALL stay text, and a pasted link whose text is its own address (a trailing slash aside) SHALL be kept as the bare address; a pasted link with other text SHALL stay a link.

#### Scenario: Typed address
- **WHEN** the user types `see https://example.com today` in a note
- **THEN** the address reads as a link that Ctrl/Cmd-click opens, and the note's Markdown is `see https://example.com today`

#### Scenario: Pasted link from another app
- **WHEN** the user pastes a link whose text is `https://example.com` and whose address is `https://example.com/`
- **THEN** the note holds the bare address `https://example.com` and shows it as a link

#### Scenario: Address in code
- **WHEN** a note has `https://example.com` inside inline code or a code block
- **THEN** it does not read as a link

## MODIFIED Requirements

### Requirement: Images from attachments
Dropping or pasting an image into the editor, or choosing Image from the slash menu, SHALL attach the file to the task through the attachments capability and insert an image node that names the attachment, as one undoable change; the editor SHALL show the image from the app's own authenticated attachment route, or from the bytes decrypted on the device for an encrypted account, a placeholder with the file name while the attachment is uploading or waiting, "Encrypted image" on a locked device, and "Removed image" when the attachment was removed. Images SHALL have an editable alternative text, SHALL be selectable and deletable from the keyboard, and SHALL never be loaded from an address outside the app's origin; an image address pasted from the web SHALL become a link.

#### Scenario: Paste a screenshot into a note
- **WHEN** the user pastes an image from the clipboard while the caret is in the notes
- **THEN** an attachment named with the date and `.png` is created and queued, the note shows the image at the caret, the projection contains `![…](attachment:<id>)`, and another device shows the image once the bytes are uploaded and it has synced

#### Scenario: Encrypted account
- **WHEN** an encrypted account embeds a photo and opens the note on another unlocked device
- **THEN** the device downloads the encrypted bytes, decrypts them and shows the image, and the server served only ciphertext

#### Scenario: Attachment removed
- **WHEN** the embedded attachment is removed from the task
- **THEN** the note shows "Removed image" in its place on every device and the user can delete the placeholder

#### Scenario: Web image stays a link
- **WHEN** the user pastes `https://example.org/photo.jpg`
- **THEN** the note keeps the bare address, which reads as a link, no image is loaded, and no request is made to example.org
