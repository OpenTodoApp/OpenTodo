# Design

## D1: A candidate changes only CHANGELOG.md

Everything else `make release-prepare` edits is what someone installs: pinned store templates (Runtipi, TrueNAS, Umbrel, CasaOS, Easypanel, the Home Assistant add-on), the Helm chart's version, the self-hosting docs, the bug report form's placeholder, the Claude plugin's manifest, `web/package.json`, and their `upstream/` copies. The release workflow publishes none of them for a candidate: no `stable` or line tag, no chart, no store submission. If prepare moved them, `main` would name an image the stores never got, and `make deploy-check`, which reads the latest release from `CHANGELOG.md`, would have to know about candidates. So a candidate writes only its `CHANGELOG.md` section and link. Everything that reads "the latest release" (`latestRelease`, the docs version, the roadmap page, `DOCS_VERSION` in the Makefile) matches `## [x.y.z]` exactly, so all of it still reads the latest final release. The binary, image and APK still report the candidate's version, because CI takes it from the tag.

## D2: Fragments across candidates and the final release

Options considered:

1. A candidate consumes the fragments, and the final release lists only what changed since the last candidate. Someone upgrading from 0.23 to 1.0, the usual reader, would then have to read the release plus every candidate. The GitHub release and Google Play notes of 1.0.0, both taken from its section, would be nearly empty.
2. A candidate consumes the fragments, and the final release merges the candidates' sections. This needs a parser that merges Markdown sections, and the order within a section and the hand-written summaries collide.
3. **Chosen: a candidate is a snapshot.** Its section is the fragments as they are, and they stay in `changelog.d/`. The next candidate is again everything since the latest release, including fragments that were changed in between. The final release takes the fragments as any release does and deletes them, and it drops its candidates' sections and compare links from `CHANGELOG.md`.

Option 3 needs no merge code. The final section is complete for everyone who upgrades from the last release, and `CHANGELOG.md` keeps one section per release, so the website's changelog shows no duplicates. The candidates' notes stay on their GitHub pre-release pages. A summary written under a candidate's heading goes away with it, and the final release gets its own. The `[Unreleased]` link keeps comparing from the latest release while candidates are open, because the fragments it points to are still unreleased.

The `0.3.1-rc.1` section from before this change is history. Only candidates of a release newer than the latest one count as open, so it neither blocks a release nor gets removed.

## D3: Ordering rules

- The version is `x.y.z` or `x.y.z-rc.N` with N ≥ 1. Other suffixes are refused.
- `x.y.z` must be newer than the latest release, whether or not it carries a suffix.
- A candidate's N must be higher than every open candidate of the same release.
- While candidates of release A are open, preparing anything other than A or another candidate of A is refused, naming A's candidates. A 0.23.1 patch would otherwise take the 1.0 fragments. Removing the sections by hand abandons the candidates.

These checks run before the gates and before any file is written.

## D4: Gates on a candidate

The gates run for the base version `x.y.z`, so `1.0.0-rc.1` meets the same rules as `1.0.0`, with two exceptions that need the owner's own devices:

- **Reference-device record** (`checkDeviceRecord`): any problem, missing or over budget, becomes the warning `reference-device record pending, required for x.y.z: …`.
- **Screen-reader passes** (`checkAccessibilityAudit`): pending NVDA, VoiceOver (macOS and iOS shell) and TalkBack cells on core screens become one warning that gives the count, the screens, the passes and the audit file. The keyboard and zoom passes need no special device and stay strict. So do a missing core row, a missing audit and an audit more than 12 months old.

The upgrade fixture, screenshot freshness, the security review rule and the migration matrix dates stay strict. The matrix is checked against the candidate's date, so it passes only while the dates are recent enough. The final release is strict on everything, as before. `prepare()` returns the warnings, and the command prints each one as `warning: …`.

## D5: The release workflow

A candidate tag already skipped `stable` and the line tags (the metadata action gives a pre-release only its `{{version}}` tag), the Helm chart (`helm.yml`), Google Play (`play`) and F-Droid, whose update check matches only `^v[0-9.]+$`. The Home Assistant add-on repository follows GitHub's latest release, which is never a pre-release. Two jobs still ran:

- `claude-plugin` pushed `deploy/claude-plugin/upstream/` to the marketplace repository and tagged it with the candidate, which would offer a candidate to every plugin user, with a manifest that names the previous release (D1).
- `obsidian-plugin` pushed to the repository Obsidian installs from, and `obsidian/scripts/mirror.mjs` refuses a version that is not `X.Y.Z`, so the job would fail after the release was published.

Both now run only for a tag without `-`, like `play`.

## Data model and size

No data model change. Node scripts and a workflow condition only, with no effect on the binary, the image or the web bundle.
