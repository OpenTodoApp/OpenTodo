## Why

The owner decided on 2026-11-07 to make the 1.0 release lean. The screen-reader passes (NVDA with Firefox, VoiceOver on macOS and in the iOS shell, TalkBack in the Android shell) need real screen readers on real devices, and nobody has run them yet. Today `make release-prepare` refuses 1.0.0 while they are pending, so 1.0 would wait on passes that are recorded when someone runs them: the maintainer's VoiceOver on macOS and iOS, NVDA and TalkBack from community testers via issue #9. This is the same kind of change PR #991 made for the reference-device record.

## What Changes

- Pending screen-reader cells in the manual accessibility audit no longer refuse any release, candidate or final. A release with some pending prints one warning line naming how many are pending, on which screens and in which audit file, so the release notes can say so.
- Still refused: a pending keyboard-only or 200% zoom cell on a core screen (those passes are done and must stay done), a result that is not `pass`, `fail #<issue>`, `n/a <reason>` or `pending` (a `fail` without its issue), and a release more than 12 months after the latest audit.
- The accessibility statement keeps claiming partial conformance and says which passes were done; the audit record says which screen-reader passes are recorded (none yet) and how to contribute one (#9).
- `RELEASING.md`, `docs/accessibility.md` and `docs/accessibility/audit-1.0.0.md` stop saying 1.0.0 needs the screen-reader passes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `accessibility`: Recorded manual audit (`pending` is a valid result; screen-reader passes are optional for a release; keyboard and zoom are required from 1.0.0).
- `self-hosting`: Release candidates (pending screen-reader passes are a warning on any release, not only a candidate).

## Impact

`scripts/release/accessibilityAudit.mjs`, `scripts/release/prepare.mjs` and their tests; `RELEASING.md`; `docs/accessibility.md`; `docs/accessibility/audit-1.0.0.md`; a changelog fragment. No server, web app, op schema, route or dependency change; release preparation creates no ops, so offline behaviour and sync convergence are unaffected. No bundle or binary size impact.
