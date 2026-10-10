# Roadmap

OpenTodo set out to replace commercial task managers for people who want to own their data, then go further with what a self-hosted, local-first platform makes possible. **The original roadmap is complete**: every capability below has shipped (see the [changelog](CHANGELOG.md)). Each one was built as an [OpenSpec](https://github.com/Fission-AI/OpenSpec) change; the change names are the folders under `openspec/changes/archive/`, and the resulting behaviour contracts live in `openspec/specs/`.

New work starts the same way: `openspec new change <name>` or `/opsx:propose "<idea>"`. See [Future ideas](#future-ideas) for candidates.

## Shipped

### 1. Core engine and architecture

| Capability | Change name | Notes |
| --- | --- | --- |
| Local-first storage, works fully offline, installable PWA | `bootstrap-core-platform` | IndexedDB is the source of truth on each device |
| Conflict-free multi-device sync | `bootstrap-core-platform` | Field-level last-writer-wins op log, convergent by construction. See [docs/sync.md](docs/sync.md) |
| Single small container, runs on a Raspberry Pi | `bootstrap-core-platform` | Static Go binary of about 17 MB with the web app embedded, distroless image under 25 MB |
| Keyboard navigation (q, j/k, c, 1–4, g+key, ?) | `bootstrap-core-platform` | |
| Live push of changes between devices | `realtime-sync-channel` | Server-sent event wake-ups; the protocol stays op-based, polling is the fallback |
| Rich text with collaborative editing for task notes | `collaborative-rich-text` | Yjs document in `task.notes_doc`, editor lazy-loaded; comments stay Markdown |
| Vim-style modal navigation option | `vim-keybindings` | |

### 2. Capture and input

| Capability | Change name |
| --- | --- |
| Quick add with view-aware defaults | `bootstrap-core-platform` |
| Natural-language quick add in six languages ("Meeting with Sarah next Wed at 3pm #work @call +30m") | `nlp-quick-add` |
| REST API and API tokens for scripts | `bootstrap-core-platform` |
| Command-line client | `cli-client` |
| Email to task (forward to an inbox address) | `email-to-task` |
| Browser extension and mobile share-sheet target | `share-capture` |
| Voice capture via the Web Speech API | `voice-capture` |

### 3. Organisation, views and GTD

| Capability | Change name |
| --- | --- |
| Projects, Inbox, Today, Upcoming, Completed | `bootstrap-core-platform` |
| Nested projects | `project-hierarchy` |
| Sections and Kanban board view | `board-view` |
| Subtask trees with parent progress | `subtask-trees` |
| Labels | `labels` |
| Filter query language (`@work & due <= tomorrow & p1`) | `filter-query-language` |
| Saved filters pinned to the sidebar, custom dashboards | `custom-views` |
| Trash with restore, auto-archive of completed projects, revision history from the op log | `trash-and-history` |
| Drag-and-drop ordering | `manual-ordering` |

### 4. Time management

| Capability | Change name |
| --- | --- |
| Floating due dates with optional time | `bootstrap-core-platform` |
| Reminders and web push notifications | `reminders` |
| Recurring rules incl. "every last weekday", "every 3 days after completion" | `recurring-tasks` |
| Duration estimates and time-blocking calendar grid | `time-blocking` |
| Absolute (time-zone aware) times next to floating dates | `absolute-datetimes` |

### 5. Collaboration

| Capability | Change name |
| --- | --- |
| Share projects with roles (viewer, editor, admin) | `project-sharing` |
| Assignees and in-app notifications | `task-assignment` |
| Threaded Markdown comments and activity log | `comments-and-activity` |
| Live activity feed in shared lists | `activity-feed` |

### 6. Integrations and data ownership

| Capability | Change name |
| --- | --- |
| JSON export | `bootstrap-core-platform` |
| JSON / CSV import, including export files from popular commercial task apps | `data-import` |
| Scheduled backups to local disk, S3 or WebDAV | `backups` |
| CalDAV two-way sync (Apple Reminders, Thunderbird, Android via DAVx⁵) | `caldav` |
| Outbound webhooks (Home Assistant, Telegram, n8n) | `webhooks` |
| Read-only MCP server for AI assistants, off by default | `mcp-server` |

### 7. Security and access

| Capability | Change name |
| --- | --- |
| Owner setup, password sign-in, sessions, closed sign-up by default, rate limiting, CSP | `bootstrap-core-platform` |
| Invitations for new members | `invitations` |
| Passkeys (WebAuthn) | `passkeys` |
| OIDC single sign-on | `oidc-login` |
| Multi-factor authentication (TOTP) | `mfa-totp` |
| Audit log | `audit-log` |
| User administration: list users, admin role, deactivate, delete, password reset, owner transfer | `user-management` |
| Optional end-to-end encryption of task content | `e2ee` |

## Future ideas

Not commitments, just honest next steps. Each would start as an OpenSpec change.

- **Real-world verification.** Exercise the integrations that automated tests could only simulate: CalDAV with Apple Reminders, Thunderbird and DAVx⁵; single sign-on with Authentik and Keycloak; email to task with common IMAP providers; MCP with real assistant clients; voice capture, web push, passkeys and touch drag and drop on real devices; the Firefox share flow. Fix what they turn up and record the results in the docs.
- **Reminders over CalDAV.** Map `VALARM` to OpenTodo reminders in both directions instead of only preserving alarms verbatim.
- **Rich text for comments.** Comments are Markdown today; reuse the notes editor where it helps without losing the plain-text API.
- **stdio MCP bridge.** A tiny bridge for assistants that only speak stdio, forwarding to the HTTP endpoint with a read-only token.
- **Built-in SMTP receiver** for email to task, for operators who own an MX record (`email-smtp-receiver`).
- **Quick add for recurrence and reminders** ("every Monday", "remind me at 9") and quick-add parsing in `ot`.
- **Published browser extension** in the Chromium and Firefox stores, and file and image sharing through the share target.
- **Shell completion** for `ot`.

## Principles that do not change

- The client is the source of truth; the server syncs. Nothing should require the network to work.
- One container, one volume, no mandatory configuration.
- No telemetry. No paid tier. AGPL forever.
