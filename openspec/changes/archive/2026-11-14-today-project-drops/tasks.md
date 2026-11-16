# Tasks

## 0. Project-group drop depth

- [x] 0.1 Reuse the project list's gap placement and verify the indented line and sibling order with a cross-project saved view drop and Undo.
- [x] 0.2 Verify the saved view gesture in Chromium and measure its build.

## 1. Today's personal order

- [x] 1.1 Extend the existing order host with a bounded Today preference; verify synced defaults, offline edits and Undo through order tests and `go test ./...`.
- [x] 1.2 Expose Manual order only in Today grouped by Project and clear the order on Reset; verify the other groupings and Upcoming behavior in built-in view tests.
- [x] 1.3 Test that the first explicit placement starts with the current visible order and that a project-only transfer preserves sort and rank, including across an ID replacement.

## 2. Today project-group drops

- [x] 2.1 Reuse the project-group move planner for top-level transfers, nesting and permissions; verify cross-group placement, the displayed Inbox, special groups, and one Undo in view interaction tests.
- [x] 2.2 Update Today help and changelog. Run OpenSpec validation, the web tests and build, `make check`, and the bundle budget. Capture desktop and phone before/after and verify in a real browser.
- [x] 2.3 Expose nested rows as pointer drop targets. Reuse the saved view's depth and sibling placement. Verify direct and gap nesting under another project's existing subtask, Undo, and the local demo.
