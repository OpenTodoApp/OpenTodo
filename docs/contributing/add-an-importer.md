---
title: Add an importer
summary: Teach OpenTodo another app's export - the profile, its detection signature, the sanitiser, fixtures and goldens, the switch guide and the migration matrix row.
audience: developer
section: Contributing
specs: [data-import]
screens: []
order: 6
---
# Add an importer

An importer reads one file an app exports and turns it into operations, with a preview first and an undo after. It never calls the app's API. The importers live in `internal/importer`; the behaviour is the `data-import` spec.

## 1. The profile

Add `internal/importer/profile_<app>.go` with a type that implements `Profile` (`internal/importer/importer.go`):

- `Name()`: the format id, such as `vikunja-export`. It is part of the API and the export format: never rename it.
- `Detect(data)`: a **signature** only this app's export has: an exact CSV header, a ZIP entry name, the top-level JSON keys, the SQLite tables. Detection must not claim another app's file.
- The mapping: what the model holds (projects, sections, tasks, labels, dates, repeats, reminders, notes, subtasks, comments, attachments, time). Everything else is dropped with a warning per row in the preview, never silently.

Register it in `Profiles`, add the id to `ImportFormat` in `web/src/lib/types.ts`, and add a row to [Import formats](../import.md).

## 2. Fixtures from a real export

Ask for, or make, two real exports: a small one and a rich one that uses every feature you map. Strip the personal content with the sanitiser, which keeps the structure:

```sh
go run ./internal/importer/sanitize <export> internal/importer/testdata/<format>/export.<ext>
```

A new container format may need its own mode in `internal/importer/sanitize`. Read every output before committing it.

## 3. Goldens

Each fixture gets a golden preview next to it (`<file>.golden.json`): detected format, counts, warnings. Write them, then review the diff:

```sh
go test ./internal/importer -run Named -update
go test ./internal/importer
```

The fuzz target runs your parser on random input too (`scripts/fuzz.sh 1m ./internal/importer`).

## 4. The switch guide and the picker

- `docs/switch/<app>.md`: export steps under a `## Export from <App>` heading (the Import screen shows that section inline), the import steps, what comes with you and what stays behind. Copy the shape of an existing guide.
- A row in `SWITCH_APPS`, `web/src/lib/switchApps.ts`, for the **Switching from…** picker.
- A row in the migration matrix, [Switch from another app](../switch/README.md): app, format id, what comes with you, what stays behind, and the date and app version you last checked a real export.

## 5. Check it

```sh
make repo-check   # matrix row, guide with its export section, fixtures with goldens, picker entry
make docs-check
cd web && npm test
```

The release check for 1.0 refuses a matrix date older than 120 days, so keep the date honest.
