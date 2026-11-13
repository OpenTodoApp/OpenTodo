# Proposal

## Why

People write the same kinds of note again and again: meeting notes, a 1:1, a trip plan, the weekly review. Today each one starts from an empty page, or from a copy of last week's note with its old text still in it. A note should be able to start from a saved skeleton, and a routine should be able to start one on a schedule ("every Monday at 09:00, a meeting note for the stand-up").

## What Changes

- **Templates are notes.** Any standalone note can be marked **Use as template** in its menu (an additive boolean field `template` on `note`). A template is still a note: it syncs, is shared through its project and is edited like any other. The Notes page marks it with a quiet "Template" word after the title, and the search token `template` (alongside the `notes-space` tokens) lists templates only.
- **New note from a template.** **New note** gets a split menu: **From template…** opens a Combobox of the user's templates and the built-in ones. Choosing one creates a new standalone note with the template's title, text, project and labels, its placeholders filled in, in one batch with one Undo, offline included. The new note is a plain copy: later edits of the template never change it.
- **Placeholders.** `{{date}}`, `{{weekday}}`, `{{time}}` and `{{title}}` are replaced when the note is created, on the device, with the user's date and time preferences and day start. Anything else in braces stays as written.
- **Built-in templates.** The template library gains note templates in `templates/notes/<slug>/note.yaml` (Meeting, 1:1, Trip, Weekly review, Daily), with translations like project templates, compiled by `make templates` into the same `library.json` (`web/src/generated/templates.json`, `internal/templatelib`) and validated in CI.
- **Routines.** A new step **Create a note from a template** (template, title, project, labels, date) outputs the new Note, so a schedule can start a note and later steps can add to it. It is planned like **Create note** of `notes-in-routines`. A new starter "Monday meeting note" ships in `templates/routines/`.

Not **BREAKING**: one additive op field, no route, no environment variable.

Out of scope: templates for task notes and project notes (a task template is a project template); templates with fields or prompts beyond the four placeholders; a template picker in the CLI, REST or MCP (`create_note` keeps creating plain notes; a later change can add a `template` argument); keeping created notes in sync with their template.

Builds on `notes-in-routines` (the Note type, the Create note step) and on `notes-space` (search tokens). Archive after both.

Roadmap: the "Notes area" in ROADMAP.md.

## Capabilities

### New Capabilities

- `note-templates`: marking a note as a template, creating a note from one, placeholders, built-in note templates.

### Modified Capabilities

- `template-library`: note templates in the library, their format and validation.
- `notes-page`: the Template mark, the `template` token and From template… beside New note.
- `routines`: the Create a note from a template step and its starter.

## Impact

- Server: `internal/sync/ops.go` (`note.template`, regenerated `web/src/generated/opSchema.ts` and the contract fixture); `internal/templatelib` reads note templates; the routine planner in `internal/rules` gains one step kind; `scripts/templates-build.mjs` and its checks.
- Web: `web/src/lib/noteTemplates.ts` (placeholders, shared vectors with Go), the split New note button and the template Combobox in the lazy Notes chunk, the note menu entry, the routine step card.
- Templates: `templates/notes/` with five templates and translations; `templates/routines/monday-meeting-note/`; `templates/README.md`.
- Docs: `docs/notes.md`, a new `docs/note-templates.md`, `docs/routines.md`.
- Size: the built-in note templates add about 4 KB gzip to the template library, which loads only when a template list opens; nothing on the first load.
