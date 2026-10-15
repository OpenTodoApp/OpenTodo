# Implementation notes

## Status (2026-10-15)

Done on `feat/inbox-triage`: 1.1 `web/src/lib/triage.ts` (queue, progress, announcements) with tests for the spec scenarios. Everything else is screens, shortcuts, docs and smoke tests, held until the ux-overhaul PRs (through its group 4, which re-cuts the sidebar and router) merge.

## Decisions taken while implementing

- The queue state also has `advance` and `back` helpers, so the view and the Vim layer share one definition of what a decision and `k` do.
- Outcome dates are passed in already formatted, so the module stays free of the user's date preferences.
