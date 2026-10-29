## ADDED Requirements

### Requirement: Apple Shortcuts pack
Each final release SHALL publish two signed Apple Shortcuts built from sources in the repository. Both SHALL contact only the server address the user enters when importing them, and SHALL be documented in `docs/apple-shortcuts.md`.

**Add to OpenTodo** asks for text (typed or dictated) and runs in one of two modes chosen at import:
- **Capture screen** (the default) needs no token. It opens the server's `/share` with the text as the title, where the user saves as on any capture screen.
- **Quick save** needs a `full` token entered at import. It SHALL first read `GET /api/v1/me`, and for an account with end-to-end encryption it SHALL use the capture screen instead, so no readable title is written through REST. Otherwise it reads the line through `POST /api/v1/quick-add/parse`, creates the task through `POST /api/v1/tasks` with the parsed fields and shows "Saved". When the server answers 401 or 403, or does not answer within 10 seconds, it SHALL open the capture screen with the same text instead and say why. It SHALL create at most one task per run.

**OpenTodo Today** opens the server's `/today`.

The documentation SHALL recommend a dedicated token per device and SHALL say never to use an `admin` token.

#### Scenario: Capture screen without a token
- **WHEN** a user of the installed web app imports "Add to OpenTodo" with the default mode and runs it with the text "Renew passport next month"
- **THEN** the server's capture screen opens with that text in the title field, and the task exists only after the user saves

#### Scenario: Quick save
- **WHEN** the Shortcut runs in Quick save mode with a valid `full` token and the text "Call Anna tomorrow 9am #Work"
- **THEN** one task "Call Anna" exists in the Work project, due tomorrow at 09:00, and the Shortcut shows "Saved"

#### Scenario: Encrypted account in Quick save
- **WHEN** the account uses end-to-end encryption and the Shortcut runs in Quick save mode
- **THEN** the Shortcut sees `encryption.enabled` in `GET /api/v1/me`, sends no title to the server, and opens the capture screen with the text, where the device encrypts it on save

#### Scenario: Revoked token
- **WHEN** the token was revoked and the Shortcut runs in Quick save mode
- **THEN** the server answers 401, the Shortcut says the token no longer works and opens the capture screen with the text, and no task is created

#### Scenario: Only the configured server
- **WHEN** either Shortcut runs with its network traffic inspected
- **THEN** every request goes to the server address entered at import, and to no other host
