# Design

## Context

Standalone notes (`standalone-notes`) have a title, a mergeable document, a project and labels. The template library (`template-library`) ships project templates and routine starters from `templates/`, compiled into one `library.json` read by the web app and by `internal/templatelib`. Routines (`routines`) gain a Note type and note steps in `notes-in-routines`.

## Goals / Non-Goals

Goals: start a note from a skeleton in two keystrokes; let people keep their own templates as ordinary notes; ship a few good ones; let a routine create a note from a template.

Non-goals: a template language, forms, linked templates that update their copies, templates for task or project notes.

## Decisions

### D1. A template is a note with a flag

`note.template` (`kBool`, default `false`, not content) marks a template. Everything else a note has (sync, sharing, encryption, Trash, history, links) applies unchanged, so there is no second editor and no second storage. Marking or unmarking is one op, last-writer-wins.

Alternatives considered:
- **A separate `note_template` entity.** Rejected: a second entity with the same fields, a second editor, and a second sharing path.
- **A label named "template".** Rejected: labels are the user's own, renaming one would silently turn templates into notes, and a label has no meaning for routines.

### D2. Creating from a template copies on the device

The device reads the template's Markdown projection (decrypted on an encrypted account), fills the placeholders, and writes a new note in one batch: `title`, `description` and a `notes_doc` built from the filled Markdown, the template's project and labels, `template: false`. The batch is local first and syncs like any new note. Undo removes the new note. The copy keeps no reference to its template.

The project follows the template unless the user is a viewer of the template's project, in which case the copy goes to the user's personal scope without a project (a viewer may read a template but not write into its project).

### D3. Four placeholders, resolved once

| Placeholder | Becomes |
| --- | --- |
| `{{date}}` | The day in the user's date format (`date-time-preferences`), after the day start |
| `{{weekday}}` | The weekday's name in the interface language |
| `{{time}}` | The time in the user's time format |
| `{{title}}` | The new note's title (after its own placeholders) |

Placeholders are matched exactly (`{{` name `}}`, no spaces); anything else in braces is left as written, so code blocks and other apps' syntax survive. Resolution is one function, `web/src/lib/noteTemplates.ts`, with a Go twin in `internal/templatelib` for routines, pinned by shared vectors `internal/templatelib/testdata/placeholders.vectors.json`.

### D4. Built-in note templates live in the library

`templates/notes/<slug>/note.yaml` holds `title`, `summary`, `icon`, `author`, `reviewed` and `body` (Markdown, at most 8 KB), with `<language>.yaml` translations of the title, summary and body. `make templates` compiles them into `library.json` under `notes`. Built-ins are never written to the account until used: choosing one creates a note from it like a user template. Five ship: Meeting, 1:1, Trip, Weekly review and Daily (which `daily-notes` offers as its default).

### D5. The routine step

**Create a note from a template** takes a template (a user template from the note picker, or a built-in by slug), a title (Text with placeholders; the template's title when empty), a project and labels (the template's when empty) and a date (Date; the run's day by default) and outputs a Note. It plans through the agent tool registry's `create_note` planning with the filled text, so a run creates exactly what the device would. On an encrypted account it is a content step and runs on a device (`routines` "Routines run on devices for encrypted accounts"). A user template moved to the Trash fails the run at that step with `template_missing` and nothing is written.

### Interface budget

No new row: From template… is the split part of the existing New note button in the header, the Template mark is a word on the row's existing title track, and the `template` token lives in the search field. No new scroll region, no sidebar destination. No new shortcut: on the Notes page `Shift+Q` is free in the registry and opens From template… (registered under the Notes scope, no conflict with `q`).

## Data model

One additive field, `note.template` (bool, default false), declared in `internal/sync/ops.go` `Schema` with its comment; regenerate with `UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema`. No rename, no migration.

## Size and memory

Built-in templates: about 4 KB gzip in the lazily loaded library. Placeholder code: under 1 KB in the Notes chunk. No dependency. Server memory unchanged.

## Risks / Trade-offs

- A template is easy to edit by mistake while meaning to use it. Mitigation: opening a template shows **Use template** as its primary action and the Template mark in its header.
- Placeholders are fixed at creation; a note created on Sunday for Monday's meeting carries Sunday's date. The routine step takes an explicit date for that case.
