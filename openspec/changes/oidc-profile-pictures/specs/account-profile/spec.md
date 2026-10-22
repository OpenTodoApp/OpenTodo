## MODIFIED Requirements

### Requirement: Profile picture
A user SHALL be able to set a profile picture: the client SHALL let them choose a PNG, JPEG or WebP image of at most 10 MB, show a circular crop with zoom and pan (keyboard: arrow keys pan, `+` and `-` zoom), and upload the crop as a 256×256 JPEG or PNG to `PUT /api/v1/me/avatar` (at most 512 KB). The server SHALL decode the image, refuse anything that is not a 256×256 PNG or JPEG (`invalid_input`), re-encode it as JPEG so no metadata (such as a location) is kept, and store it under `<data>/avatars/<account id>.jpg`, included in backups and in the account's export archive. `DELETE /api/v1/me/avatar` SHALL remove it. Both routes SHALL require a session or a `full` token and be denied on the demo instance. `GET /api/v1/users/{id}/avatar` SHALL serve the picture to the account itself and to accounts that share a project or a workspace with it, with a version in the URL so it can be cached for a year, and SHALL answer 404 to anyone else. The picture SHALL be drawn as a circle wherever the account's initials are drawn today, with the initials as the fallback while it loads, offline, or when there is none. The picture is account data, not task content: it is not end-to-end encrypted, and the encryption settings say so. A picture may also come from the single sign-on provider when the owner allows it (see `oidc-login`, "Profile picture from the provider"): the server SHALL record whether a picture was uploaded or came from the provider, an uploaded picture SHALL never be replaced by the provider's, and removing a provider's picture SHALL keep it from being fetched again from the same address.

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

#### Scenario: Upload over a provider picture
- **WHEN** an account whose picture came from the sign-in provider uploads its own picture and later signs in through the provider again
- **THEN** the uploaded picture stays
