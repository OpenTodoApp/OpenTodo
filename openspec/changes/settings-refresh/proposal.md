## Why

Settings works but reads badly. Fourteen items of feedback from 21 October:
- Cards have no visual anchor, and a "Learn more" link doesn't show the pointer cursor.
- The start guide is hidden behind one weak link.
- Several screens are dense or confusing: Recent activity, the date preview, the issue connection form, API tokens, the Assistant card, the token for an assistant, and the server audit log.
- Capture repeats a date setting that General already owns.
- Voice capture can't use a speech service the owner runs.
- Nobody can change their own name, email or picture.

## What Changes

- **Card icons:** every Settings card ("How you work", "Session", "Password", "Two-factor authentication", "Passkeys", …) can carry an icon from the app's icon set before its title; every card in the app's own sections gets one.
- **Learn more links:** every "Learn more" link uses the pointer cursor and the same underline and hover treatment as other text links.
- **No trailing ellipsis:** "Set up encryption…" becomes "Set up encryption". A Settings card's action buttons don't end with "…".
- **Start guide in How you work:** a proper row titled "Start guide", with what it covers, whether it was finished, and an "Open the start guide" button. The button opens the guide over the Inbox, where its first step adds a task, instead of over Settings.
- **Recent activity:** a compact list grouped by day, one line per event (what, where from, when), with sign-ins from the same browser on the same day folded into one line, and the newest first.
- **Date and time preview:** the loose two-column list becomes one "sample" card that shows the same values the way the app shows them, with the week strip below it.
- **Capture:** the "Numeric dates like 12/11" choice is removed from Capture. Quick add reads numeric dates in the order of the date format chosen in General → Date and time, the one setting for it. **BREAKING** for anyone who set a different quick-add order on a device: that device setting is ignored from now on.
- **Voice capture with a speech service:** besides the browser's own recognition (still the default), a user can choose the server's speech service.
  - The owner connects any OpenAI-compatible transcription endpoint (`POST /v1/audio/transcriptions`); Speaches (faster-whisper) is the documented self-hosted choice, and whisper.cpp's server also works.
  - The browser records the phrase, the OpenTodo server forwards it to that endpoint, and the text comes back into quick add. Audio and text are never stored.
  - The Settings card, a new self-hosting guide page, the README and the voice capture guide say exactly what leaves the device. The website text is specified here and written in the website repository.
- **Connect issues:** the connection form becomes three short steps (provider and host, token, which issues and where they go), with the rarely needed options behind "More options".
- **API tokens:** each token is one row with its name, scope, created and last-used dates and a revoke action. The create form groups name, scope and expiry, and the new token appears once in a clear copy box.
- **Assistant:** the card is reorganised into a status line, "For everyone on this server" (owner) and "For you" (each user), and the usage meter. The owner's form groups provider, model and key, then limits.
- **Token for an assistant:** becomes a short guided flow in the AI assistants card:
  1. the endpoint to paste,
  2. the token to create, read-only by default and with a write option when allowed,
  3. per-client instructions in tabs.
- **Server audit log:** filters fold into one row with a "Filters" disclosure on narrow screens. Events are a compact list (icon, event in words, account, when, client), the retention and address settings move into their own small card, and Export stays in the header.
- **Profile:** every user can change their own name, email and profile picture from Settings → Account.
  - The picture is uploaded, cropped to a circle in the browser with `react-easy-crop` (loaded only when the cropper opens), resized to 256×256 and stored on the server without its metadata.
  - Changing the email needs a recently confirmed session. With outgoing email, it also needs a link sent to the new address; without email, it applies at once.
  - Names, emails and pictures are server-side profile data: not operations, not encrypted, shown to the people who share a project with the user.

Out of scope:
- the website's own pages (the text is specified in design.md; the change lands in pixari/OpenTodoWebsite);
- an owner editing other people's profiles;
- pictures for projects or labels;
- live (streaming) transcription;
- server-side speech services that are not OpenAI-compatible.

ROADMAP.md: advances "Settings and onboarding polish" in the calm-interface work and the voice capture item ("bring your own speech service"). No new mandatory environment variable; the op log format is unchanged.

## Capabilities

### New Capabilities
- `account-profile`: changing one's own name, email and profile picture; how pictures are stored, served and shown; the email confirmation flow.

### Modified Capabilities
- `settings-navigation`: card icons, "Learn more" links and card action labels.
- `first-run`: the start guide's row in How you work, and where reopening it shows the guide.
- `audit-log`: compact Recent activity and a more compact server audit log; profile events.
- `date-time-preferences`: the preview's presentation.
- `natural-language-capture`: numeric dates follow the date format only; the device-level quick-add order goes away.
- `voice-capture`: an optional server speech service next to browser recognition, with its privacy contract.
- `issue-connections`: the connection form in steps.
- `account-access`: how API tokens are listed and created in Settings.
- `in-app-assistant`: the Assistant card's structure.
- `mcp-server`: the "token for an assistant" flow in the AI assistants card.

## Impact

- **Web:**
  - the Settings section and card components (`web/src/ui/patterns/Settings*`, `web/src/app/*Settings*.tsx`, `SecurityPanel`, `AuditPanel`, `TokensSection`, `IssuesPanel`, `AssistantsPanel`, the assistant settings, `VoiceSettings`, `QuickAddSettings`, `DateTimeSettings`, `AccountSettings`);
  - `lib/nlp` (numeric order);
  - a new profile panel and cropper chunk;
  - the Avatar primitive (picture with initials fallback).
- **Server:**
  - new routes `PATCH /api/v1/me/profile`, `POST /api/v1/me/email` (with its confirmation route), `PUT`/`DELETE /api/v1/me/avatar`, `GET /api/v1/users/{id}/avatar`;
  - a new voice transcription route `POST /api/v1/voice/transcribe`, plus the owner's transcription settings and a secrets file;
  - a migration for the avatar and pending-email columns;
  - new audit events.
- **Dependencies:** `react-easy-crop` (MIT, about 7 KB gzipped, lazy). No server dependency: Go's standard library decodes and re-encodes PNG and JPEG.
- **Docs:**
  - `docs/settings-you.md`, the voice section of `docs/quick-add.md`, a new `docs/self-hosting/speech-to-text.md`;
  - README;
  - AGENTS.md rule 5 gains "speech-to-text service" among operator-configured targets;
  - the help bundle.
