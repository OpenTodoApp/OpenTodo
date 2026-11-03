# OmniFocus fixtures

- `export.csv`: a real CSV export made by OmniFocus 2 for Mac (2018), as published with its text replaced in
  [juev/lists](https://github.com/juev/lists) at `c31c45e3f1518650bd84c8b6d12c1942ef25ba69`,
  `core/tests/data/OmniFocus.csv`, then run through `go run ./internal/importer/sanitize`. Its Task IDs,
  types, statuses, UTC dates, durations, flags and CRLF line ends are the app's.
  Copyright (c) 2026 Denis Evsyukov, MIT License (https://github.com/juev/lists/blob/main/LICENSE).
- `of4-layout.csv`: written by hand in the OmniFocus 4.7 layout (`Planned Date` after `Start Date`, `Tags`
  after `Notes`), as Omni's test-build notes and published OmniFocus 3/4 importers describe it; invented text.
  Replace it with a sanitised export from OmniFocus 4 when one is available (`docs/switch/README.md` records
  the last check).
