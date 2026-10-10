# Roadmap

OpenTodo aims to replace commercial task managers for people who want to own their data, then go further with what a self-hosted, local-first platform makes possible. Work is organised as [OpenSpec](https://github.com/Fission-AI/OpenSpec) changes; the suggested change names below are the handles to use with `openspec new change <name>` or `/opsx:propose`.

Status legend: ✅ shipped · 🔨 in progress · 📝 specified (proposal, delta specs, design and tasks drafted under `openspec/changes/<change name>/`, ready for `/opsx:apply`) · 💭 exploring

## 1. Core engine and architecture

| Status | Capability | Change name | Notes |
| --- | --- | --- | --- |
| ✅ | Local-first storage, works fully offline, installable PWA | `bootstrap-core-platform` | IndexedDB is the source of truth on each device |
| ✅ | Conflict-free multi-device sync | `bootstrap-core-platform` | Field-level last-writer-wins op log, convergent by construction. See `docs/sync.md` |
| ✅ | Single container under 50 MB, runs on a Raspberry Pi | `bootstrap-core-platform` | Static Go binary + SQLite, distroless, ~12 MB binary |
| ✅ | Keyboard navigation (q, j/k, c, 1–4, g+key, ?) | `bootstrap-core-platform` | |
| ✅ | Live push of changes between devices (no 30 s polling) | `realtime-sync-channel` | Server-sent events or WebSocket wake-up; protocol stays op-based |
| 📝 | Rich text with collaborative editing for notes and comments | `collaborative-rich-text` | Yjs documents stored as op values; evaluate size impact first |
| 📝 | Vim-style modal navigation option | `vim-keybindings` | |

## 2. Capture and input

| Status | Capability | Change name |
| --- | --- | --- |
| ✅ | Quick add with view-aware defaults | `bootstrap-core-platform` |
| ✅ | Natural-language quick add, multi-language ("Meeting with Sarah next Wed at 3pm #work @call +30m") | `nlp-quick-add` |
| ✅ | REST API + API tokens for scripts | `bootstrap-core-platform` |
| ✅ | Command-line client | `cli-client` |
| 📝 | Email-to-task (forward to an inbox address) | `email-to-task` |
| ✅ | Browser extension and mobile share-sheet target | `share-capture` |
| 📝 | Voice capture via the Web Speech API | `voice-capture` |

## 3. Organisation, views and GTD

| Status | Capability | Change name |
| --- | --- | --- |
| ✅ | Projects, Inbox, Today, Upcoming, Completed | `bootstrap-core-platform` |
| ✅ | Nested projects (`parent_id` already reserved) | `project-hierarchy` |
| 📝 | Sections and Kanban board view | `board-view` |
| ✅ | Subtask trees with parent progress (`parent_id` already reserved) | `subtask-trees` |
| ✅ | Labels UI (schema shipped) | `labels` |
| ✅ | Filter query language (`@work & due <= tomorrow & p1`) | `filter-query-language` |
| ✅ | Saved filters pinned to the sidebar, custom dashboards | `custom-views` |
| 📝 | Trash with restore, auto-archive of completed projects, revision history from the op log | `trash-and-history` |
| 📝 | Drag-and-drop ordering (`position` already shipped) | `manual-ordering` |

## 4. Time management

| Status | Capability | Change name |
| --- | --- | --- |
| ✅ | Floating due dates with optional time | `bootstrap-core-platform` |
| 📝 | Reminders and web push notifications | `reminders` |
| ✅ | Recurring rules incl. "every last weekday", "every 3 days after completion" | `recurring-tasks` |
| ✅ | Duration estimates and time-blocking calendar grid | `time-blocking` |
| 📝 | Absolute (time-zone aware) timestamps next to floating dates | `absolute-datetimes` |

## 5. Collaboration

| Status | Capability | Change name |
| --- | --- | --- |
| 📝 | Share projects with roles (viewer, editor, admin) | `project-sharing` |
| 📝 | Assignees | `task-assignment` |
| 📝 | Threaded markdown comments and activity log | `comments-and-activity` |
| 📝 | Live activity feed in shared lists | `activity-feed` |

## 6. Integrations and data ownership

| Status | Capability | Change name |
| --- | --- | --- |
| ✅ | JSON export | `bootstrap-core-platform` |
| ✅ | JSON / CSV import, including export files from popular commercial task apps | `data-import` |
| ✅ | Scheduled backups to local disk, S3 or WebDAV | `backups` |
| 📝 | CalDAV two-way sync (Apple Reminders, Thunderbird, Nextcloud) | `caldav` |
| ✅ | Outbound webhooks (Home Assistant, Telegram, n8n) | `webhooks` |
| 📝 | Read-only MCP server for AI assistants, off by default | `mcp-server` |

## 7. Security and access

| Status | Capability | Change name |
| --- | --- | --- |
| ✅ | Owner setup, password sign-in, sessions, closed sign-up by default, rate limiting, CSP | `bootstrap-core-platform` |
| ✅ | Invitations for new members | `invitations` |
| ✅ | Passkeys (WebAuthn) | `passkeys` |
| 📝 | OIDC / OAuth2 single sign-on | `oidc-login` |
| 📝 | Multi-factor authentication (TOTP) | `mfa-totp` |
| ✅ | Audit log | `audit-log` |
| 📝 | User administration: list users, admin role, deactivate, delete, password reset, owner transfer | `user-management` |
| 📝 | Optional end-to-end encryption of task content | `e2ee` |

## Principles that do not change

- The client is the source of truth; the server syncs. Nothing should require the network to work.
- One container, one volume, no mandatory configuration.
- No telemetry. No paid tier. AGPL forever.
