# Proposal

## Why

Settings → About → What's new has said "Nothing new in this version yet" on every release since the card shipped (#2140). The card works; nothing was ever written for it. `news/` holds no entry, and `make news-check` only asks for one once the first file exists, so a release can never start the series by itself. Releases 1.9.0 to 1.11.0 have notes on GitHub and none in the app.

## What Changes

- **The newest release always has its entry.** `make news-check` fails while the newest released `## [x.y.z]` section in `CHANGELOG.md` has no `news/x.y.z.md`, whether or not `news/` holds other files. The rule that every release newer than the first file needs its entry stays as it is.
- **Released facts only.** `make news-check` refuses an entry for a version `CHANGELOG.md` has not released (a release candidate's section does not count).
- **`news/1.11.0.md`**, the 1.11.0 summary, starts the series. Older releases stay without an entry, as before: history is not backfilled.
- `RELEASING.md` and `news/README.md` name the entry as a step of a release, next to its summary.

Out of scope: the card, the dot and the switch, which are unchanged; fetching notes from GitHub, which the spec forbids; a build reporting a preview version (`dev+…`), which still shows the newest entry and no dot.

Advances no ROADMAP item; it fixes the What's new card (#2140).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `whats-new`: every release from the first entry on has one, and the newest release always has one.

## Impact

- `scripts/news-build.mjs`, `scripts/news-check.test.mjs`
- `news/1.11.0.md`, `news/README.md`, `RELEASING.md`
- `web/src/generated/news.json`, `web/src/generated/newsIndex.json` (generated)
- No server, API or data change.
