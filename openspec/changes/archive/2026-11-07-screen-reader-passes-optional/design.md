## Context

`checkAccessibilityAudit` (accessibility-aa D4, release-candidates) refused 1.0.0 and later while any core audit cell was `pending`, and on a candidate turned pending screen-reader cells into one warning. The owner decided on 2026-11-07 that the screen-reader passes no longer gate a release.

## Decisions

**D1. Pending screen-reader cells are a warning for every release.** The candidate waiver becomes the rule for all versions: the four screen-reader columns may stay `pending`, and the gate returns one line, `accessibility audit: N screen-reader passes pending on M core screens in <file> (<passes>), recorded when someone runs them (#9)`, which `prepare.mjs` prints as a warning so the release notes can say how many are pending. Alternative considered: print nothing. Rejected, because a release should say what it does not claim.

**D2. Everything else stays strict.** Keyboard-only and 200% zoom were run on every core screen and must stay done, so a pending cell there still refuses. A cell that is not a valid result (for example `fail` without `#<issue>`) refuses, and so does an audit more than 12 months old.

**D3. The claim stays partial.** The statement generator already says "Partially conforms" while anything is pending; nothing changes there. The docs say which passes were done and how to contribute a screen-reader pass (#9).

## Risks

Releases could ship for a long time with no screen-reader pass recorded. The warning line on every release and the partial claim keep that visible.
