# The version opens the changelog

## Why

The version today lives only in the About card's description sentence, and only while the
server is online, so a reader who wants to know what they run has nowhere to look. What
changed in it is on the website, which already renders every release with its summary, its
section headings and its `docs/…` links resolved — but nothing in the app points there.

## What Changes

- **Settings → About gains a Version row, and its value opens the published changelog.** The
  row's control is the version number itself — the server's while online, this build's
  otherwise — as a link to `https://open-todo.app/changelog/`, at the release the client
  runs: the site anchors every release (`#v1-0-0`), so the reader lands on what changed in
  their version with the whole history below it. A value without an anchor, such as a
  development build or a release candidate, opens the page's newest release. The settings
  search finds the row under "version", "changelog", "release notes" and "what is new".
- **The app carries no changelog of its own.** Nothing is generated, committed or checked,
  and `make release-prepare` rewriting `CHANGELOG.md` cannot leave a stale copy behind; the
  website keeps rendering the summaries, the headings and the links. The row costs the
  bundle one anchor element and no chunk.

## Out of scope

- No in-app renderer, dialog or drawer: this is a link, like the Website, Docs and GitHub
  rows beside it.
- No update check against GitHub's releases API: the version row reports what the build and
  the server run, and links out for anything more.
- Nothing in the op log, the API or the sync protocol changes.

## Impact

- Web app: `web/src/app/AboutSection.tsx` (the Version row and `changelogUrl()`),
  `web/src/lib/settingsCopy.ts` and `web/src/app/settingsIndex.ts` (the row's copy and its
  search entry).
- Build: `web/vite.config.ts` inlines the build's version as `__APP_VERSION__` (declared in
  `web/src/globals.d.ts`), so the row has a number offline without importing `package.json`
  and its scripts into the bundle.
- Tests: `web/src/app/aboutVersion.test.tsx` — the anchor for a release, the fallback for a
  version the site has no anchor for, the server's value once known, and the search entry.
- Copy: two messages, in every shipped language.
- Docs: one `changelog.d` entry; the guides already describe the About section.
