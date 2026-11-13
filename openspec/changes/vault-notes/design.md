# Design

## Context

The vault (`internal/vault`, `markdown-vault`) is a sync device `vault:<id>` that pulls and pushes operations and keeps per-entity last-synced values in `.opentodo/state.json`. Project files carry `opentodo-id` front matter; task notes are the indented block under a task line, written as `description` and folded into the rich-text document by the next app that opens it. TaskNotes support already maps a whole Markdown file to one entity with front matter preserved byte for byte. Standalone notes (`note` entity: `title`, `notes_doc`, `description`, `project_id`, `labels`) are not written.

## Goals / Non-Goals

Goals: every standalone note as a plain file a person can edit anywhere; edits on both sides of a body survive whenever they touch different lines; nothing changes for a vault until notes are turned on.

Non-goals: a second layout with folders per project; images and attachments as files; Obsidian wikilink resolution; changes to the server.

## Decisions

### D1. One flat `Notes/` folder

All notes live in `<vault>/Notes/`, one file per note, named after the title with the vault's file-name rules (`/`, `\` and refused characters as `-`, clashes with a numeric suffix, "Untitled note" for an empty title). The project is a front-matter link, not a folder.

Alternatives considered:
- **A `Notes/` folder inside each project's folder.** Mirrors the project tree but turns every project file into a folder the moment it has a note, which renames paths people already use in Obsidian; moving a note between projects becomes a file move across folders. Rejected.
- **Notes inside the project file.** Long notes would bury the task lines and break the 5,000-line budget. Rejected.

### D2. Front matter

```markdown
---
opentodo-id: 0193f1c2-…
project: "[[Home]]"
tags: [reference, deep-work]
---
Body Markdown…
```

`project` names the project's file (resolved by path to its `opentodo-id`); a link that names no project file is reported and leaves the project unchanged. `tags` use the vault's tag spelling (spaces as `-`); a tag naming no label creates one, as for task lines. Keys the vault does not own are preserved.

### D3. Body merge by lines

The state keeps each note's last-synced title, project, labels and body text. Title, project and labels merge per field, app wins on both-sides changes, as everywhere in the vault. The body is merged as text: a diff3 over lines between the last-synced body, the file and the app's `description`. Non-overlapping hunks are combined and pushed as one plain-text write; overlapping hunks keep the app's lines, and the file's whole body is appended to `Notes/<title>.conflict.md` with the time. The push uses the API's version check so a body that changed again on the server since the pull is merged on the next sync instead of overwritten.

Alternatives considered:
- **Whole-field rule (app wins).** Simple, but a note edited on a phone and in Obsidian on the same day would lose the file's edit every time; rejected for the body only.

### D4. Links rewritten at the edge

On write, `[text](?note=<id>)` becomes a relative Markdown link to the note's file and `[text](?project=<id>)` to the project's file, when that file exists; on read, a relative link to a vault file with an `opentodo-id` becomes the id form again. Unknown targets and task links are left as written. The app's Markdown is therefore unchanged by a round trip (pinned by a fixture).

### D5. Switch and state

`state.json` gains `notes: true|false` (absent reads as false). `init` writes true. `ot vault notes on` writes every note on the next sync (adopting existing `.md` files in `Notes/` as new notes, the same rule as `--adopt` for project files); `off` stops reading and writing `Notes/` and keeps the files and their last-synced values so `on` again does not duplicate. The lease of `obsidian-vault-sync` is unaffected. The plugin's port ignores `Notes/` until it supports it, because it reads the same `notes` member and refuses nothing.

### Data model

No op field or server table. Writes are ordinary `note` operations (`title`, `description` plain-text write, `project_id`, `labels`, `deleted_at`) from device `vault:<id>`, converging under per-field last-writer-wins and the document merge like any device's.

### Size

A few kilobytes in `ot`; memory grows by each note's last-synced body in the state file (at most 5,000 × 64 KB on disk, read lazily per changed note).

## Risks / Trade-offs

- A note moved into a project with another sharing scope is a copy and a delete on the server (`standalone-notes` "Notes follow their project"): the vault rewrites the file with the new id and reports the move.
- Titles that differ only in characters the file system refuses can swap suffixes after a rename; files are matched by `opentodo-id`, so nothing is lost.
