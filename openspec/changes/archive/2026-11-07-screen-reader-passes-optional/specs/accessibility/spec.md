## MODIFIED Requirements

### Requirement: Recorded manual audit
A manual audit SHALL be recorded in `docs/accessibility/audit-<version>.md` before 1.0.0 and at least every 12 months after, with one row per core inventory entry and a result for keyboard only, NVDA with Firefox on Windows, VoiceOver with Safari on macOS, VoiceOver in the iOS shell, TalkBack in the Android shell, and 200% zoom with browser text size 20. Each result SHALL be `pass`, `fail` with an issue link, `n/a` with a reason, or `pending` (not yet run). Every failure on a core screen SHALL be fixed before 1.0.0; a failure on a non-core screen MAY remain only as a listed exception with an issue and target version and SHALL NOT concern a Level A criterion. The repository checks SHALL fail on a missing core row, an empty result, or a failure not listed as an exception, and `make release-prepare` SHALL refuse a release dated more than 12 months after the latest audit. From 1.0.0, `make release-prepare` SHALL refuse a release while a core screen's keyboard-only or 200% zoom result is `pending` or any core result is not a valid result. The screen-reader passes SHALL NOT gate a release: they are recorded when someone runs them (owner decision 2026-11-07, issue #9), and a release with some pending SHALL print one line naming how many are pending. While any result is pending the statement SHALL claim partial conformance.

#### Scenario: Audit record complete
- **WHEN** the 1.0 audit file has a row for every core screen with every column filled and no failures
- **THEN** the check passes and the statement reads "Fully conforms"

#### Scenario: Stale audit blocks a release
- **WHEN** a maintainer prepares a release 13 months after the latest audit file's date
- **THEN** `make release-prepare` fails saying a manual accessibility audit is due

#### Scenario: Unlisted failure
- **WHEN** the audit records `fail #812` for TalkBack on the Settings screen and the statement does not list issue 812
- **THEN** the repository check fails naming the screen and the issue

#### Scenario: Screen-reader passes pending at a release
- **WHEN** `1.0.0` is prepared with every core keyboard and zoom pass done and the NVDA, VoiceOver and TalkBack passes pending
- **THEN** preparation succeeds and prints one line naming how many screen-reader passes are pending and the audit file, and the statement reads "Partially conforms"

#### Scenario: Keyboard pass pending at a release
- **WHEN** `1.0.0` is prepared with a core screen's keyboard-only result `pending`
- **THEN** preparation fails naming the screen and the pass, and writes nothing
