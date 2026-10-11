# Changelog

All notable changes to OpenTodo are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

The first feature-complete version: every item on the [roadmap](ROADMAP.md) is implemented. Each feature was planned and built as an OpenSpec change; the archived changes under `openspec/changes/archive/` hold the full proposals, designs and task lists, and `openspec/specs/` the resulting behaviour contracts.

### Upgrade notes

- **No mandatory configuration.** Every new environment variable is optional and every feature that talks to the outside world is off until configured. The complete list is in the [README](README.md#configuration).
- **Database migrations** `0001` to `0023` are embedded and applied automatically at startup, in order, tracked by `PRAGMA user_version` (numbers `0016`–`0018` and `0020` are unused). Back up `/data` before upgrading an existing instance: there are no down-migrations. Rolling back to a binary older than user administration lets deactivated accounts sign in again.
- **Update the server before clients.** The op schema only grew (new fields and entities, nothing renamed), but an older server rejects sync batches that carry fields it does not know; those ops wait in the device's outbox until the server is upgraded. Older clients keep syncing their personal data and skip ops for entities they do not know.
- **Sizes** (measured for this release, `linux/amd64`): server binary 16,539,810 bytes (15.8 MiB) built with `-trimpath -ldflags="-s -w"`, web app embedded; `ot` CLI 6,856,866 bytes; initial web bundle 259 KB JS + 10.5 KB CSS gzipped, with the rich-text editor (97 KB), voice recognition (4 KB) and Vim layer (4 KB) loaded on demand; idle memory about 18 MB on a fresh instance. The container image adds the distroless static base (about 2 MB) to the binary.

### Added

**Core platform**
- Go + SQLite server with the React PWA embedded, local-first storage in IndexedDB, field-level last-writer-wins op log, owner setup, sessions, API tokens, REST API that writes through the op log, JSON export, a single distroless container and a Coolify-ready compose file. [Architecture](docs/architecture.md), [sync protocol](docs/sync.md)
- Live sync: a server-sent event stream (`GET /api/v1/sync/events`) wakes other devices as soon as ops are recorded; 30 s polling remains the fallback. [Live updates](docs/sync.md#live-updates), [proxy notes](docs/self-hosting/docker.md#live-updates-through-the-proxy)
- Vim keybindings, opt-in per device and loaded only when enabled.

**Capture**
- Natural-language quick add in English, German, French, Italian, Spanish and Portuguese: dates, times, `#project`, `@label`, `p1`–`p4`, `+30m` estimates, with preview chips; parsed on the device. [Quick add](docs/quick-add.md)
- Voice capture into quick add (`Shift+V`), opt-in per device, using the browser's speech recognition. [Voice](docs/quick-add.md#voice)
- Share target, bookmarklet and a Manifest V3 browser extension for Chromium and Firefox (`make extension`), opening a capture screen at `/share`. [Capture](docs/capture.md)
- Email to task: a personal secret address per account, polled from one operator-configured IMAP mailbox (`OPENTODO_EMAIL_*`). [Email](docs/email.md)
- `ot` command-line client (`cmd/ot`), cross-compiled for Linux, macOS and Windows and attached to releases. [CLI](docs/cli.md)

**Organisation and views**
- Nested projects and subtask trees to any depth, with deterministic, write-free cycle breaking for concurrent moves.
- Sections and a Kanban board per project; new `section` entity and task field `section_id`. [Sections](docs/api.md#sections)
- Manual ordering by drag and drop and `Alt+↑/↓`, one `position` op per move. [Manual order](docs/sync.md#manual-order)
- Labels as a synced entity referenced by id from `task.labels`. [Task labels](docs/sync.md#task-labels)
- Filter query language evaluated on the device, and saved views and dashboards (`view` entity, REST `/api/v1/views`, validated by a Go port of the parser). [Filters](docs/filters.md)
- Rich-text notes with collaborative editing: new task field `notes_doc` (a Yjs document envelope, up to 256 KB) next to `description`, which stays the note's Markdown projection for the API, export, CalDAV, MCP and webhooks. [Mergeable documents](docs/sync.md#mergeable-documents)
- Trash with restore, revision history from the op log, permanent purge (`purges` table, `purged` in sync responses), automatic purge after `OPENTODO_TRASH_RETENTION_DAYS` (default 30) and automatic archiving of finished projects. [Trash and history](docs/api.md#trash-and-history), [Purge](docs/sync.md#purge)

**Time**
- Duration estimates (task field `estimate_minutes`) and Day/Week time-blocking calendars with drag, resize and full keyboard control.
- Recurring tasks: task fields `recurrence` and `series_id`, one grammar implemented in Go and TypeScript against 180 shared vectors, convergent completion of the same occurrence on two offline devices. [Recurrence](docs/recurrence.md)
- Reminders (`reminder` entity, relative or absolute) with in-app notifications, snooze and dismiss, and web push implemented with the standard library (VAPID, RFC 8291); key pair in `<data>/push_vapid.pem`, `OPENTODO_PUSH=off` to disable. [Reminders](docs/reminders.md)
- Time-zone-fixed due times: optional `tz` key in `due` (IANA zone, only with `time`), resolved by `internal/zoned` and the web app against shared vectors. [Zoned due values](docs/sync.md#zoned-due-values)

**Collaboration**
- Project sharing with viewer, editor, admin and owner roles: the op log is partitioned into sharing scopes, ops are authorised against the author's membership at receipt and refused ones are reported per op. [Sharing scopes](docs/sync.md#sharing-scopes), [API](docs/api.md#sharing)
- Task assignment (`assignee_id`), the Assigned to me view and in-app notifications (`GET /api/v1/notifications`). [Assignment](docs/api.md#assignment-and-notifications)
- Threaded Markdown comments (`comment` entity) with `@mentions`, and an activity log derived from the op log, per task and per project. [Comments](docs/api.md#comments-and-activity)
- Activity feed across shared projects with unread counts (`project_prefs` entity, personal scope only; `GET /api/v1/activity`). [Activity feed](docs/api.md#activity-feed)
- Invitations: single-use, expiring links in Settings → Members. [Invitations](docs/api.md#invitations)
- User administration: admin role, deactivation, deletion, password reset links, owner transfer, own password change and `opentodo reset-owner-password` on the host. [User administration](docs/api.md#user-administration)

**Integrations and data**
- Data import of the app's own export, CSV and JSON exports of other task managers, with preview, duplicate detection and undo (`OPENTODO_IMPORT_MAX_MB`, default 20). [Import](docs/import.md)
- Scheduled backups to a folder, S3-compatible storage or WebDAV with retention, optional `OTBK1` encryption, `OPENTODO_BACKUP_*` presets and `opentodo restore`; sync responses carry a log `generation` so devices re-send newer edits after a restore. [Backups](docs/backups.md)
- Signed outbound webhooks with a durable queue, retries, delivery log and SSRF protection (`OPENTODO_WEBHOOKS_ALLOW_PRIVATE` preset). [Webhooks](docs/webhooks.md)
- CalDAV two-way sync under `/dav/` with per-device app passwords (`otap_…`), off until the owner enables it (`OPENTODO_CALDAV` preset); new task field `ical_extra` keeps unmapped iCalendar properties. [CalDAV](docs/caldav.md)
- Read-only MCP endpoint at `/mcp` for AI assistants (five tools, `opentodo://` resources), off until the owner enables it (`OPENTODO_MCP` preset). [MCP](docs/mcp.md)

**Security and access**
- Passkeys (WebAuthn) when `OPENTODO_BASE_URL` is https; verification in `internal/webauthn`.
- Two-factor authentication (TOTP) with recovery codes, remembered browsers, an owner policy (`none`, `owner`, `all`), step-up re-authentication for sensitive routes and `opentodo mfa-reset` on the host.
- Single sign-on with one OpenID Connect provider (PKCE, JWKS verification with the standard library), optional `OPENTODO_OIDC_*` overrides, account linking and an SSO-only mode with owner break-glass. [SSO](docs/self-hosting/sso.md)
- Audit log of security events with retention, NDJSON export and opt-in client addresses. [What is logged](SECURITY.md#what-is-logged), [API](docs/api.md#audit-log)
- Optional end-to-end encryption of task content per account (Web Crypto, AES-256-GCM, passphrase plus recovery key); routes under `/api/v1/encryption/`. [E2EE](docs/e2ee.md)

**Launch**
- Demo mode for a public demo instance: `OPENTODO_DEMO=true` creates a hidden owner and a shared demo account shown on the sign-in screen ("Try the demo"), seeds realistic data through the op log, wipes and reseeds it every night at 03:00 UTC (devices recover through purge markers, sessions stay), shows a banner, and refuses sign-up, account changes, integrations, import and encryption with 403 `demo_restricted`; no outbound requests. [Demo instance](docs/self-hosting/demo.md)

### Changed

- Deleting a project only tombstones the project; its tasks keep their `project_id` and come back when the project is restored from the Trash.
- API tokens have a scope: `read` tokens are refused on every write route and on `/api/v1/sync` (`403 insufficient_scope`); existing tokens stay `full`.
- `/api/v1/sync` responses gained additive fields: `rejected`, `memberships`, `purged`, `trashRetentionDays` and `generation`; requests may carry `tzOffset`. Served ops carry `actor`. Older clients ignore them.
- REST collections and the export include projects shared with you (with read-only `role` and `owner_id`), and the export gained `labels`, `views`, `reminders`, `sections`, `comments` and the `encryption` key record. The export format version stays 1.
- `ot` embeds Go's time zone database so zoned due times resolve on hosts without one (Windows, distroless).
- Server dependencies: `github.com/fxamacker/cbor/v2` (passkeys). Web dependencies: `qrcode-generator` (two-factor QR codes), `yjs` and the `prosemirror-*` packages (rich-text notes, lazy-loaded). Everything else uses the standard library and existing packages.

### Fixed

- Opening the app at a different host than `OPENTODO_BASE_URL` made passkeys fail with the browser's "origin is not authorized for the provided RP ID"; the app now explains which two hosts differ and what to change, and Settings → Security shows the host passkeys are tied to (also `passkeyDomain` in `GET /api/v1/auth/status`). In `docker-compose.yml` an `OPENTODO_BASE_URL` you set yourself now wins over Coolify's generated `SERVICE_URL_OPENTODO`.
- Dropdown menus (view, section, project and label menus) could open mostly off screen on phones when the header wrapped; they now shift back inside the screen when opened.
- The keyboard-shortcut help could not be scrolled or closed on phones (the panel grew past the screen on iOS Safari). It is now a full-screen sheet on small screens with a pinned close button, the overlay scrolls instead of the panel, and every other dialog overlay scrolls when its content is taller than the screen.
- Clients skip ops for entities they do not know instead of failing the whole batch, so an installed PWA that has not refreshed yet keeps syncing when the server gains a new entity.
- A reference to a deleted, foreign or not-yet-received section or label is displayed as "No section" or hidden without writing a repair op, so arrival order can never overwrite a newer edit.

### Security

- Sign-up is closed after the owner account; new people join by single-use invitation links or, if allowed, single sign-on.
- Sensitive routes (new API tokens, app passwords, invitations, user administration, two-factor and SSO settings, encryption key changes) require a sign-in or re-authentication within ten minutes on cookie sessions (`403 reauth_required`).
- Rate limits on sign-in, registration, passkeys, the second sign-in step, re-authentication, invitation and reset previews, single sign-on, comment creation, admin actions and failed `/mcp` and CalDAV authentications.
- Webhook delivery refuses loopback, private, link-local, metadata and other internal targets unless the owner allows private networks, and never follows redirects.
- CalDAV accepts only app passwords; `/api/v1` refuses them. `/mcp` accepts only bearer tokens and checks `Origin`.
- Credentials, secrets and audit details are kept out of logs and the audit log by an allow-list; secrets for backups and single sign-on live in `<data>/secrets/` (mode 0600), outside the database and backups.
- See [SECURITY.md](SECURITY.md) for the full model.

### Known limitations and verification follow-ups

These features are implemented and covered by automated tests (unit, integration and in-process protocol tests), but could not be verified against the real thing in this environment:

- **CalDAV** with real clients: Apple Reminders, Thunderbird and DAVx⁵ (Android tasks apps).
- **Single sign-on** against a real OpenID Connect provider such as Authentik or Keycloak (tested against an in-process provider).
- **Email to task** against real mail providers' IMAP servers (tested against an in-process IMAP server).
- **MCP** with real AI assistant clients.
- **Voice capture** with a real microphone in Chrome and Safari.
- **Web push** on real devices and push services.
- **Passkeys** on real devices and authenticators.
- **Share target** behaviour in Firefox (and other platforms listed in [docs/capture.md](docs/capture.md)).
- **Touch drag and drop** (board, manual ordering, calendar) on real touch devices.

Other known limitations: CalDAV does not translate alarms into reminders (alarms survive round trips in `ical_extra`), MCP has no stdio bridge, comments are Markdown text rather than rich text, the browser extension is not published in the stores, and quick add does not parse recurrence or reminders. See the [roadmap](ROADMAP.md#future-ideas).

### Migrations

| File | Adds |
| --- | --- |
| `0001_init.sql` | `users`, `sessions`, `api_tokens`, `ops` (the op log), `fields` |
| `0002_invitations.sql` | `invitations` |
| `0003_webhooks.sql` | `webhooks`, `webhook_deliveries`, the shared `settings` table |
| `0004_passkeys.sql` | `passkeys` |
| `0005_data_import.sql` | `import_jobs`, `import_items` |
| `0006_audit_log.sql` | `audit_events` |
| `0007_backups.sql` | `backup_runs`, the log generation |
| `0008_project_sharing.sql` | `op_scopes`, `scope_fields` (replacing `fields`), `project_scopes`, `project_members`, `member_backfills` |
| `0009_mfa.sql` | `mfa_totp`, `mfa_recovery_codes`, `trusted_devices`, `session_auth` |
| `0010_reminders.sql` | `push_subscriptions`, a scheduler index |
| `0011_task_assignment.sql` | `notifications` |
| `0012_user_management.sql` | `user_status`, `password_resets`, the single-owner index and guard triggers |
| `0013_trash.sql` | `purges` |
| `0014_oidc.sql` | `identities`, `session_oidc` |
| `0015_comments.sql` | a partial index for comments |
| `0019_caldav.sql` | `app_passwords`, `caldav_resources` |
| `0021_mcp.sql` | `api_token_scopes` |
| `0022_email.sql` | `email_inboxes`, `email_receipts` |
| `0023_e2ee.sql` | `encryption_keys` (the wrapped key record) |
