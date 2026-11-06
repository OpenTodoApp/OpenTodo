# Design

## D1 — One CSV reader for every profile

`csvReader` embeds `*csv.Reader` (profiles keep setting `Comma`, `LazyQuotes`, `FieldsPerRecord`, `ReuseRecord` and calling `FieldPos`) and overrides `Read` to check each record: at most 1,000 fields, no field over 1 MiB, at most 4 MiB in total. A violation is a `*LimitError`, not a `csv.ParseError`, so the profiles' "skip an unreadable record" branch does not swallow it: `csvFailure` passes it through and turns anything else into the same `FileError` as before. Detection (`Detect`) reads only the first record and simply fails to match on a violation.

The check runs after `encoding/csv` has read the record, so reading one record still costs memory up to its length; the upload limit bounds that. The limits bound what the parse keeps and hands on (rows, previews, ops).

## D2 — JSON depth by scan

`checkShape` runs in `Parse` before detection and in `parseOne`, which every archive entry goes through. For data that starts with `{` or `[` (after a byte order mark and white space) it counts nesting of objects and arrays in one pass, skipping strings and escapes, without allocating, and refuses more than 256 levels. Go's decoder has its own limit of 10,000; 256 is far above any export (the deepest fixture is 8) and leaves room for deeply nested note documents in an own export.

## D3 — Errors

`LimitError` maps to `413 too_large` like a file over the size limit or the row limit, so the web app's existing message ("This is too large for the server: …") shows the server's sentence. No new error code, no new strings.

## Data model and size

No data model change. Standard library only.
