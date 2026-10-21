# Proposal

## Why

Notes have a rich editor and comments do not: a comment is a plain text area with Markdown syntax the writer has to know, and the two places where people write on a task behave differently. The editor itself stops at headings, lists and links: no tables, no images from the attachments that already exist, no way to turn a checklist line into a real subtask, no mentions outside comments, and nothing on a phone but the keyboard. A household or a team of five writes most of its working text in notes and comments, so this is where OpenTodo still feels thinner than the apps people switch from (ROADMAP.md future idea "Rich text for comments").

## What Changes

- **One editor everywhere.** Comments are written and edited in the same editor as task and project notes: a comment's expanded composer is the rich editor, the resting line stays one line. Comments keep Markdown as their stored, synced and API representation; the editor serialises to Markdown on send and parses on edit, within a documented subset that round-trips exactly, and preserves anything outside it as raw text. Comments are not collaborative documents.
- **Editor depth, for notes and comments alike:**
  - a slash command menu (`/` at the start of a line or after a space) listing heading, list, checklist, table, link, image, date and mention, filtered as you type, keyboard operated;
  - block quotes and code blocks in the editor (the comment renderer already shows them, the editor could not make them);
  - tables, at most 10 columns and 100 rows, with a plain-text projection that stays readable in the API, the export, list previews and older clients;
  - images from attachments: dropping, pasting or choosing an image attaches it to the task and embeds it in the note; an embedded image is served with authentication, decrypted on the device for an encrypted account like today's thumbnails, and shown as a placeholder while it uploads or when it is removed;
  - **Make subtask** on a checklist line: creates a subtask with that text and replaces the line with a link to it, as one undoable change;
  - recognised issue links (GitHub, GitLab, Jira, Linear) read as an issue chip inline, recognised on the device from the URL alone, with no outbound request;
  - `@mentions` in notes, completed from the project's members and notified like comment mentions, stored as an additive `task.note_mentions` id list the server filters to current members;
  - every feature reachable from the keyboard, with the editor's keys listed in the cheat sheet;
  - a one-row formatting toolbar on touch screens while the editor is focused.
- **Reactions on comments.** Six named reactions (thumbs up, heart, check, eyes, party popper, question) a member can add to or remove from a comment, shown as counts under the comment with who reacted; stored as one additive field family per account on the comment (`reactions.<account id>`), so concurrent reactions by different people never overwrite each other; plaintext for encrypted accounts; exposed on the comment routes and settable through a new route.
- **Bundle:** no change to the main bundle beyond the glue (about 2 KB gzipped); the editor chunk, already lazy, grows by about 25 KB gzipped, mostly the table dependency, loaded when a note or an expanded composer is first opened.

Out of scope: collaborative (multi-cursor) comment editing; comments stored as mergeable documents; link previews fetched from the web (no third-party calls); image resizing, captions or alignment; tables in the plain-text Markdown renderer of other apps' imports; nested tables; mentions in project notes (members of a project note are the project's own members, a follow-up); reactions on tasks or notes; custom or emoji-picker reactions; notifications for reactions; rich text in the CLI and MCP (they keep Markdown). ROADMAP.md: advances the future idea "Rich text for comments" and the household and small-team collaboration rows (`comments-and-activity`, `attachments`). No new environment variable; the op log stays additive.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `comments`: the comment entity gains per-account reactions; Markdown rendering covers the editor's subset (tables, images, mentions); the composer is the rich editor when expanded; new requirements for reactions, their routes and the Markdown round-trip.
- `rich-text-editing`: the notes editor gains block quotes, code blocks, tables, images, the slash menu, Make subtask, issue chips, mentions in notes and the touch toolbar; the plain-text projection covers the new nodes.
- `attachments`: an attachment can be embedded in a note; removal and encryption rules for embedded images.
- `subtasks`: a third way to create a subtask, from a checklist line in the notes.
- `activity-log`: reaction operations form no event; a note mention change folds into the note edit.
- `web-app`: the task panel's comment composer expands into the rich editor.
- `end-to-end-encryption`: reactions and note mention ids stay plaintext; embedded images stay encrypted bytes.

## Impact

- Server: `internal/sync/ops.go` (`task.note_mentions`, the `reactions.` field family on comments with its author rule), `internal/sync/comments.go` (filtering note mentions, the reactions check), `internal/notify` (note mentions through `MentionSink`), `internal/httpapi` (comment representation, `PUT /api/v1/comments/{id}/reactions`), `internal/activity` (ignore reaction ops; match `web/src/lib/activity.ts` through the shared fixture), `internal/importer` (export and own import of reactions and note mentions), `internal/e2ee` (nothing new is content; documented).
- Client: `web/src/lib/richtext.ts` and `richtextEditor.ts` (schema, projection, Markdown parser), `web/src/lib/markdown.ts` and `web/src/app/Markdown.tsx` (tables, images, mentions), `web/src/app/NotesEditor.tsx`, `web/src/app/task-detail/Composer.tsx` and `CommentsTab.tsx`, `web/src/lib/comments.ts` (reactions), `web/src/lib/attachments.ts` (embed, blob for images), `web/src/lib/ops.ts` and `types.ts`, the shortcut registry, five translation catalogs.
- Dependency: `prosemirror-tables` (MIT) in the lazy editor chunk; no server dependency.
- Docs: `docs/notes-and-subtasks.md`, `docs/comments-and-activity.md`, `docs/api.md` (comments, reactions, `note_mentions`), `docs/sync.md` (field family), `docs/keyboard.md`, `docs/e2ee.md`.
