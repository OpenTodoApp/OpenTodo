# Release candidates in the release tooling

## Why

The owner wants to tag `v1.0.0-rc.1`. The release workflow already treats a suffixed tag as a pre-release (no `stable`, no line tag, no Helm chart, no Google Play), and `scripts/release-notes.sh` needs a `CHANGELOG.md` section for the tag. But `make release-prepare` (`scripts/release/prepare.mjs`) accepts only `x.y.z`, so there is no prepared way to write that section, and preparing `1.0.0` itself would move every store template and refuse the release on gates that need the owner's own devices: the reference-device record and the screen-reader passes of the accessibility audit. The owner decided (DECISIONS.md, 2026-11-06) that the 1.0 RC may ship with the screen-reader passes pending; they are required before 1.0 final. Two publish jobs of the release workflow also still ran for a candidate: the Claude plugin marketplace push and the Obsidian plugin push, which would put a candidate in front of everyone who installs either.

## What Changes

- `make release-prepare VERSION=x.y.z-rc.N` (N from 1) prepares a release candidate: it adds `## [x.y.z-rc.N] - <date>` under Unreleased in `CHANGELOG.md` with the changelog fragments as its entries and a compare link from the latest release, and changes nothing else. The fragments stay. Templates, docs, the bug report form, the web app's version, the store fields and the `upstream/` copies stay on the latest release.
- Each candidate lists everything since the latest release. The final `x.y.z` replaces its candidates' sections and links with one section from the fragments, which it deletes, as for any release. A candidate number that is not higher than the last one is refused, and so is any other release while candidates of a newer release are open.
- The release gates run for `x.y.z`. On a candidate, a missing or over-budget reference-device record and pending screen-reader passes (NVDA, VoiceOver on macOS and iOS, TalkBack) are warnings that name what is pending. Everything else stays strict: the upgrade fixture, the screenshots, the security review rule, the migration matrix dates, the audit's age, and the keyboard and zoom passes. For the final release everything is strict, as before.
- The release workflow skips the Claude plugin and Obsidian plugin publish jobs for a candidate tag, like the Helm chart and Google Play.
- RELEASING.md describes the flow.

No op log, route, setting or environment variable changes. Not **BREAKING**.

Out of scope: other pre-release kinds (`-beta.N`, `-alpha.N`); candidates for a patch release (allowed by the tool, not needed); building the 1.0 upgrade fixture, the device record or the audit passes themselves.

ROADMAP: the road to 1.0 (the release itself); no new item.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `self-hosting`: release preparation supports release candidates, and a candidate tag publishes nowhere a store or a plugin directory installs from.

## Impact

- `scripts/release/prepare.mjs` (version parsing, `runGates`, `candidateChangelogText`, `withoutCandidates`, `candidates`), `scripts/release/accessibilityAudit.mjs` (`auditFindings`, `SCREEN_READER_PASSES`, the `candidate` option).
- `.github/workflows/ci.yml`: the `claude-plugin` and `obsidian-plugin` jobs skip candidate tags.
- Tests: `scripts/release/prepare.test.mjs`, `scripts/release/accessibilityAudit.test.mjs`.
- Docs: `RELEASING.md`, `changelog.d/README.md`.
- No effect on the binary, the image or the web bundle.
