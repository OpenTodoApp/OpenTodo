# Design

## Context

- **Formats today.** `internal/importer` reads every format through the `Profile` interface (`Name`, `Description`, `Detect(data)`, `Read(r, opts)`). The ordered `Profiles` slice is `opentodo`, `json-items`, `json-lists`, `json-generic`, `csv`. Detection takes the first profile whose `Detect` accepts the bytes.
- **What profiles produce.** Normalised `Row`s (kind, source id, parent reference, project and section names, labels, priority, due, recurrence string, reminders, description, completion, warnings). Planning (`plan.go`), duplicate detection, sections, recurrence parsing, reminders and the op-writing job are shared.
- **Upload.** `internal/httpapi/import.go` reads the whole body up to `ImportMaxBytes` (default 20 MB, `MaxBytesReader` plus `LimitReader`) before parsing. Row cap: 50,000.
- **Fixtures.** `internal/importer/testdata/` holds synthetic samples (`generic.json`, `items.json`, `lists.json`, `tasks.csv`).
- **Specs:** `specs/data-import/spec.md` and `specs/documentation/spec.md` in this change.

## Goals / Non-Goals

**Goals:**
- A real export from each app imports with zero manual conversion and a preview that explains every dropped attribute.
- Detection that never misfires: a file is assigned to a named format only on that format's distinctive signature.

**Non-Goals:**
- Supporting every historical variant of each app's export. We support the current one, verified by fixtures. Older variants are added when a user reports one, with the reported file as a new fixture.

## Decisions

### D1. One profile per named format, ahead of the generic ones
New profiles `todoistCSV`, `tickTickCSV`, `linearCSV` and `thingsJSON` implement `Profile`. `Profiles` becomes: `opentodo`, `things-json`, `json-items`, `json-lists`, `json-generic`, `todoist-csv`, `ticktick-csv`, `linear-csv`, `csv`. Named formats sit before the generic shape they would otherwise fall into, so a Linear CSV (which has a `Title` column) is not taken by the generic `csv` profile.

Each `Detect` uses a signature, not a guess:

| Format | Signature |
| --- | --- |
| `todoist-csv` | Header contains `TYPE`, `CONTENT` and `PRIORITY` (with `INDENT`) |
| `ticktick-csv` | Leading metadata lines, then a header containing `Folder Name`, `List Name`, `Title` and `Kind` |
| `linear-csv` | Header contains `ID`, `Team`, `Title`, `Status` and `Priority`, and IDs match `^[A-Z][A-Z0-9]*-\d+$` |
| `things-json` | Top-level object with `"format": "things-export"` (the published shape, D4) |

Exact column lists are confirmed against the maintainer's real exports before coding (task 1.1).

### D2. ZIP as a container, not a format
A small `archive` step runs before detection. When the upload starts with the ZIP signature (`PK\x03\x04`), entries are listed with `archive/zip` from the in-memory bytes (the body is already bounded):
- Entries over the limits (1,000 entries; uncompressed total over ten times `ImportMaxBytes`, checked from headers and enforced while reading with a `LimitReader`) refuse the upload.
- Folders, `__MACOSX/` and dot-files are skipped.
- Every remaining entry must detect as the same profile.

The profile then reads each entry. Rows are concatenated with the entry name as the project when the format names projects per file (Todoist), and line numbers are prefixed with the entry name in the preview. A Todoist backup is therefore `todoist-backup` = ZIP + `todoist-csv`, with the format reported as `todoist-backup`.

Alternative considered: a format-specific ZIP reader inside the Todoist profile. Rejected because the archive limits and safety checks belong in one place, and a TickTick or Linear ZIP would need the same.

### D3. Mapping notes per app
- **Todoist.**
  - Rows are `task`, `section` and `note`. `INDENT` builds the subtask tree with a stack.
  - `PRIORITY` in the CSV is Todoist's internal scale, where 4 is the highest. It maps to p1 = 4, p2 = 3, p3 = 2, p4 = 1, confirmed against the fixture where a red flag task must come out p1.
  - `@label` tokens in `CONTENT` become labels and are removed from the title.
  - `DATE` is a natural-language string. It goes through the existing NLP date parser with `DATE_LANG`, and recurring strings through the recurrence grammar, with a warning when not expressible.
  - Notes append to the description under "Comments", because the author can't be kept.
- **TickTick.**
  - Metadata lines are skipped up to the header.
  - `Kind = CHECKLIST` rows produce one task plus subtasks from the content's checklist lines. Status `2` means completed.
  - Priority 5/3/1/0 maps to p1 to p4.
  - `Repeat` RRULEs go through the existing RRULE conversion.
  - `Timezone` plus `Is Floating`: a floating value keeps its wall clock, a zoned one converts to the preview's time zone (the existing rule).
- **Linear.**
  - The project comes from `Project`, else `Team`. `Status` becomes the section name, in first-seen order.
  - The state type is not in the CSV, so `Completed` / `Canceled` timestamps decide completion, and canceled issues get the label `canceled`.
  - The priority label maps to p1 to p4. `Parent issue` is the parent reference.
  - The description is prefixed with the identifier.
- **Things.** See D4.

### D4. A published Things shape and recipe
Things has no export, so we define `things-export` v1:

```
{ "format": "things-export", "version": 1,
  "areas": [{ "id", "title", "tags": [] }],
  "projects": [{ "id", "title", "area", "notes", "tags", "when", "deadline", "completed" }],
  "headings": [{ "id", "title", "project" }],
  "todos": [{ "id", "title", "notes", "project", "heading", "area", "tags",
              "when", "deadline", "repeat", "evening", "someday",
              "checklist": [{ "title", "completed" }], "completed", "created" }] }
```

The switch guide ships an Apple Shortcut (shared via an iCloud link the maintainer creates, with its source steps written out in the guide) that reads Things through its Shortcuts actions and writes this JSON. `docs/import.md` documents the shape, so any tool can produce it. Other mapping decisions:
- `when` becomes the due date.
- `deadline` is kept as a description line.
- `someday` and `evening` are dropped with warnings until those features exist.
- `repeat` goes through the recurrence grammar.

### D5. Fixtures from real exports, sanitised
The maintainer provides real exports from throwaway accounts. Before committing, a small script (`internal/importer/testdata/sanitize.go`, a `go run` tool and not part of the binary) replaces names, titles and notes with deterministic placeholders. It keeps structure, dates, priorities, recurrence strings, indent levels, column order and metadata lines.

Fixtures live in `testdata/<format>/`, each with a golden preview (`*.golden.json`: rows, warnings, errors). Tests compare the preview with the golden file. `-update` regenerates it, and a changed golden file is visible in review (spec "verified against real exports").

### D6. Switch guides
`docs/switch/<app>.md` uses the existing front matter (audience `user`, specs `data-import`, screens `settings/import`). Each has four parts:
1. Export from the app, with steps and where the file lands.
2. Import into OpenTodo.
3. What carries over (a table generated from the same mapping as `docs/import.md`, kept in sync by the docs check through shared anchors).
4. What doesn't, and why.

Screenshots of the import preview come from the screenshot script with the fixtures.

## Risks / Trade-offs

- [Apps change their export format] → Fixtures pin today's format, and a user report becomes a new fixture plus a detection tweak. The preview always tells the user what was recognised.
- [The Todoist priority scale is inverted between UI and CSV] → Settled by a fixture with known UI priorities (D3), not by assumption.
- [ZIP bombs or path traversal] → Entries are never written to disk, only read in memory under the limits. Names are used only as labels.
- [Personal data leaking through fixtures] → The sanitiser (D5), plus maintainer review of every fixture before commit.
- [The Things Shortcut depends on Apple's Shortcuts actions] → The shape is published, so alternative exporters can target it. The guide states the Things version tested.
- [Size] → No dependency. A few hundred lines per profile. No effect on image size or runtime memory beyond the existing upload bound.

## Migration Plan

Additive: new format values only. Existing imports, jobs and undo are unchanged. Rollback is a revert. Jobs already created with a new format keep working for undo, because undo only uses recorded entity ids.

## Open Questions

- Exact column names and edge cases per app, confirmed against the maintainer's exports (task 1.1). This refines D1 signatures without changing the approach.
