## Why

A new version's changes live in `CHANGELOG.md` on GitHub, on the website, and as a link to X from Settings → About. Someone running their own server never sees them unless they leave the app. The app cannot ask the network what is new: it already promises no phone-home. The notes for a version can travel inside the binary the operator chose to install, and a person can turn the "something is new" mark off in one place.

## What Changes

- Settings → About gains a What's new card. It lists one short English entry per version, newest first, compiled into the app. The newest is shown in full; earlier ones sit behind a closed "Earlier versions" disclosure, so About stays within the page-length limit. Each entry is the version, the date, a few sentences, and a link to that version's GitHub release, opened in a new tab only when chosen.
- A dot on the card, and on About in the settings list, appears when this server's version has an entry the person has not opened. The first row is a switch labelled "Version notices" (the settings-copy limit is four words; its description says a dot appears when this version has notes not yet opened), on by default, remembered on this device. Off removes the dots and leaves the entries.
- When the language is not English, the page starts with a note in that language that the entries are in English, the same way Help does.
- The About row that opens X is renamed so "news" means this page. Search for the X account still finds it.
- A release check requires a `news/<version>.md` for every changelog version from the first one that has an entry. Older versions are not backfilled.

Out of scope: fetching news or checking for updates, a dialog or banner on Today, a dot on the main sidebar, translating entry bodies, an owner switch to hide news, and syncing the "seen" marker. Advances no ROADMAP.md item. No new environment variable, no op log change, no new API route.

## Capabilities

### New Capabilities

- `whats-new`: entries shipped with the version, the page, the dot, and the device switch.

### Modified Capabilities

- `settings-navigation`: About links to What's new, and the X row is no longer named News and updates.
- `localization`: news entries stay English and the page says so, as Help does.

## Impact

- A `news/` directory, a build step beside `make templates`, and a generated JSON file loaded only when the page opens.
- Settings → About, the settings search index, `docs/feedback-and-support.md`.
- No server code. No dependency. The first load does not include the entries.
