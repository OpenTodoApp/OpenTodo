# Proposal

## Why

A recipe, a how-to for the babysitter or the Wi-Fi note for guests has to reach someone without an account. Today a single note cannot be shared at all: a note is shared only by being in a shared project (`standalone-notes` "Notes follow their project"), which needs an account and shares everything else in the project. Task pages (`task-pages`) already publish one task as a calm page behind a secret link, with revocation, expiry, limits and encrypted snapshots. A note deserves the same, read-only.

## What Changes

- **Publish note page.** A standalone note's menu offers **Publish note page…**: an optional label and an expiry (never, 7, 30 or 90 days), then the link `/n/<secret>` shown once with a copy button. A **Published** marker in the note's header opens the status with **Copy a new link** and **Revoke**. Read-only: no replies, no ticks.
- **Who may publish:** the author of a personal note; the owner or an admin of a shared project for its notes.
- **The page** shows the title, when it last changed, the note's text formatted, its images and its files (downloads). Links to other notes, tasks and projects show as their text and lead nowhere, so the page never reveals another item. It refreshes while open, works at 360 px, by keyboard, in light and dark.
- **Same machinery as task pages:** secrets of at least 128 bits stored as hashes, the public read route `GET /api/v1/pages/{secret}` (now answering a `kind`), the private headers, the limits shared with task pages (100 active pages per account, 20 publishes per hour), the lifecycle re-check on every request, and demo denial.
- **Encrypted accounts:** the publisher's device uploads a snapshot encrypted with a share key carried after `#` in the link, as for task pages, and re-uploads it after an edit. Images and files are left out of an encrypted page, which says so.
- REST: `POST|GET|DELETE /api/v1/notes/{id}/page` and `PUT /api/v1/notes/{id}/page/snapshot`.

No op field, no dependency, no mandatory environment variable. Not **BREAKING**: pages are server-side data, never ops.

Out of scope: guests replying to or editing a note; publishing task notes or project notes on their own (a task page already shows the task's description); a listing or index of published notes; custom domains; publishing a set of linked notes as a site.

Roadmap: the "Notes area" in ROADMAP.md. Builds on `note-attachments` for a note's images; without it, a published note has no files to show.

## Capabilities

### New Capabilities

- `note-pages`: a read-only public page for one standalone note.

### Modified Capabilities

- `standalone-notes`: a note is shared with people only through its project; a read-only public page is the one other way out ("Notes follow their project").

## Impact

- Server: the task page store gains a `kind` (`task` or `note`) and a note id (one migration, `internal/store/migrations/NNNN_note_pages.sql`); `internal/httpapi` routes for note pages registered with `routes.handle` (`signedIn` with `.credential()`/`.recent()` like task pages, `.demoDenied()` and a demo deny-list entry in `demo.go`); the public read route answers note pages through the existing `public("…")` registration; the Markdown served with internal link targets stripped.
- Web: the publish dialog and marker reused from the task panel in the note view; the public page entry gains a note layout (lazy, outside the app's first load).
- Docs: a new `docs/note-pages.md`, `docs/notes.md`, `docs/task-pages.md` (shared limits).
- Size: the public page bundle grows by the note layout (a few KB gzip); the app's first load is unchanged. Binary size within noise.
