# What's new

One file per released version, `<version>.md`, shown on Settings → About under **What's new** (OpenSpec change `whats-new`). The app ships with these entries; it never fetches them.

```markdown
---
version: 0.20.0
date: 2026-11-10
---
Plain text, at most four sentences. It is shown as written.
```

- `version` is the released version, `x.y.z`, and the file name is `<version>.md`.
- `date` is the release date, `YYYY-MM-DD`.
- The body is English. The app says so in other languages.
- No links, no lists: the body is plain text.
- Versions from before the first file here have no entry, and that is intentional. Do not backfill history.
- When a `## [x.y.z]` section in `CHANGELOG.md` is newer than the first file here, it needs its `<version>.md`.

Build and check:

```sh
node scripts/news-build.mjs        # writes web/src/generated/news.json and newsLatest.json
make news-check                    # the tests, the changelog rule and a current build
```
