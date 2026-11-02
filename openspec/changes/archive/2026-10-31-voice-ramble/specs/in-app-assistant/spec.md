## ADDED Requirements

### Requirement: Photos in the composer
Where the assistant is available to the user and the effective provider reads images, the composer of the Assistant page and of the panel SHALL offer "Add photo" (a file picker that offers the camera on phones), and SHALL accept an image pasted into or dropped on the composer. It SHALL accept JPEG, PNG, WebP, GIF (first frame) and HEIC/HEIF where the browser can decode it, and refuse other files with the accepted list. Each image SHALL be prepared on the device before it is sent: turned upright, scaled so its long edge is at most 1568 px, re-encoded as JPEG without its metadata, and refused when it is still larger than 3.75 MB. At most 4 images SHALL be attached to one message; they SHALL be shown as thumbnails above the field, each with a remove button. The first time a user adds a photo on a device, the composer SHALL show a note naming the provider that receives it and saying OpenTodo does not keep it, and SHALL attach the photo only after the user confirms; the confirmation is remembered on that device only. Images SHALL belong to the one message they were sent with: the device's conversation SHALL keep a text placeholder naming how many photos were sent and that they were not kept, never the images, and later messages SHALL NOT resend them. Images SHALL never be stored on the server, synced, exported or added to tasks.

#### Scenario: Photo of meeting notes
- **WHEN** a user adds a 12-megapixel photo of handwritten notes and sends it with the `capture` skill
- **THEN** the image sent is at most 1568 px on its long edge, a JPEG without location data, and the conversation afterwards shows "1 photo (not kept)" in place of the image

#### Scenario: Fifth photo
- **WHEN** the composer already holds 4 photos and the user adds another
- **THEN** the fifth is refused with a message saying at most 4 photos go with one message

#### Scenario: Unsupported file
- **WHEN** the user drops a PDF on the composer
- **THEN** it is refused with the list of accepted image types and nothing is attached

#### Scenario: First photo on a device
- **WHEN** a user whose provider is Google Gemini adds their first photo on this device
- **THEN** a note says photos go to Google Gemini with this message and are not kept by OpenTodo, and the photo is attached only after Continue

#### Scenario: Assistant unavailable
- **WHEN** the assistant is not available to the user
- **THEN** no photo button, microphone or ramble entry is shown anywhere

#### Scenario: Offline
- **WHEN** the device is offline with photos and a transcript in the composer of a server assistant
- **THEN** the composer keeps them, says the assistant needs a connection, and sends nothing until the user sends again online

### Requirement: Images in an assistant turn
`POST /api/v1/assistant/turn` SHALL accept `images` (a list of `{media_type, data}` with `media_type` `image/jpeg`, `image/png`, `image/webp` or `image/gif` and `data` in base64) on the last user message only, at most 4 images of at most 3.75 MB each after decoding, in a request of at most 16 MB; the existing limit on the conversation's text SHALL keep applying. The server SHALL check that each image's bytes match its media type, SHALL pass the images to the provider for that turn only, and SHALL hold them only in memory: never on disk, in the database, in logs, in the audit log or in the usage record. The route's authentication, consent, concurrency and encryption rules are unchanged. Errors SHALL be `401 unauthorized` without a session, `403 session_required` for a token, `413 too_large` over a limit, `400 invalid_input` naming `images` for a wrong type or undecodable data and naming `messages` for images on an earlier message, and `422 images_unsupported` when the effective provider does not read images or the provider refuses them.

#### Scenario: Turn with a photo
- **WHEN** a consented user on Anthropic sends a message with one JPEG and the `capture` skill
- **THEN** the provider receives the image with the message, the turn streams a change set, and afterwards nothing of the image remains on the server

#### Scenario: Unauthenticated
- **WHEN** a request without credentials posts a turn with images
- **THEN** the response is 401 `unauthorized` and no provider request is made

#### Scenario: Too large
- **WHEN** a turn carries an image of 5 MB after decoding
- **THEN** the response is 413 `too_large` and no provider request is made

#### Scenario: Images on an earlier message
- **WHEN** a turn carries `images` on the first of three messages
- **THEN** the response is 400 `invalid_input` naming `messages`

#### Scenario: Wrong bytes
- **WHEN** an image declares `image/png` but its data is not a PNG
- **THEN** the response is 400 `invalid_input` naming `images`

#### Scenario: Provider without images
- **WHEN** the owner's compatible endpoint is not marked as reading images and a user sends a photo
- **THEN** the response is 422 `images_unsupported` and the composer keeps the message and the photos

#### Scenario: Encrypted account
- **WHEN** an encrypted account's session sends a turn with images
- **THEN** the response is 409 `encryption_enabled` and no provider request is made

### Requirement: Providers that read images
The server's Anthropic provider SHALL send images as image content blocks, and its OpenAI and Google Gemini providers SHALL send them as image parts in the Chat Completions format. The OpenAI-compatible provider SHALL send images only when the owner marks it with "This model reads images" (`compatible.images`, off by default) in the assistant settings; "Test connection" for it SHALL then also send a small built-in image and fail with a message saying the endpoint refused images when the request is refused. `GET /api/v1/me/assistant` SHALL report `images: true` or `false` for the provider that would answer the user's next turn, and the composer SHALL hide "Add photo" when it is false. A member's own Anthropic, OpenAI or Gemini provider SHALL be treated as reading images; a refusal by its model SHALL be answered as `images_unsupported`.

#### Scenario: Compatible endpoint marked
- **WHEN** the owner ticks "This model reads images" for a compatible endpoint and presses Test connection
- **THEN** the test sends the built-in image and reports success only when the endpoint accepts it, and users of that provider see "Add photo"

#### Scenario: Compatible endpoint not marked
- **WHEN** the owner's provider is a compatible endpoint without the mark
- **THEN** `GET /api/v1/me/assistant` reports `images: false` and no user sees "Add photo"

#### Scenario: Gemini request shape
- **WHEN** a turn with one photo goes to Google Gemini
- **THEN** the request reaches Gemini's OpenAI-compatible chat completions path with the tools, streaming on, and the photo as an image part with a `data:` URL

### Requirement: Photos with the on-device assistant
For an encrypted account using the on-device assistant, the composer SHALL offer photos and the microphone under the same rules, and the device SHALL send the prepared images directly to the provider set up on the device (image blocks to Anthropic, image parts to OpenAI, Gemini and model servers), within the same limits, keeping nothing. No image, transcript or tool result of such a turn SHALL reach the OpenTodo server; with "This server's speech service" chosen for voice, the existing statement for encrypted accounts SHALL apply to the audio.

#### Scenario: Encrypted ramble with a photo
- **WHEN** an encrypted user with the on-device assistant on Anthropic sends a photo with the `capture` skill
- **THEN** the image goes from the device to Anthropic only, the OpenTodo server receives no request for the turn, and the proposed tasks are applied as ops encrypted at upload

#### Scenario: Model server that refuses images
- **WHEN** the device's model server refuses the image part
- **THEN** the answer says the model on this device does not read photos and the message's text can be sent without them

### Requirement: Ramble from the command palette
Where the assistant is available to the user, the command palette SHALL offer "Ramble into tasks", which SHALL open the assistant (the page's composer when the Assistant page is open, otherwise the panel, a full-screen sheet on a phone) with the `capture` skill chosen and, when voice capture is on for the device, the microphone listening. It SHALL have no default keyboard shortcut and SHALL add no sidebar destination. Where the assistant is not available, the entry SHALL NOT be listed.

#### Scenario: Ramble from the palette
- **WHEN** a user with the assistant and voice capture on opens the command palette and chooses "Ramble into tasks"
- **THEN** the panel opens with "Turn this into tasks" chosen and the microphone listening

#### Scenario: Voice capture off
- **WHEN** the same entry is chosen with voice capture off on the device
- **THEN** the panel opens with the skill chosen and the focus in the field, and no microphone starts

#### Scenario: No assistant
- **WHEN** the assistant is off on the server
- **THEN** the palette lists no "Ramble into tasks"
