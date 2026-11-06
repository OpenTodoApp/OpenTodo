# Importers: per-field limits for CSV and a depth limit for JSON

## Why

The threat model (`docs/security/threat-model.md`, "Malicious import file") lists a gap: CSV and JSON imports had no per-field or nesting limit beyond the file size (`OPENTODO_IMPORT_MAX_MB`, default 20 MB) and 50,000 rows. A valid file shaped to the worst case (one huge field, one record with a very large number of fields, deeply nested arrays) stayed within the upload limit but cost more memory and work than any real export. Item 6.9 of `external-security-review`.

## What Changes

- Every CSV profile (generic CSV, Todoist, TickTick, Linear, Asana, OmniFocus, Notion) reads through one limited reader: a field holds at most 1 MiB, a record at most 4 MiB in total and at most 1,000 fields, the header included.
- A JSON file, uploaded or inside a ZIP, is refused when objects and arrays are nested more than 256 levels deep, checked by one scan of the bytes before any profile decodes it.
- A file over one of these limits answers `413 too_large` with a message naming the limit (and the line, for CSV); no job is created and nothing is written.

Real exports stay far below these limits: a stored text value is at most 64 KiB, a document 256 KiB, and the deepest fixture JSON is 8 levels. No new route, error code or environment variable; not **BREAKING**.

Out of scope: limits on the memory one record costs while it is being read (bounded by the upload limit), the SQLite and archive limits (already in place), the import planner.

ROADMAP: hardening of a shipped feature (`data-import`), item 6.9 of `external-security-review`; no new item.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `data-import`: a file within the size and row limits is still refused when a CSV field or record, or the JSON nesting, is over its limit.

## Impact

- `internal/importer/limits.go` (new), `importer.go`, the seven CSV profiles; `internal/httpapi/import.go` maps `importer.LimitError` to 413 `too_large`.
- Tests: `internal/importer/limits_test.go`, `internal/httpapi/import_limits_test.go`; `FuzzParse` unchanged and passing.
- Docs: `docs/import.md`, `docs/import-steps.md`, `docs/api.md`, `docs/security/threat-model.md`, `docs/security/how-we-verify.md`; CHANGELOG `### Security`.
- The web app already shows `too_large` with the server's message; no new strings. Binary size: none measurable.
