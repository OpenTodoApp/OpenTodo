# Proposal

## Why

Routines can read and write the note of a task or a project, but not a standalone note: there is no way to start a routine from a note, find notes, write a note, or file one away. Meeting notes, journals, reading lists and reference notes are where people keep the text routines are best at turning into work, and the notes area has grown into its own space. The owner asked (2026-11-12) that notes be well integrated with routines.

## What Changes

- **Two new types.** Note (a standalone note) and Notes (a list of them), with the same one-or-many rules as Task and Tasks.
- **Note triggers.** `note.created`, `note.edited` (once the note has been quiet for 5 minutes, so a writing session fires once) and `note.label.added`, plus manual runs on a note (`manual` with `on: "note"`): **Run routine…** in a note's menu and the palette. Conditions on note triggers take project and labels only.
- **Note steps** in Notes and text: Find notes, Get a specific note, Create note, Change notes (project, labels, pin, Trash), Turn into task; Get note text, Add to a note and Clear a note also take a note; Sort, Pick, Count and Repeat for each take notes; Format text reads a note's title.
- **Everywhere routines go.** `POST /api/v1/rules/{id}/run` and MCP `run_routine` take `note_id`; `ot routine run --note`; routine files name notes by title.
- **Encrypted accounts.** Steps that read or write a note's text are content steps and run on an opted-in device; label, project and date steps stay on the server.
- **Shared and workspace routines** act only on their project's or workspace's notes; a viewer's notes are never written.
- Starter use cases: weekly review note, todo label to task, checkboxes to tasks, stale reference notes, journal line.

No new route, entity, dependency or mandatory environment variable; `trigger` and `steps` gain values older devices keep as "Made with a newer version". Not **BREAKING**.

Out of scope: triggers on task or project notes (those are task and project triggers); a trigger on a label removed from a note; a schedule condition over notes (Find notes covers it); note templates and daily notes as steps (`note-templates`, `daily-notes` add them); webhooks for note events (`note-webhooks`).

Archive order: first of the chain on `standalone-notes` "Integrations that leave notes out" (then `note-webhooks`, then `vault-notes`). `note-templates`, `daily-notes` and `note-checklist-tasks` build on this change.

Roadmap: the "Notes area" in ROADMAP.md.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `routines`: Note and Notes types, the note steps, manual runs on a note, notes in encrypted, shared and workspace routines, the editor, the CLI, use cases.
- `automation-rules`: the note trigger kinds and their conditions; note events after a batch.
- `standalone-notes`: routines reach standalone notes.
- `mcp-server`: `run_routine` on a note; note triggers and steps in the routine tools.

## Impact

- Server: `internal/ruleval/steps.go` (types, kinds), `internal/rules` (`observe.go` note events, a `note.edited` quiet wait as a job entry in `internal/tenant/jobs.go`, `routine_steps.go` note steps, `shared.go`, `workspace.go`, `routine_device*.go`), `internal/agenttools` planning reused, `internal/httpapi/rules.go` (`note_id`), `internal/mcp`, `internal/cli` routine run.
- Web: `web/src/lib/rules/steps.ts`, `steps.vectors.json`, `run/` device planner, `catalogue.ts`, `sentence.ts`, the editor's pickers, the note menu and palette entry (lazy, with the Notes chunk), `usecases.json`.
- Docs: `docs/routines.md`, `docs/automations.md`, `docs/notes-to-tasks.md`, `docs/mcp.md`, `docs/cli.md`.
- Size: a few KB in the lazy routines chunk; nothing on the first load; no binary dependency.
