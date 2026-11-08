## MODIFIED Requirements

### Requirement: Release candidates

`make release-prepare` SHALL accept a release candidate version `x.y.z-rc.N` (N from 1) as well as `x.y.z`. For a candidate, it SHALL add a `## [x.y.z-rc.N] - <date>` section under `## [Unreleased]` in `CHANGELOG.md`, with the changelog fragments as its entries, and a compare link from the latest release. It SHALL keep the fragments and SHALL change no other file: no deploy template, self-hosting doc, store field, Helm chart, web app version or `upstream/` copy moves to a candidate. The final `x.y.z` SHALL replace the sections and links of its candidates with one section built from the fragments, which it deletes. A candidate whose number is not higher than the last open candidate of the same release SHALL be refused. While a newer release has open candidates, any other release or candidate SHALL be refused. Both refusals SHALL happen before any file is written.

The release gates SHALL run for `x.y.z`. For a candidate, a value of the release's reference-device record, when it has one, over budget without an issue SHALL be reported as a warning that names it. A missing reference-device record SHALL be neither a warning nor a refusal until real devices are measured (owner decision 2026-11-07, issue #990). For any release, candidate or not, pending screen-reader passes (NVDA, VoiceOver, TalkBack) on core screens SHALL NOT refuse it and SHALL be reported as one warning naming how many are pending, their screens and the audit file (owner decision 2026-11-07, issue #9). Every other gate SHALL refuse a candidate as it refuses the release: the upgrade fixture, the screenshots, the security review rule, the migration matrix dates, the audit's age, and the keyboard and zoom passes. For `x.y.z` every other gate SHALL be strict. A candidate tag SHALL NOT publish the Helm chart, the Claude plugin or the Obsidian plugin, and SHALL NOT be submitted to Google Play. Release preparation creates no ops, so offline behaviour and convergence are unaffected.

#### Scenario: Preparing the first candidate

- **WHEN** the latest release is 0.23.0, the 1.0 upgrade fixture exists, and a maintainer runs `make release-prepare VERSION=1.0.0-rc.1` with two changelog fragments
- **THEN** only `CHANGELOG.md` changes: a `## [1.0.0-rc.1]` section with both entries and a `[1.0.0-rc.1]` link comparing `v0.23.0...v1.0.0-rc.1`, while `[Unreleased]` still compares from `v0.23.0` and both fragments remain

#### Scenario: Owner-dependent gates warn on a candidate

- **WHEN** `1.0.0-rc.1` is prepared without `docs/performance/results-1.0.0.md` and with screen-reader passes pending in the accessibility audit
- **THEN** preparation succeeds and prints one warning, naming how many screen-reader passes are pending, their screens and the audit file, and none about the missing record

#### Scenario: An over-budget device record warns on a candidate

- **WHEN** `1.0.0-rc.1` is prepared with a `docs/performance/results-1.0.0.md` whose Android cold start is over budget and links no issue
- **THEN** preparation succeeds and prints a warning naming the record and the value, and `1.0.0` itself would be refused until the value is fixed or links an issue

#### Scenario: Other gates stay strict on a candidate

- **WHEN** `1.0.0-rc.1` is prepared without the `upgrade/1.0` fixture, or with a keyboard pass pending
- **THEN** preparation fails as it would for 1.0.0 and writes nothing

#### Scenario: The release after its candidates

- **WHEN** `1.0.0` is prepared after `1.0.0-rc.1` and `1.0.0-rc.2`, with the screen-reader passes still pending
- **THEN** preparation prints the one screen-reader warning, `CHANGELOG.md` has one `## [1.0.0]` section with every fragment, no candidate section or link remains, and the fragments are deleted

#### Scenario: Another release while candidates are open

- **WHEN** `1.0.0-rc.1` is in `CHANGELOG.md` and a maintainer prepares `0.23.1` or `1.1.0-rc.1`
- **THEN** preparation fails, naming the open candidates of 1.0.0

#### Scenario: A candidate tag publishes to no store or plugin directory

- **WHEN** the tag `v1.0.0-rc.1` is pushed and the release job succeeds
- **THEN** the GitHub release is a pre-release with the candidate's section as its notes, and the Helm chart, Google Play, Claude plugin and Obsidian plugin jobs do not run
