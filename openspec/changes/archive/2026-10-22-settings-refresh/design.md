# Design

## Context

Settings is built from shared patterns: `web/src/ui/patterns/Settings*`, with section cards, rows of label, description and control, and state-first summaries. Each section is a panel component in `web/src/app` (`AccountSettings`, `SecurityPanel`, `AuditPanel`, `TokensSection`, `IssuesPanel`, `AssistantsPanel`, `assistant/AssistantSettings`, `VoiceSettings`, `QuickAddSettings`, `DateTimeSettings`). The section table lives in `settingsSections.ts` and the search index in `settingsIndex.ts`.

Screenshots of the current screens, taken on a fresh owner server on 2026-10-21, show what each feedback item points at:
- **Account:** the start guide is a small text link under the method choices. Recent activity is a loose list of three-line items.
- **General:** the date preview is a right-aligned table floating next to a "Preview" label, with the week strip squeezed under it.
- **Capture:** it repeats a numeric order select next to the language checkboxes.
- **Integrations:**
  - API tokens are an empty state with a button.
  - The Assistant card mixes owner facts ("Providers allowed", "Monthly tokens per person") with a member notice.
  - "Token for an assistant" is a row with a large button and a closed "Connection instructions" disclosure.
- **Server:** the audit log has two rows of filters and a five-column table whose cells wrap, followed by the retention settings in the same card.
- **Voice capture:** it uses the browser's Web Speech API only (`voice-capture` spec). The server never sees audio.

Nothing today lets a user change their name, email or picture: there is no route for it, and the Avatar primitive draws initials only.

## Goals / Non-Goals

**Goals:**
- Every Settings screen in the feedback reads as label, value and action rows, with a small icon per card and no orphan controls.
- One source of truth for how numeric dates are read: the date format.
- Voice capture can use a speech service the owner runs, with an honest statement of what leaves the device.
- Users manage their own name, email and picture, safely: recent confirmation for the email, no metadata kept in pictures, and pictures visible only to people who already share work with them.

**Non-Goals:**
- Owners editing other accounts' profiles; that stays the Users panel's reset and role actions.
- Streaming or live transcription, speaker diarisation, and speech services that are not OpenAI-compatible.
- Pictures for projects, labels or workspaces.
- Redesigning the Settings shell, navigation or search. Card visuals beyond the icon and spacing are `surfaces-v2`'s.
- The website change itself; the text it needs is in D8.

## Decisions

### D1. Card icons come from the section table
The card's icon is declared next to its title in the section and card table (`settingsSections.ts`, plus each panel's card heading), not chosen ad hoc in JSX. That way the same card shows the same icon in search results (`settingsIndex.ts`).

**Icons:** every icon is from the interface set already in the bundle (Lucide), with no new sprite entries unless the catalogue already has the glyph:

| Card | Icon |
|---|---|
| How you work | compass |
| Session | monitor |
| Password | key-round |
| Two-factor authentication | shield-check |
| Passkeys | fingerprint |
| End-to-end encryption | lock |
| Recent activity | history |
| Profile | user-round |
| Language | languages |
| Start view | house |
| Date and time | calendar-clock |
| Calendar | calendar-days |
| Keyboard | keyboard |
| Focus | timer |
| Maps | map |
| Quick add | zap |
| Voice capture | mic |
| Capture | send |
| Email to task | mail |
| Calendar apps | calendar-sync |
| Calendar feeds | rss |
| Issues | git-pull-request |
| Webhooks | webhook |
| API tokens | key |
| Assistant | sparkles |
| AI assistants | bot |
| Backups | archive |
| Attachments | paperclip |
| Outgoing email | send |
| Speech to text | audio-lines |
| Audit log | scroll-text |

**Server cards:** the server section's cards (owner only) follow the same rule. The spec only requires the You, App and Data sections, because those are what the user named.

**Alternative rejected:** icons on every row. That doubles the noise the feedback complains about.

### D2. "Learn more" is a link component, not a styled button
The pointer cursor is missing because some "Learn more" links are buttons that open the Help panel. A `LearnMore` element in `web/src/ui` (`<button>` with the text-link class, `cursor-pointer` and the link underline) replaces every variant. `make ui-lint` gains a rule that a "Learn more" text must come from that element.

### D3. The start guide goes to the Inbox
The guide's first step adds a task to the Inbox behind it, so opening it over Settings left nothing visible to land in. The new "Start guide" row navigates to `/inbox` and opens the guide there.
- **Finished state:** The row reads "Finished" or "Not finished" from the synced `first_run` preference (`"done"` once finished). It has no date: the preference stores none, and the date isn't worth a new field.
- **Other proposals:** `moments-and-onboarding` modifies `first-run`'s "Sample project", not "Three-step first run", so the two compose. Whichever is archived second carries the other's wording.

### D4. Recent activity and the audit log: compact lists, grouped and folded on the device
- **Recent activity:** the data is the existing `GET /api/v1/me/activity` (90 days, 100 events). Grouping by day and folding repeated sign-ins from the same client on the same day are done in the browser, so the server and its API don't change. A line is `icon · "Signed in ×4" · "Chrome on Linux" · time`.
- **Audit log:** the existing paginated route stays; only the presentation changes.
  - Filters collapse into one row from 768 px and a disclosure below it.
  - Active filters show as chips.
  - Rows are one line.
  - Retention and address logging move to an "Audit settings" card.
- **Alternative rejected:** keeping the table and shrinking its font. The cells still wrap at 1024 px.

### D5. The date preview is a "Sample" box
One box under the four rows:
- the today heading;
- a two-column grid of label and value on one axis (due chip, full date, due time, comment time);
- the week strip.

It fits 360 px. It uses the same formatters as the app (`formatDate`, `formatDueLong`, the time format), so the sample can't drift from the real thing.

### D6. Numeric order follows the date format only
- **Removed:** the Capture select ("Numeric dates like 12/11") and the `dayMonthOrder` field of the device key `opentodo.quickadd` that stored it. `lib/nlp` reads the order from the date format preference: `day-month` and `month-day` decide, while `iso` and `system` keep the parsing language's order, as today's "automatic".
- **Migration:** a stored key is ignored, so no write is needed. The field is removed from the device key on next load to avoid confusion in exports of local storage.
- **Go side:** the CLI and importer use `internal/quickadd`, which never had the device key, so nothing changes there.
- **Alternative rejected:** keeping it as an "advanced" override. The feedback asks why it exists at all, and a second source of truth can only disagree with the first.

### D7. Speech to text: an OpenAI-compatible endpoint, reached through the server
- **Protocol:** `POST /v1/audio/transcriptions` (multipart `file`, `model`, `language`, `response_format=json`) is the de facto standard. It's implemented by the self-hosted servers worth recommending:
  - **Speaches** (formerly faster-whisper-server): one container, MIT licence, CPU or GPU, models such as `Systran/faster-whisper-small` that run acceptably on a small server;
  - **whisper.cpp's server**, with `--inference-path /v1/audio/transcriptions`;
  - **LocalAI**;
  - hosted services, if an owner wants one.

  One protocol covers all of them, with no per-vendor code.
- **Why through the OpenTodo server**, not from the browser straight to the service:
  - the key stays on the server (`<data>/secrets/stt.json`, like the assistant's provider keys);
  - every request goes through `internal/outbound`, the same policy as webhooks and issue connections (host pinning, no redirects, private targets only when allowed);
  - the browser's content security policy stays "self only";
  - the service needs no CORS setup;
  - the owner can see in one place what the server talks to.
- **Recording:** `MediaRecorder` with Opus in WebM, or MP4/AAC on Safari, one phrase per press of the microphone, stopped by the button, Enter, or 60 s.
- **Request handling:** the server streams the upload into memory with a 5 MB cap, forwards it with a 30 s timeout, returns the text, and drops both. Nothing is logged except a per-user counter for the rate limit.
- **Encrypted accounts:** allowed, with the statement saying the phrase and its text are readable by this server and the service while the request runs. That matches what the user already accepts with browser recognition, whose vendor hears the audio.
- **AGENTS.md rule 5:** "the speech-to-text service" joins the list of operator-configured targets.
- **Alternatives rejected:**
  - In-browser Whisper (WebAssembly or WebGPU): 40–150 MB of model per device, slow on phones, and against "keep it small".
  - Vosk: a different protocol and weaker models.
  - Calling the service from the browser: key exposure, CORS, CSP changes.

### D8. What the docs, README and website say about speech
- **Settings card (Voice capture):** "Recognition: This browser / This server's speech service (stt.home.lan)" with the statement in D7. For the owner, a Speech to text card on Server with URL, model, key, Test, and the private-network note.
- **`docs/self-hosting/speech-to-text.md`:**
  - why: dictation that stays on your network;
  - running Speaches with Docker Compose next to OpenTodo, with a tested compose snippet;
  - the model choice, sized by CPU and RAM;
  - whisper.cpp as the lighter alternative;
  - the variables, the private-network switch, and testing;
  - what is sent and what is kept.
- **The voice section of `docs/quick-add.md`:** the two recognisers and what leaves the device with each.
- **README:** one line under features ("Dictate tasks with your browser's speech recognition or your own self-hosted Whisper service") linking the guide.
- **Website** (follow-up in pixari/OpenTodoWebsite, written from the released bundle):
  - a short paragraph on the self-host page under "Optional services": run Speaches next to OpenTodo for private dictation; nothing leaves your network;
  - a line in the privacy section: with your own speech service, your voice never reaches a cloud vendor.

### D9. Integrations: steps for issues, rows for tokens, groups for the assistant, steps for MCP
These are presentation changes over routes that don't change:
- **Issues:** three numbered steps, with "More options" for label mapping and the interval, in a 36 rem dialog with a sticky action bar.
- **API tokens:** rows with scope badges and coarse dates, plus one create dialog with described scopes.
- **Assistant:** a status line, then "For everyone on this server" (owner), "For you" and the usage meter. The owner form is grouped into Provider and Limits.
- **AI assistants (MCP):**
  - the owner switches are a separate group;
  - then three numbered steps (Endpoint, Token, Add it to your assistant);
  - the client tabs prefill the endpoint and, right after creation, the token, so the user copies one snippet.

The `agent-planning-fields` proposal modifies `mcp-server` "Agent content routes" and `in-app-assistant` requirements other than the ones touched here. The Settings layouts compose with its new "Project assistant access" settings by adding a row to "For you".

### D10. Profile: server-side account data, pictures re-encoded on the server
- **Data model** (migration `0044_profile.sql`; 0042 and 0043 were taken by other changes):
  - A side table `user_profiles(user_id, avatar_version, pending_email, pending_email_sent_at)` instead of columns on `users`: SQLite cannot run `ALTER TABLE ADD COLUMN` idempotently, and the store's migration tests run migrations again. A missing row means no picture and no pending change.
  - `avatar_version`: 0 or less means no picture. It's bumped on each set and becomes part of the picture URL for year-long caching; a remove keeps the last version negated, so the next picture gets a new address.
  - `pending_email` with `pending_email_sent_at`.
  - A table `email_changes(token_hash PRIMARY KEY, user_id, email, expires_at)`; tokens are hashed like reset links.

  No op schema change: names, emails and pictures are account data, like today's name set at sign-up.
- **Storage:** `<data>/avatars/<user id>.jpg`, written atomically. It's included in backups (the data directory) and in the account export archive, and deleted with the account.
- **Validation:** the server decodes with `image/jpeg` and `image/png` from the standard library, checks 256×256, and re-encodes as JPEG at quality 85. That strips EXIF, including GPS, and refuses polyglot files. WebP is accepted only as input on the client, which converts it in a canvas before upload, so the server needs no WebP decoder.
- **Serving:** `GET /api/v1/users/{id}/avatar?v=<version>` checks that the requester is the account or shares a project or workspace with it, using the same membership lookup as members lists. It sends `Cache-Control: private, max-age=31536000, immutable`.
- **Showing it elsewhere:** clients learn versions from the existing member and assignee payloads, which gain `avatar_version`. The Avatar primitive draws the image in a circle with the initials underneath as the fallback.
- **Crop library:** `react-easy-crop` (6.2.3 when applied; 6.x is the current major): MIT, about 7 KB gzipped, built for React, with `cropShape="round"`, touch pinch, keyboard support and no CSS framework. Cropper.js 2 is larger (about 15 KB gzipped plus styles) and DOM-first. It's loaded only when the picture dialog opens, so the main bundle doesn't grow. The crop result is drawn into a 256×256 canvas in the browser.
- **Email change:**
  - It needs the `recent` route policy.
  - With outgoing email and a base URL: a pending address, a 24 h link to the new address, and a notice to the old one.
  - Without email, it applies at once, because the recent confirmation is the guard and the owner of a mail-less server already resets passwords by hand.
  - Single-sign-on-only accounts get a read-only email that names the provider.
  - Every step is in the audit log, without the addresses.
- **Who may change what:** every user may change their own profile. The owner's Users panel is unchanged. The feedback said "Settings owner", which fits since the owner is a user, and limiting this to the owner would be odd for members.

### D11. Interface budget and sizes
- **Interface budget:** Settings pages are forms, not lists: there's no chrome above a list and no new sidebar destination. Every scroller stays the page's own; the token dialog and the issue editor scroll inside their dialog, which counts as one region.
- **New shortcuts:** none, except the cropper's `+`, `-` and arrows, which apply inside its dialog only. The registry gains them as dialog-scope entries.
- **Sizes:**
  - main bundle: about +1 KB (the `LearnMore` element, card icons by name);
  - the cropper's lazy chunk: about 9 KB gzipped with its glue;
  - the recorder for the speech service: about 2 KB, in the voice chunk;
  - server binary: a few KB for the routes; no new dependency;
  - memory: one phrase at a time per request, capped at 5 MB.

## Risks / Trade-offs

- **[Email change without outgoing email]** A stolen, recently confirmed session could change the email. Mitigation: the recent window is short (the existing `recent` policy), the change is in Recent activity and the audit log, and sign-in by the old address stops working, which the real user notices. Servers with email get the link.
- **[Speech service on a public server]** An owner could point it at a paid cloud service and pay for every member's phrases. Mitigation: the per-user rate limit, and the Settings card shows the host so members know where audio goes.
- **[Pictures and privacy]** A picture is visible to everyone sharing a project or a workspace. Mitigation: it's optional, removable at once, the dialog says who sees it, and metadata is stripped.
- **[Removing the quick-add order]** Someone who relied on a different numeric order for quick add than for display loses that. Mitigation: the date format offers both orders; the changelog says so.
- **[Overlaps]** `surfaces-v2` adds "Card tiers" to `settings-navigation`. This change adds icons, links and labels as separate requirements, so both archive cleanly in either order. `workspaces` adds workspace membership; picture visibility already counts shared workspaces, so nothing more is needed once it lands.

## Open Questions

- Should the owner be able to set a default speech model per language, such as a larger model for Italian? Deferred; one model for now.
- Should a picture also be offered during the start guide? Not now: the guide is about tasks.
