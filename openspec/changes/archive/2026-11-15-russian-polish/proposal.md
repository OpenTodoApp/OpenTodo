## Why

Russian and Polish have many self-hosting readers and no OpenTodo interface. No native reviewer has signed up yet, and waiting for one keeps both languages out for months. The maintainer decided that these two catalogs may start as machine drafts, as Simplified Chinese did, shipped as community languages and reviewed by native speakers as they sign up (the call for reviewers is out).

## What Changes

- Russian (`ru`, Русский) and Polish (`pl`, Polski) web catalogs, complete, listed as community languages: Settings lists them after the maintained languages with the community caption, and anything outside the web app (emails, channel messages, the native shells, the extension, quick add) stays English.
- The localization spec allows a machine draft for these two catalogs, as it does for Simplified Chinese, with a review by a speaker afterwards. The translation guide says the same, and its maintainer table lists both as machine drafts looking for a reviewer.

## Capabilities

### Modified Capabilities

- `localization`: "Shipped languages and their catalogs" allows machine drafts for Russian and Polish; both ship as community languages.

## Impact

- `web/src/locales/ru.json`, `pl.json` (two lazily loaded chunks, nothing on first load), `web/src/locales/index.ts`, `docs/translating.md`, `docs/contributing/add-a-language.md`, `docs/language.md`, a changelog fragment.
- No new dependency, no server change.
